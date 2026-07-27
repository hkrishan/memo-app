/**
 * PhotoViewer Component
 * iPhone-Photos-style fullscreen media viewer.
 *
 * - Horizontal paged FlatList opened at the tapped grid index
 * - Photos: pinch-to-zoom (focal-point aware), pan while zoomed,
 *   double-tap zoom, vertical pan-to-dismiss at 1x
 * - Videos: expo-video with CUSTOM chrome (no native controls): the active
 *   page autoplays with sound, taps toggle the viewer chrome exactly like
 *   photo pages, a center play/pause button flashes on tap, and a scrub
 *   bar (time labels + drag-to-seek + mute) sits in the bottom chrome just
 *   above the filmstrip, fading with the rest of the chrome
 * - Zoom transition: a transform-only "aspect-morph" flight. The overlay is
 *   two nested views with FIXED layout — an outer clipping "window" laid out
 *   at the aspect-fitted fullscreen rect, and an inner cover-fit image laid
 *   out at the fitted size. A single progress shared value drives worklets
 *   that translate/scale the window along the lerped rect while the inner
 *   image counter-scales so it never distorts. No layout props animate, no
 *   React re-render happens mid-flight, and the pager is not even mounted
 *   during the open flight (it mounts at landing, under the held overlay,
 *   which fades once the active page's image has painted).
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  ListRenderItemInfo,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import dayjs from "dayjs";
import { stableCacheKey } from "@/lib/imageCache";
import { MediaAsset, useResolvedAssetUri } from "@/features/album/hooks";
import { Filmstrip, FILMSTRIP_HEIGHT } from "./Filmstrip";
import { Frame } from "./types";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
// Corner rounding of the photo while it's being dragged away — reaches
// full radius within the first stretch of the drag (iOS Photos feel)
/**
 * Corner rounding of the opened photo at rest. The open flight morphs the
 * grid cell's corners into this, and the drag-to-dismiss rounding grows
 * from here toward DISMISS_RADIUS. Photos only — video pages render square.
 */
const PAGE_RADIUS = 12;
const DISMISS_RADIUS = 24;
const DISMISS_RADIUS_TRAVEL = 100;
// Longest the open flight waits for an overlay image to paint before
// starting anyway — remote thumbnails can outlive the two-frame head start
const OPEN_FLIGHT_PAINT_CAP_MS = 150;
const SPRING_CONFIG = { damping: 30, stiffness: 300, mass: 0.6 };
/** How far the chrome gradient extends below the chrome content row. */
const CHROME_GRADIENT_EXTENSION = 36;
/**
 * How far the filmstrip's scrim rises above the strip — tall enough that
 * the fade dissolves into the photo instead of reading as a banner edge.
 */
const BOTTOM_CHROME_GRADIENT_EXTENSION = 110;
/** Grid cell → fullscreen expansion. */
const OPEN_FLIGHT_DURATION = 300;
/**
 * After landing, the overlay is held above the freshly-mounted pager until
 * the active page's image paints (onLoad) — this cap drops it regardless,
 * so a failed load can never pin the overlay forever.
 */
const OPEN_OVERLAY_HOLD_CAP = 400;
/** Crossover fade of the held overlay once the pager has painted. */
const OPEN_OVERLAY_FADE_DURATION = 80;
/**
 * Slightly underdamped return spring (~0.77 damping ratio) — the photo
 * dips just past the cell and settles back, a soft landing bounce.
 */
const RETURN_SPRING = {
  damping: 22,
  stiffness: 340,
  mass: 0.6,
  overshootClamping: false,
};
/** How long getReturnFrame may take before the dismiss falls back. */
const RETURN_FRAME_TIMEOUT = 350;

const clamp = (value: number, min: number, max: number): number => {
  "worklet";
  return Math.min(Math.max(value, min), max);
};

/**
 * Max pannable offset from center at a given scale, based on the
 * aspect-fitted ("contain") display size of the image — a fitted edge that
 * is smaller than the page never pans, so its bound stays 0.
 */
const panBounds = (
  scale: number,
  fittedWidth: number,
  fittedHeight: number,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number } => {
  "worklet";
  return {
    x: Math.max(0, (fittedWidth * scale - pageWidth) / 2),
    y: Math.max(0, (fittedHeight * scale - pageHeight) / 2),
  };
};

/**
 * Aspect-fitted ("contain") rect of an asset centered in a box. At this
 * rect a cover-fit image renders identically to the pager's contain-fit
 * page, which is what makes the flight crossovers seamless.
 */
const fitRect = (
  assetWidth: number,
  assetHeight: number,
  boxWidth: number,
  boxHeight: number,
): Frame => {
  if (assetWidth <= 0 || assetHeight <= 0) {
    return { x: 0, y: 0, width: boxWidth, height: boxHeight };
  }
  const scale = Math.min(boxWidth / assetWidth, boxHeight / assetHeight);
  const width = assetWidth * scale;
  const height = assetHeight * scale;
  return {
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
    width,
    height,
  };
};

/**
 * Uniform scale that re-fits an asset's fullscreen contain-rect into the
 * chrome-fitted box (the area between the top bar and the filmstrip).
 * Width-constrained (landscape) photos that already clear the strip keep
 * scale 1 — only the constrained dimension shrinks the photo.
 */
const chromeFitScale = (
  assetWidth: number,
  assetHeight: number,
  pageW: number,
  pageH: number,
  availableHeight: number,
): number => {
  if (availableHeight >= pageH) return 1;
  if (!(assetWidth > 0 && assetHeight > 0)) return availableHeight / pageH;
  const full = Math.min(pageW / assetWidth, pageH / assetHeight);
  const avail = Math.min(pageW / assetWidth, availableHeight / assetHeight);
  return full > 0 ? avail / full : 1;
};

/** Resolves null if `promise` has not settled within `ms`. */
const withTimeoutNull = <T,>(
  promise: Promise<T | null>,
  ms: number,
): Promise<T | null> =>
  Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);

/**
 * The grid's (already painted, so already cached) thumbnail, layered under
 * the full-res image while it streams in — server-backed assets must never
 * show as a black rectangle. Same-URI assets (device library) skip the
 * underlay entirely.
 */
const thumbnailUnderlayUri = (asset: MediaAsset): string | undefined =>
  asset.thumbnailUrl && asset.thumbnailUrl !== asset.uri
    ? asset.thumbnailUrl
    : undefined;

/** Remote media is worth keeping on disk; local URIs stay memory-only. */
const cachePolicyFor = (uri: string): "memory-disk" | "memory" =>
  uri.startsWith("http") ? "memory-disk" : "memory";

/**
 * What the flight overlay's Image should fly. Photos fly their full-res
 * URI; videos fly their POSTER — pointing expo-image at a remote video
 * file would download it only to fail decoding. (Local library video uris
 * render as poster frames, so they are safe as-is.)
 */
const flightUriFor = (asset: MediaAsset): string =>
  asset.mediaType === "video" ? (asset.thumbnailUrl ?? asset.uri) : asset.uri;

// ---------------------------------------------------------------------------
// Photo page (zoomable)
// ---------------------------------------------------------------------------

interface PhotoPageProps {
  asset: MediaAsset;
  isActive: boolean;
  pageWidth: number;
  pageHeight: number;
  /**
   * 1 while the chrome is visible: the photo scales down and re-centers
   * into the area between the top bar and the filmstrip, so the full image
   * is visible with the strip below it (iPhone-Photos style).
   */
  chromeFit: SharedValue<number>;
  /** Height of the chrome-fitted box the photo shrinks into. */
  fitAvailableHeight: number;
  /** Vertical offset of that box's center from the page center. */
  fitOffsetY: number;
  backdropOpacity: SharedValue<number>;
  onToggleChrome: () => void;
  onZoomChange: (zoomed: boolean) => void;
  /**
   * Called when a pan release qualifies as a dismiss. The page freezes at
   * the release position; the parent captures that rect (translation +
   * shrink scale) and flies it home in an overlay.
   */
  onRequestDismiss: (
    translationX: number,
    translationY: number,
    releaseScale: number,
    releaseRadius: number,
    velocityY: number,
  ) => void;
  /**
   * A 1x vertical drag (a potential dismiss) just activated — the parent
   * prefetches the return frame now, while the backdrop still hides the
   * grid, so the release never has to await it.
   */
  onDismissPanStart: () => void;
  /** The drag ended without dismissing — any prefetched frame is stale. */
  onDismissPanEnd: () => void;
  /**
   * The page painted something (expo-image onLoad of the full-res image OR
   * its thumbnail underlay). Passed only to the active page — the parent
   * uses it to fade out the held open-flight overlay at the exact moment
   * the pager underneath can no longer show a blank frame.
   */
  onFirstImageLoad?: () => void;
  /** Double-tap at 1x (album context: like). See doubleTapGesture. */
  onDoubleTapLike?: () => void;
}

const PhotoPage = memo<PhotoPageProps>(
  ({
    asset,
    isActive,
    pageWidth,
    pageHeight,
    chromeFit,
    fitAvailableHeight,
    fitOffsetY,
    backdropOpacity,
    onToggleChrome,
    onZoomChange,
    onRequestDismiss,
    onDismissPanStart,
    onDismissPanEnd,
    onFirstImageLoad,
    onDoubleTapLike,
  }) => {
    // Local mirror of "scale > 1" so gesture configs (offsets) can be
    // rebuilt when zoom starts/ends; the parent uses onZoomChange to
    // disable FlatList paging at the same time.
    const [isZoomed, setIsZoomed] = useState(false);
    const isZoomedRef = useRef(false);

    // Which URI the full-res Image has painted — compared against the
    // current asset.uri (not a boolean) so a URI change can never leave the
    // underlay wrongly hidden behind a stale flag
    const [loadedUri, setLoadedUri] = useState<string | null>(null);
    const thumbUri = thumbnailUnderlayUri(asset);
    const showThumbUnderlay = thumbUri != null && loadedUri !== asset.uri;

    // Full-res fetch+decode is deferred to pages the user actually lands
    // on — the pager keeps neighbor pages mounted, and loading three
    // full-res images per swipe is what makes large albums stutter.
    // Neighbors paint their (640px) thumbnail; the full image sharpens in
    // on settle. Pages with no distinct thumbnail (device library) load
    // immediately — they'd otherwise render blank. Once active, a page
    // keeps its full-res through later swipes so paging back is instant.
    const [reachedActive, setReachedActive] = useState(isActive);
    useEffect(() => {
      if (isActive) {
        setReachedActive(true);
      }
    }, [isActive]);
    const showFullRes = reachedActive || thumbUri == null;

    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);
    const focalOffsetX = useSharedValue(0);
    const focalOffsetY = useSharedValue(0);
    // Dismiss drag offset: activation is vertical (so horizontal swipes
    // still page the FlatList), but once active the photo follows the
    // finger on both axes
    const dismissTranslateX = useSharedValue(0);
    const dismissTranslateY = useSharedValue(0);
    // While a pinch owns translateX/Y the pan must not also write them —
    // both writing with different formulas causes jumps and jitter
    const pinchActive = useSharedValue(false);
    // Set when a pinch happened during the current pan gesture; the pan's
    // dismiss logic must then be skipped (its translation includes pinch
    // movement) and its baseline offset re-anchored after the pinch ends
    const pinchedDuringPan = useSharedValue(false);
    const panBaseTranslationX = useSharedValue(0);
    const panBaseTranslationY = useSharedValue(0);

    // Aspect-fit ("contain") display size of the photo inside the page.
    // Guards zero-sized asset metadata by falling back to the page size.
    const { width: fittedWidth, height: fittedHeight } = useMemo(() => {
      if (asset.width <= 0 || asset.height <= 0) {
        return { width: pageWidth, height: pageHeight };
      }
      const fitScale = Math.min(
        pageWidth / asset.width,
        pageHeight / asset.height,
      );
      return {
        width: asset.width * fitScale,
        height: asset.height * fitScale,
      };
    }, [asset.width, asset.height, pageWidth, pageHeight]);

    const setZoomed = useCallback(
      (zoomed: boolean) => {
        isZoomedRef.current = zoomed;
        setIsZoomed(zoomed);
        onZoomChange(zoomed);
      },
      [onZoomChange],
    );

    const handleFullImageLoad = useCallback(() => {
      setLoadedUri(asset.uri);
      onFirstImageLoad?.();
    }, [asset.uri, onFirstImageLoad]);

    // Full-res load failed (expired signed URL, network blip). Without this
    // the page silently stays on the blurry thumbnail underlay forever.
    // Retry by remounting the Image a few times with backoff — and once the
    // parent query refetches (fresh signature), the new asset.uri reloads
    // too. Cached images never reach here (served from disk).
    const [fullResRetry, setFullResRetry] = useState(0);
    const retryCountRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleFullImageError = useCallback(() => {
      if (retryCountRef.current >= 3) return;
      retryCountRef.current += 1;
      const attempt = retryCountRef.current;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(
        () => setFullResRetry((n) => n + 1),
        400 * attempt,
      );
    }, []);
    // A fresh URI (query refetched) resets the retry budget
    useEffect(() => {
      retryCountRef.current = 0;
      return () => {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      };
    }, [asset.uri]);

    // Reset transforms whenever this page stops being the active one so
    // swiping back to it always shows a clean 1x photo. Uses setZoomed so
    // the parent's onZoomChange re-enables FlatList paging too — but only
    // when this page actually was zoomed, so a neighbour page mounting
    // while the user is zoomed can't spuriously re-enable the pager.
    useEffect(() => {
      if (!isActive) {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        dismissTranslateX.value = 0;
        dismissTranslateY.value = 0;
        if (isZoomedRef.current) {
          setZoomed(false);
        }
      }
    }, [
      isActive,
      scale,
      translateX,
      translateY,
      dismissTranslateX,
      dismissTranslateY,
      setZoomed,
    ]);

    const pinchGesture = useMemo(
      () =>
        Gesture.Pinch()
          .onStart((e) => {
            pinchActive.value = true;
            pinchedDuringPan.value = true;
            // A second finger joining a dismiss drag hands control to the
            // pinch and the pan's onEnd early-returns — undo the drag's
            // offset and backdrop fade here or they would stick
            if (
              dismissTranslateX.value !== 0 ||
              dismissTranslateY.value !== 0
            ) {
              dismissTranslateX.value = 0;
              dismissTranslateY.value = 0;
              backdropOpacity.value = withSpring(1, SPRING_CONFIG);
            }
            savedScale.value = scale.value;
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            focalOffsetX.value = e.focalX - pageWidth / 2;
            focalOffsetY.value = e.focalY - pageHeight / 2;
          })
          .onUpdate((e) => {
            // Allow squishing below 1x with resistance; snapped back on end
            const next = clamp(savedScale.value * e.scale, 0.5, MAX_SCALE);
            const factor = next / savedScale.value;
            scale.value = next;
            // Keep the pinch focal point glued to the same spot in the
            // image: scale about the start focal, then follow the fingers —
            // moving both fingers pans the photo mid-pinch (iOS Photos
            // behavior)
            const focalTravelX =
              e.focalX - pageWidth / 2 - focalOffsetX.value;
            const focalTravelY =
              e.focalY - pageHeight / 2 - focalOffsetY.value;
            translateX.value =
              savedTranslateX.value * factor +
              focalOffsetX.value * (1 - factor) +
              focalTravelX;
            translateY.value =
              savedTranslateY.value * factor +
              focalOffsetY.value * (1 - factor) +
              focalTravelY;
          })
          .onEnd(() => {
            pinchActive.value = false;
            if (scale.value <= MIN_SCALE) {
              scale.value = withSpring(MIN_SCALE, SPRING_CONFIG);
              translateX.value = withSpring(0, SPRING_CONFIG);
              translateY.value = withSpring(0, SPRING_CONFIG);
              savedTranslateX.value = 0;
              savedTranslateY.value = 0;
              runOnJS(setZoomed)(false);
            } else {
              const bounds = panBounds(
                scale.value,
                fittedWidth,
                fittedHeight,
                pageWidth,
                pageHeight,
              );
              const clampedX = clamp(translateX.value, -bounds.x, bounds.x);
              const clampedY = clamp(translateY.value, -bounds.y, bounds.y);
              translateX.value = withSpring(clampedX, SPRING_CONFIG);
              translateY.value = withSpring(clampedY, SPRING_CONFIG);
              // Re-baseline the pan so a still-active pan (one finger left
              // on screen) continues seamlessly from where the pinch ended
              savedTranslateX.value = clampedX;
              savedTranslateY.value = clampedY;
              runOnJS(setZoomed)(true);
            }
          }),
      [
        scale,
        savedScale,
        translateX,
        translateY,
        savedTranslateX,
        savedTranslateY,
        focalOffsetX,
        focalOffsetY,
        pinchActive,
        pinchedDuringPan,
        dismissTranslateX,
        dismissTranslateY,
        backdropOpacity,
        fittedWidth,
        fittedHeight,
        pageWidth,
        pageHeight,
        setZoomed,
      ],
    );

    const panGesture = useMemo(() => {
      const gesture = Gesture.Pan()
        .maxPointers(2)
        .onStart(() => {
          pinchedDuringPan.value = false;
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
          panBaseTranslationX.value = 0;
          panBaseTranslationY.value = 0;
          if (scale.value <= 1 && !pinchActive.value) {
            // A 1x vertical drag may become a dismiss — have the parent
            // prefetch the return frame while the backdrop still hides
            // the grid (and any scroll it triggers)
            runOnJS(onDismissPanStart)();
          }
        })
        .onUpdate((e) => {
          if (pinchActive.value) {
            // The pinch owns translateX/Y right now. Keep tracking where
            // this pan's cumulative translation stands so the post-pinch
            // deltas are measured from the moment the pinch ended.
            panBaseTranslationX.value = e.translationX;
            panBaseTranslationY.value = e.translationY;
            return;
          }
          if (scale.value > 1) {
            // Pan the zoomed photo within clamped bounds
            const bounds = panBounds(
              scale.value,
              fittedWidth,
              fittedHeight,
              pageWidth,
              pageHeight,
            );
            translateX.value = clamp(
              savedTranslateX.value +
                (e.translationX - panBaseTranslationX.value),
              -bounds.x,
              bounds.x,
            );
            translateY.value = clamp(
              savedTranslateY.value +
                (e.translationY - panBaseTranslationY.value),
              -bounds.y,
              bounds.y,
            );
          } else if (!pinchedDuringPan.value) {
            // Pan-to-dismiss at 1x: activated by a vertical slide, but once
            // active the photo follows the finger on both axes; the fade
            // tracks how far it has travelled in any direction
            dismissTranslateX.value = e.translationX;
            dismissTranslateY.value = e.translationY;
            const travel = Math.sqrt(
              e.translationX * e.translationX +
                e.translationY * e.translationY,
            );
            backdropOpacity.value = interpolate(
              travel,
              [0, pageHeight * 0.4],
              [1, 0.3],
              Extrapolation.CLAMP,
            );
          }
        })
        .onEnd((e) => {
          // A pan that hosted a pinch must never dismiss — its translation
          // includes pinch finger movement, not an intentional drag
          if (scale.value > 1 || pinchActive.value || pinchedDuringPan.value) {
            runOnJS(onDismissPanEnd)();
            return;
          }
          // The drag can end anywhere — distance or speed in any direction
          // qualifies as a dismiss (activation was already vertical-only)
          const travel = Math.sqrt(
            e.translationX * e.translationX + e.translationY * e.translationY,
          );
          const speed = Math.sqrt(
            e.velocityX * e.velocityX + e.velocityY * e.velocityY,
          );
          const shouldDismiss =
            travel > DISMISS_DISTANCE || speed > DISMISS_VELOCITY;
          if (shouldDismiss) {
            // Freeze at the release position and hand off to the parent's
            // dismiss flight — it captures this exact rect (translation +
            // shrink) and flies it back to the grid cell.
            const releaseScale = interpolate(
              travel,
              [0, pageHeight],
              [1, 0.6],
              Extrapolation.CLAMP,
            );
            // Screen-space corner radius at release (the page draws it
            // pre-scale) — the flight overlay starts with the same corners
            const releaseRadius =
              interpolate(
                travel,
                [0, DISMISS_RADIUS_TRAVEL],
                [PAGE_RADIUS, DISMISS_RADIUS],
                Extrapolation.CLAMP,
              ) * releaseScale;
            runOnJS(onRequestDismiss)(
              dismissTranslateX.value,
              dismissTranslateY.value,
              releaseScale,
              releaseRadius,
              e.velocityY,
            );
          } else {
            dismissTranslateX.value = withSpring(0, SPRING_CONFIG);
            dismissTranslateY.value = withSpring(0, SPRING_CONFIG);
            backdropOpacity.value = withSpring(1, SPRING_CONFIG);
            runOnJS(onDismissPanEnd)();
          }
        });

      if (!isZoomed) {
        // At 1x only vertical drags belong to us — horizontal movement
        // must fail fast so the FlatList can page
        gesture.activeOffsetY([-15, 15]);
        gesture.failOffsetX([-15, 15]);
      }
      return gesture;
    }, [
      isZoomed,
      scale,
      translateX,
      translateY,
      savedTranslateX,
      savedTranslateY,
      dismissTranslateX,
      dismissTranslateY,
      backdropOpacity,
      pinchActive,
      pinchedDuringPan,
      panBaseTranslationX,
      panBaseTranslationY,
      fittedWidth,
      fittedHeight,
      pageWidth,
      pageHeight,
      onRequestDismiss,
      onDismissPanStart,
      onDismissPanEnd,
    ]);

    // Double-tap never zooms IN (zooming is pinch-only): at 1x it likes
    // the photo (album context — no-op elsewhere); on a zoomed page it
    // stays the escape hatch back to 1x.
    const doubleTapGesture = useMemo(
      () =>
        Gesture.Tap()
          .numberOfTaps(2)
          .onEnd(() => {
            if (scale.value > 1) {
              scale.value = withSpring(MIN_SCALE, SPRING_CONFIG);
              translateX.value = withSpring(0, SPRING_CONFIG);
              translateY.value = withSpring(0, SPRING_CONFIG);
              runOnJS(setZoomed)(false);
            } else if (onDoubleTapLike) {
              runOnJS(onDoubleTapLike)();
            }
          }),
      [scale, translateX, translateY, setZoomed, onDoubleTapLike],
    );

    const singleTapGesture = useMemo(
      () =>
        Gesture.Tap()
          .numberOfTaps(1)
          .onEnd(() => {
            runOnJS(onToggleChrome)();
          }),
      [onToggleChrome],
    );

    const composedGesture = useMemo(
      () =>
        Gesture.Race(
          Gesture.Simultaneous(pinchGesture, panGesture),
          Gesture.Exclusive(doubleTapGesture, singleTapGesture),
        ),
      [pinchGesture, panGesture, doubleTapGesture, singleTapGesture],
    );

    // Uniform scale that re-fits this photo into the chrome-fitted box
    const fitScaleTarget = useMemo(
      () =>
        chromeFitScale(
          asset.width,
          asset.height,
          pageWidth,
          pageHeight,
          fitAvailableHeight,
        ),
      [asset.width, asset.height, pageWidth, pageHeight, fitAvailableHeight],
    );

    const animatedStyle = useAnimatedStyle(() => {
      // Shrink slightly as the photo is dragged away during dismiss —
      // driven by how far it has travelled in any direction
      const travel = Math.sqrt(
        dismissTranslateX.value * dismissTranslateX.value +
          dismissTranslateY.value * dismissTranslateY.value,
      );
      const dismissScale = interpolate(
        travel,
        [0, pageHeight],
        [1, 0.6],
        Extrapolation.CLAMP,
      );
      // The chrome-fit transform sits inside the dismiss transforms (the
      // drag must track the finger 1:1) and outside pan/zoom
      const cf = chromeFit.value;
      return {
        transform: [
          { translateX: dismissTranslateX.value },
          { translateY: dismissTranslateY.value },
          { scale: dismissScale },
          { translateY: fitOffsetY * cf },
          { scale: 1 + (fitScaleTarget - 1) * cf },
          { translateX: translateX.value },
          { translateY: translateY.value },
          { scale: scale.value },
        ],
      };
    });

    // Rounds the photo's corners: PAGE_RADIUS at rest, growing as it's
    // dragged away. The clip box hugs the fitted photo rect (a radius on
    // the fullscreen page would clip thin air in the letterbox areas).
    const dismissClipStyle = useAnimatedStyle(() => {
      const travel = Math.sqrt(
        dismissTranslateX.value * dismissTranslateX.value +
          dismissTranslateY.value * dismissTranslateY.value,
      );
      return {
        borderRadius: interpolate(
          travel,
          [0, DISMISS_RADIUS_TRAVEL],
          [PAGE_RADIUS, DISMISS_RADIUS],
          Extrapolation.CLAMP,
        ),
      };
    });

    return (
      <GestureDetector gesture={composedGesture}>
        <View style={[styles.page, { width: pageWidth }]}>
          <Animated.View
            style={[styles.pageMedia, styles.pageMediaCenter, animatedStyle]}
          >
            <Animated.View
              style={[
                styles.fittedClip,
                { width: fittedWidth, height: fittedHeight },
                dismissClipStyle,
              ]}
            >
              {/* Both layers contain-fit the same rect and the thumbnail
                  preserves the aspect ratio, so the full-res paints over the
                  underlay in exactly the same framing — a sharpen, not a jump */}
              {showThumbUnderlay && (
                <Image
                  source={{ uri: thumbUri, cacheKey: stableCacheKey(thumbUri) }}
                  style={styles.media}
                  contentFit="contain"
                  recyclingKey={`${asset.id}-thumb`}
                  cachePolicy="memory-disk"
                  transition={0}
                  onLoad={onFirstImageLoad}
                />
              )}
              {showFullRes && (
                <Image
                  // Remount on retry (key) to re-attempt a failed load
                  key={`${asset.id}-full-${fullResRetry}`}
                  source={{ uri: asset.uri, cacheKey: stableCacheKey(asset.uri) }}
                  style={styles.media}
                  contentFit="contain"
                  recyclingKey={asset.id}
                  cachePolicy={cachePolicyFor(asset.uri)}
                  transition={0}
                  // The sharpen the user is actively waiting on — it must
                  // outrank grid/filmstrip thumbnail traffic
                  priority="high"
                  onLoad={handleFullImageLoad}
                  onError={handleFullImageError}
                />
              )}
            </Animated.View>
          </Animated.View>
        </View>
      </GestureDetector>
    );
  },
);
PhotoPage.displayName = "PhotoPage";

// ---------------------------------------------------------------------------
// Video page (custom chrome — native controls are OFF)
// ---------------------------------------------------------------------------

/**
 * Height of the video scrub-bar row the viewer seats just above the
 * filmstrip. The social overlay's bottomInset accounts for it on video
 * pages so the like/comment bar never collides with the scrubber.
 */
const VIDEO_CONTROLS_HEIGHT = 38;
/** How long the center play/pause button lingers after a tap mid-playback. */
const VIDEO_CENTER_FLASH_MS = 1600;

/** m:ss playback time label (durations here are well under an hour). */
const formatPlaybackTime = (seconds: number): string => {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/**
 * The image that stands in for the video before its first frame renders.
 * Remote videos use their poster (thumbnailUrl); local library videos'
 * ph://-style uris render as poster frames directly. A remote video with
 * no poster has NO renderable image — null yields the dark fallback tile.
 */
const videoPosterUri = (asset: MediaAsset): string | null => {
  if (asset.thumbnailUrl && asset.thumbnailUrl !== asset.uri) {
    return asset.thumbnailUrl;
  }
  return asset.uri.startsWith("http") ? null : asset.uri;
};

interface VideoPageProps {
  asset: MediaAsset;
  isActive: boolean;
  pageWidth: number;
  pageHeight: number;
  /** See PhotoPageProps — videos re-fit above the filmstrip the same way. */
  chromeFit: SharedValue<number>;
  fitAvailableHeight: number;
  fitOffsetY: number;
  /** Session-wide mute state, applied when this page starts playing. */
  muted: boolean;
  backdropOpacity: SharedValue<number>;
  /** Tap on the video surface — toggles the chrome, like photo pages. */
  onToggleChrome: () => void;
  /** See PhotoPageProps — the pan-to-dismiss handoff works identically. */
  onRequestDismiss: (
    translationX: number,
    translationY: number,
    releaseScale: number,
    releaseRadius: number,
    velocityY: number,
  ) => void;
  onDismissPanStart: () => void;
  onDismissPanEnd: () => void;
  /**
   * Hands the live player to the viewer while this page is active, so the
   * chrome's scrub bar / mute control drive it. Called with active=false
   * (same player) when the page deactivates or unmounts.
   */
  onActivePlayerChange: (player: VideoPlayer, active: boolean) => void;
  /** The poster painted — see PhotoPageProps.onFirstImageLoad. */
  onFirstImageLoad?: () => void;
}

const VideoPage = memo<VideoPageProps>(
  ({
    asset,
    isActive,
    pageWidth,
    pageHeight,
    chromeFit,
    fitAvailableHeight,
    fitOffsetY,
    muted,
    backdropOpacity,
    onToggleChrome,
    onRequestDismiss,
    onDismissPanStart,
    onDismissPanEnd,
    onActivePlayerChange,
    onFirstImageLoad,
  }) => {
    // ph:// URIs are not reliably playable — resolve to a local file URI
    const { resolvedUri } = useResolvedAssetUri({
      assetId: asset.id,
      uri: asset.uri,
      enabled: isActive,
    });

    // Only the active page gets a real source; inactive pages hold a null
    // source so nothing plays (and the player is released on unmount)
    const player = useVideoPlayer(isActive ? resolvedUri : null, (p) => {
      p.loop = false;
    });

    const { isPlaying } = useEvent(player, "playingChange", {
      isPlaying: player.playing,
    });

    // Mute changes are applied by the chrome's mute button directly on the
    // player; the prop only seeds newly-activated pages — a ref keeps it
    // from replaying the autoplay effect
    const mutedRef = useRef(muted);
    mutedRef.current = muted;

    useEffect(() => {
      if (isActive && resolvedUri) {
        // Autoplay with sound (unless the session was muted)
        try {
          player.muted = mutedRef.current;
          player.play();
        } catch {
          // Player may already be released during unmount/recycle
        }
      }
      if (!isActive) {
        // Swiped away or the viewer is dismissing — stop the audio with it
        try {
          player.pause();
        } catch {
          // Player may already be released during unmount/recycle
        }
      }
    }, [isActive, resolvedUri, player]);

    // Register the live player with the viewer chrome while active
    useEffect(() => {
      if (!isActive || !resolvedUri) return;
      onActivePlayerChange(player, true);
      return () => onActivePlayerChange(player, false);
    }, [isActive, resolvedUri, player, onActivePlayerChange]);

    // The poster stays on top until the video's first frame has rendered,
    // so the page never flashes black while the player loads
    const [firstFrameRendered, setFirstFrameRendered] = useState(false);
    useEffect(() => {
      if (!isActive) {
        setFirstFrameRendered(false);
      }
    }, [isActive]);
    const handleFirstFrame = useCallback(() => {
      setFirstFrameRendered(true);
    }, []);

    // Center play/pause: visible whenever paused, and briefly after a tap
    // while playing (so pause is always reachable)
    const [centerFlash, setCenterFlash] = useState(false);
    const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
      () => () => {
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      },
      [],
    );
    const flashCenterButton = useCallback(() => {
      setCenterFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        flashTimerRef.current = null;
        setCenterFlash(false);
      }, VIDEO_CENTER_FLASH_MS);
    }, []);

    // Taps behave exactly like photo pages (chrome toggle); the center
    // button additionally flashes so playback stays one tap away
    const handleSurfaceTap = useCallback(() => {
      onToggleChrome();
      flashCenterButton();
    }, [onToggleChrome, flashCenterButton]);

    const handlePlayPause = useCallback(() => {
      try {
        if (player.playing) {
          player.pause();
        } else {
          // Replay from the start when the video ran to its end
          if (
            player.duration > 0 &&
            player.currentTime >= player.duration - 0.05
          ) {
            player.currentTime = 0;
          }
          player.play();
          flashCenterButton();
        }
      } catch {
        // Player may already be released during unmount/recycle
      }
    }, [player, flashCenterButton]);

    const showPlayer = isActive && !!resolvedUri;
    const posterUri = videoPosterUri(asset);
    const showCenterButton = showPlayer && (!isPlaying || centerFlash);

    // Pan-to-dismiss, same feel as photo pages: vertical activation (so
    // horizontal swipes still page), then the video follows the finger on
    // both axes while the backdrop fades. The video keeps playing during
    // the drag; the parent pauses it the moment a release qualifies
    // (phase "dismissing" deactivates the page).
    const dismissTranslateX = useSharedValue(0);
    const dismissTranslateY = useSharedValue(0);

    useEffect(() => {
      if (!isActive) {
        dismissTranslateX.value = 0;
        dismissTranslateY.value = 0;
      }
    }, [isActive, dismissTranslateX, dismissTranslateY]);

    const dismissPanGesture = useMemo(
      () =>
        Gesture.Pan()
          .maxPointers(1)
          // Vertical drags belong to us; horizontal movement must fail
          // fast so the FlatList can page
          .activeOffsetY([-15, 15])
          .failOffsetX([-15, 15])
          .onStart(() => {
            runOnJS(onDismissPanStart)();
          })
          .onUpdate((e) => {
            dismissTranslateX.value = e.translationX;
            dismissTranslateY.value = e.translationY;
            const travel = Math.sqrt(
              e.translationX * e.translationX +
                e.translationY * e.translationY,
            );
            backdropOpacity.value = interpolate(
              travel,
              [0, pageHeight * 0.4],
              [1, 0.3],
              Extrapolation.CLAMP,
            );
          })
          .onEnd((e) => {
            const travel = Math.sqrt(
              e.translationX * e.translationX +
                e.translationY * e.translationY,
            );
            const speed = Math.sqrt(
              e.velocityX * e.velocityX + e.velocityY * e.velocityY,
            );
            const shouldDismiss =
              travel > DISMISS_DISTANCE || speed > DISMISS_VELOCITY;
            if (shouldDismiss) {
              const releaseScale = interpolate(
                travel,
                [0, pageHeight],
                [1, 0.6],
                Extrapolation.CLAMP,
              );
              // Videos render (and fly) square — release radius 0 keeps
              // the flight overlay's corners consistent with the page
              runOnJS(onRequestDismiss)(
                dismissTranslateX.value,
                dismissTranslateY.value,
                releaseScale,
                0,
                e.velocityY,
              );
            } else {
              dismissTranslateX.value = withSpring(0, SPRING_CONFIG);
              dismissTranslateY.value = withSpring(0, SPRING_CONFIG);
              backdropOpacity.value = withSpring(1, SPRING_CONFIG);
              runOnJS(onDismissPanEnd)();
            }
          }),
      [
        dismissTranslateX,
        dismissTranslateY,
        backdropOpacity,
        pageHeight,
        onRequestDismiss,
        onDismissPanStart,
        onDismissPanEnd,
      ],
    );

    const fitScaleTarget = useMemo(
      () =>
        chromeFitScale(
          asset.width,
          asset.height,
          pageWidth,
          pageHeight,
          fitAvailableHeight,
        ),
      [asset.width, asset.height, pageWidth, pageHeight, fitAvailableHeight],
    );

    const fitStyle = useAnimatedStyle(() => {
      // Shrink slightly as the video is dragged away, exactly like the
      // photo pages; the chrome-fit transform rides inside the dismiss
      // transforms so the drag tracks the finger 1:1
      const travel = Math.sqrt(
        dismissTranslateX.value * dismissTranslateX.value +
          dismissTranslateY.value * dismissTranslateY.value,
      );
      const dismissScale = interpolate(
        travel,
        [0, pageHeight],
        [1, 0.6],
        Extrapolation.CLAMP,
      );
      const cf = chromeFit.value;
      return {
        transform: [
          { translateX: dismissTranslateX.value },
          { translateY: dismissTranslateY.value },
          { scale: dismissScale },
          { translateY: fitOffsetY * cf },
          { scale: 1 + (fitScaleTarget - 1) * cf },
        ],
      };
    });

    return (
      <GestureDetector gesture={dismissPanGesture}>
      <View style={[styles.page, { width: pageWidth }]}>
        {/* Plain Pressables handle taps (the pan cancels them once it
            activates): the surface toggles the chrome, the nested center
            button wins its own taps, and the pager's horizontal swipes
            are untouched */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleSurfaceTap}
          accessibilityLabel="Video"
        >
          <Animated.View
            style={[styles.pageMedia, fitStyle]}
            pointerEvents="box-none"
          >
            {showPlayer && (
              <VideoView
                player={player}
                style={styles.media}
                contentFit="contain"
                nativeControls={false}
                onFirstFrameRender={handleFirstFrame}
              />
            )}
            {(!showPlayer || !firstFrameRendered) &&
              (posterUri != null ? (
                <Image
                  source={{ uri: posterUri, cacheKey: stableCacheKey(posterUri) }}
                  style={styles.media}
                  contentFit="contain"
                  recyclingKey={`${asset.id}-poster`}
                  cachePolicy={cachePolicyFor(posterUri)}
                  transition={0}
                  onLoad={onFirstImageLoad}
                />
              ) : (
                // No renderable poster (older remote videos) — a dark tile
                // instead of a broken/blank image
                <View style={[styles.media, styles.videoPosterFallback]} />
              ))}
            <View style={styles.playOverlay} pointerEvents="box-none">
              {showCenterButton ? (
                <Pressable
                  onPress={handlePlayPause}
                  style={styles.playPauseButton}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? "Pause" : "Play"}
                >
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={30}
                    color="#fff"
                    style={isPlaying ? undefined : styles.playIconNudge}
                  />
                </Pressable>
              ) : !showPlayer ? (
                // Loading glyph until the resolved URI is ready, so the
                // page never reads as a frozen photo
                <Ionicons
                  name="play-circle"
                  size={64}
                  color="rgba(255, 255, 255, 0.9)"
                />
              ) : null}
            </View>
          </Animated.View>
        </Pressable>
      </View>
      </GestureDetector>
    );
  },
);
VideoPage.displayName = "VideoPage";

// ---------------------------------------------------------------------------
// Video scrub bar — lives in the viewer's bottom chrome, above the filmstrip
// ---------------------------------------------------------------------------

interface VideoScrubBarProps {
  player: VideoPlayer;
  muted: boolean;
  onToggleMute: () => void;
}

/**
 * Slim progress bar with current/total time labels, drag-to-scrub and a
 * mute toggle. Playback position is polled on a lightweight interval (the
 * bar only exists for the single active video). The scrub pan lives on the
 * bar's own hit strip in the chrome layer — outside the pager — so it can
 * never fight the page/dismiss gestures.
 */
const VideoScrubBar = memo<VideoScrubBarProps>(
  ({ player, muted, onToggleMute }) => {
    const [time, setTime] = useState({ current: 0, duration: 0 });
    // Fraction being scrubbed (null when idle) — drives the bar and the
    // current-time label while the finger is down
    const [scrubFraction, setScrubFraction] = useState<number | null>(null);
    const scrubbingRef = useRef(false);
    const barWidthRef = useRef(0);
    const lastSeekAtRef = useRef(0);

    useEffect(() => {
      const read = () => {
        if (scrubbingRef.current) return;
        try {
          const current = player.currentTime;
          const duration = player.duration;
          if (!Number.isFinite(current) || !Number.isFinite(duration)) return;
          setTime((prev) =>
            Math.abs(prev.current - current) < 0.2 &&
            prev.duration === duration
              ? prev
              : { current, duration },
          );
        } catch {
          // Player released mid-tick — the viewer unmounts this bar next
        }
      };
      read();
      const id = setInterval(read, 250);
      return () => clearInterval(id);
    }, [player]);

    const fractionForX = useCallback((x: number) => {
      const width = barWidthRef.current;
      if (width <= 0) return 0;
      return Math.min(Math.max(x / width, 0), 1);
    }, []);

    const seekToFraction = useCallback(
      (fraction: number, force: boolean) => {
        // Live-seek while dragging, throttled so the player isn't flooded
        const now = Date.now();
        if (!force && now - lastSeekAtRef.current < 150) return;
        lastSeekAtRef.current = now;
        try {
          const duration = player.duration;
          if (duration > 0) {
            player.currentTime = fraction * duration;
          }
        } catch {
          // Player may already be released
        }
      },
      [player],
    );

    const beginScrub = useCallback(
      (x: number) => {
        scrubbingRef.current = true;
        setScrubFraction(fractionForX(x));
      },
      [fractionForX],
    );

    const moveScrub = useCallback(
      (x: number) => {
        const fraction = fractionForX(x);
        setScrubFraction(fraction);
        seekToFraction(fraction, false);
      },
      [fractionForX, seekToFraction],
    );

    const endScrub = useCallback(
      (x: number) => {
        if (!scrubbingRef.current) return;
        const fraction = fractionForX(x);
        seekToFraction(fraction, true);
        // Show the landed position immediately — the next poll confirms it
        setTime((prev) => ({
          ...prev,
          current: fraction * (prev.duration || 0),
        }));
        setScrubFraction(null);
        scrubbingRef.current = false;
      },
      [fractionForX, seekToFraction],
    );

    const scrubGesture = useMemo(
      () =>
        Gesture.Pan()
          // Owns the touch from the moment it lands on the strip (a plain
          // tap seeks too); the strip is chrome-layer only, so nothing
          // here competes with the pager or dismiss pans
          .minDistance(0)
          .hitSlop({ top: 12, bottom: 12 })
          .onBegin((e) => {
            runOnJS(beginScrub)(e.x);
          })
          .onUpdate((e) => {
            runOnJS(moveScrub)(e.x);
          })
          .onFinalize((e) => {
            runOnJS(endScrub)(e.x);
          }),
      [beginScrub, moveScrub, endScrub],
    );

    const duration = time.duration;
    const fraction =
      scrubFraction ??
      (duration > 0 ? Math.min(time.current / duration, 1) : 0);
    const displayCurrent =
      scrubFraction != null ? scrubFraction * duration : time.current;

    return (
      <View style={styles.videoControlsInner}>
        <Text style={styles.videoTimeText}>
          {formatPlaybackTime(displayCurrent)}
        </Text>
        <GestureDetector gesture={scrubGesture}>
          <View
            style={styles.videoTrackTouch}
            collapsable={false}
            onLayout={(e) => {
              barWidthRef.current = e.nativeEvent.layout.width;
            }}
          >
            <View style={styles.videoTrack}>
              <View
                style={[
                  styles.videoTrackFill,
                  { width: `${fraction * 100}%` },
                ]}
              />
            </View>
            <View
              style={[styles.videoKnob, { left: `${fraction * 100}%` }]}
              pointerEvents="none"
            />
          </View>
        </GestureDetector>
        <Text style={styles.videoTimeText}>
          {formatPlaybackTime(duration)}
        </Text>
        <Pressable
          onPress={onToggleMute}
          hitSlop={8}
          style={styles.videoMuteButton}
          accessibilityRole="button"
          accessibilityLabel={muted ? "Unmute" : "Mute"}
        >
          <Ionicons
            name={muted ? "volume-mute" : "volume-high"}
            size={16}
            color="#fff"
          />
        </Pressable>
      </View>
    );
  },
);
VideoScrubBar.displayName = "VideoScrubBar";

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

type ViewerPhase = "closed" | "opening" | "open" | "dismissing";

/**
 * Flight overlay session. `base` is the overlay's FIXED layout rect (the
 * aspect-fitted fullscreen rect of the flying asset, in modal-root
 * coordinates) — everything else about the flight is worklet-driven
 * transforms, so this is the only per-flight React state.
 */
interface FlightSession {
  id: string;
  uri: string;
  /**
   * Grid thumbnail flown UNDER the full-res image — a not-yet-downloaded
   * full image must fly as the (cached) thumbnail, never as a black
   * rectangle. The full-res paints over it in identical framing when ready.
   */
  thumbUri?: string;
  base: Frame;
  // Unknown-dimension assets fly contain-fit (base is the full page box,
  // matching the frozen page) — cover would pop to a center crop at the swap
  contain?: boolean;
  /**
   * Open flights mount with a STATIC opacity 0 on top of the animated one:
   * if the animated style attaches even a frame late, the static fallback
   * would otherwise flash the un-transformed (fullscreen) overlay. Dismiss
   * overlays must NOT be statically hidden — they take over from the pager
   * in the same commit and a hidden first frame would blink the photo.
   */
  open?: boolean;
}

interface RootMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PhotoViewerProps {
  visible: boolean;
  assets: MediaAsset[];
  initialIndex: number;
  /**
   * Window-space frame of the tapped grid thumbnail. Non-null opens with
   * the zoom flight from that rect; null falls back to a plain fade-in.
   */
  originFrame?: Frame | null;
  /**
   * Resolves the window-space grid frame to fly back to on dismiss.
   * Missing/null resolution falls back to the plain dismiss animation.
   */
  getReturnFrame?: (index: number) => Promise<Frame | null>;
  onClose: () => void;
  onEndReached?: () => void;
  /** Total library count for the "n of M" counter (falls back to loaded). */
  totalCount?: number | null;
  /** Fires when the user swipes to another page (settled index). */
  onActiveIndexChange?: (index: number) => void;
  /**
   * Corner radius of the grid cells flights depart from and land on, in
   * screen px. The flight overlay's corners morph between this and 0 so
   * the photo visually IS the (rounded) cell at both endpoints.
   */
  gridCornerRadius?: number;
  /**
   * Fires the moment the open transition actually begins — the flight's
   * first animated frame (after the overlay has committed and had its
   * decode head start) or the fade-open start. The source grid should
   * dim its pressed cell HERE, not at press time: dimming earlier
   * exposes a gray cell for the frames the overlay hasn't painted yet.
   */
  onOpenTransitionStart?: () => void;
  /**
   * Optional context-specific layer (e.g. album like/comment/tag UI)
   * rendered above the chrome for the current asset while the viewer is
   * settled open. Receives whether the chrome is up (to fade in sync)
   * and a bottom inset in px that clears the filmstrip. Any sheets it
   * opens are its own concern — the slot spans the full screen.
   */
  renderSocialOverlay?: (info: {
    asset: MediaAsset;
    chromeVisible: boolean;
    /**
     * Entrance progress shared with the whole chrome: the open flight's
     * own progress while it runs, 1 once settled. Drive the overlay's
     * entrance from this so it moves in the same motion as the photo.
     */
    intro: SharedValue<number>;
    /**
     * The chrome's live visibility (show/hide toggle, pan-to-dismiss
     * backdrop coupling, dismiss-flight fade) as one UI-thread value —
     * multiply the overlay's opacity by this so it fades in perfect sync
     * with the header and filmstrip.
     */
    visibility: SharedValue<number>;
    bottomInset: number;
    /**
     * Programmatic dismiss — the same animated close as the close button
     * (return flight to the grid when possible). For flows like deleting
     * the on-screen photo.
     */
    requestClose: () => void;
  }) => React.ReactNode;
  /**
   * Double-tap on an unzoomed photo page (double-tap zoom is gone —
   * zooming is pinch-only). Album contexts like the photo here.
   */
  onDoubleTapAsset?: (asset: MediaAsset) => void;
}

export const PhotoViewer: React.FC<PhotoViewerProps> = ({
  visible,
  assets,
  initialIndex,
  originFrame = null,
  getReturnFrame,
  onClose,
  onEndReached,
  totalCount,
  onActiveIndexChange,
  gridCornerRadius = 0,
  onOpenTransitionStart,
  renderSocialOverlay,
  onDoubleTapAsset,
}) => {
  const insets = useSafeAreaInsets();
  // Actual window size (excludes Android status/nav bars where relevant) so
  // gesture math and paging stay correct across devices and rotation
  const { width: pageWidth, height: pageHeight } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [chromeVisible, setChromeVisible] = useState(true);
  // Session-wide video sound state (applied to each video page's player as
  // it activates; toggled from the scrub bar's mute button)
  const [videoMuted, setVideoMuted] = useState(false);
  // The active video page's live player — the chrome's scrub bar drives it
  const [activeVideoPlayer, setActiveVideoPlayer] =
    useState<VideoPlayer | null>(null);
  const activeVideoPlayerRef = useRef<VideoPlayer | null>(null);
  const [phase, setPhase] = useState<ViewerPhase>("closed");
  const [flight, setFlight] = useState<FlightSession | null>(null);
  // Latched synchronously when a dismiss/close is requested, before any
  // await — the pager must be inert from that very moment, not only after
  // the async landing resolution
  const [interactionLocked, setInteractionLocked] = useState(false);

  const phaseRef = useRef<ViewerPhase>("closed");
  // Live page index, updated from onScroll (not just momentum end) so a
  // dismiss during paging momentum captures the page actually on screen
  const activeIndexRef = useRef(initialIndex);
  const pagerListRef = useRef<FlatList<MediaAsset>>(null);
  const rootRef = useRef<View>(null);
  const rootMetricsRef = useRef<RootMetrics | null>(null);
  const pendingOpenRef = useRef<Frame | null>(null);
  const openFlightStartedRef = useRef(false);
  // A dismiss (flight or fallback) may only start once per open
  const dismissGuardRef = useRef(false);
  // True once this open session has mounted the pager (at landing / fade
  // open). Keeps the abort-during-"opening" fade from pointlessly mounting
  // a pager that never existed, while real dismissals keep theirs mounted
  // (hidden) until the modal closes.
  const pagerLandedRef = useRef(false);
  // True while the landed open overlay is being held above the pager
  // awaiting the active page's first paint (or the hold cap)
  const openHoldRef = useRef(false);
  // Hold-cap timer for the landed open overlay
  const openOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Return frame prefetched when a dismiss drag activates, so the release
  // never freezes the photo awaiting getReturnFrame (and any grid scroll
  // it triggers happens while the backdrop still fully hides the grid)
  const returnFramePrefetchRef = useRef<{
    index: number;
    promise: Promise<Frame | null>;
  } | null>(null);

  // Mirror render-scoped values into refs so the flight callbacks keep a
  // stable identity (they must not retrigger the per-open effect or break
  // page memoization when e.g. pagination appends assets mid-session)
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const initialIndexRef = useRef(initialIndex);
  initialIndexRef.current = initialIndex;
  const onOpenTransitionStartRef = useRef(onOpenTransitionStart);
  onOpenTransitionStartRef.current = onOpenTransitionStart;
  const pageSizeRef = useRef({ pageWidth, pageHeight });
  pageSizeRef.current = { pageWidth, pageHeight };
  const chromeVisibleRef = useRef(true);
  chromeVisibleRef.current = chromeVisible;
  // scrollEnabled is false exactly while the active photo is zoomed
  const scrollEnabledRef = useRef(true);
  scrollEnabledRef.current = scrollEnabled;

  // The chrome-fitted box: the area between the top bar and the filmstrip
  // that pages shrink into while the chrome is visible. Degenerates to the
  // full page (no shrink) when there is no filmstrip to clear.
  const fitBox = useMemo(() => {
    if (assets.length <= 1) {
      return { availableHeight: pageHeight, offsetY: 0 };
    }
    const topReserved = insets.top + 64;
    const bottomReserved = insets.bottom + FILMSTRIP_HEIGHT + 28;
    return {
      availableHeight: Math.max(
        pageHeight - topReserved - bottomReserved,
        pageHeight * 0.4,
      ),
      offsetY: (topReserved - bottomReserved) / 2,
    };
  }, [assets.length, pageHeight, insets.top, insets.bottom]);
  const fitBoxRef = useRef(fitBox);
  fitBoxRef.current = fitBox;

  // All opacities idle at "invisible" so the modal's very first frame can
  // never flash fully-open content before the open effect runs
  const backdropOpacity = useSharedValue(0);
  const chromeOpacity = useSharedValue(0);
  // Entrance progress of the chrome. While the OPEN flight runs, the
  // chrome rides flightProgress itself — header, filmstrip, and the
  // social slot arrive in the very same motion as the photo. Outside the
  // flight this settled value takes over (1 after landing; the fade-open
  // path snaps it to 1 and lets the whole-content fade carry the
  // entrance). Idles at 1 so chrome toggles and dismissals never move.
  const chromeIntro = useSharedValue(1);
  // 1 while the chrome is visible: pages shrink into the chrome-fitted box.
  // Snaps (not animates) to 1 at open so the pager mounts already fitted,
  // pixel-matching the held open-flight overlay; toggles animate with the
  // chrome fade.
  const chromeFit = useSharedValue(1);
  // Whole-content gate used by the fade open/close fallbacks
  const contentOpacity = useSharedValue(1);
  // --- Transform-only flight state (all in modal-root coordinates) -------
  // One progress value drives the whole flight: the visible window rect is
  // R(p) = lerp(flightFrom, flightTo, p), realised purely as transforms of
  // two fixed-layout views. While flightActive the backdrop derives from
  // the same p, so it can never lag (or outrun) the rect.
  const flightProgress = useSharedValue(0);
  const flightActive = useSharedValue(false);
  const flightFrom = useSharedValue<Frame>({ x: 0, y: 0, width: 0, height: 0 });
  const flightTo = useSharedValue<Frame>({ x: 0, y: 0, width: 0, height: 0 });
  // Mirrors FlightSession.base for the worklets
  const flightBase = useSharedValue<Frame>({ x: 0, y: 0, width: 0, height: 0 });
  const flightBackdropFrom = useSharedValue(0);
  const flightBackdropTo = useSharedValue(1);
  // Screen-space corner radius of the visible window at p=0 / p=1 — the
  // grid endpoint of a flight carries the cell's radius, the fullscreen
  // endpoint is always square
  const flightRadiusFrom = useSharedValue(0);
  const flightRadiusTo = useSharedValue(0);
  // Crossover fade of the held overlay after the open flight lands
  const flightOpacity = useSharedValue(1);
  // Pager content offset in px, written on the UI thread by the scroll
  // worklet — drives the bottom filmstrip with zero JS-thread latency
  const scrollX = useSharedValue(initialIndex * pageWidth);
  // UI-thread mirror of the live (rounded) page index, so the scroll
  // worklet only crosses to JS when the index actually changes
  const liveIndexSv = useSharedValue(initialIndex);

  const setPhaseBoth = useCallback((next: ViewerPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // -------------------------------------------------------------------------
  // Landed-overlay hold (open-flight crossover)
  // -------------------------------------------------------------------------

  const clearOpenOverlayTimer = useCallback(() => {
    if (openOverlayTimerRef.current != null) {
      clearTimeout(openOverlayTimerRef.current);
      openOverlayTimerRef.current = null;
    }
  }, []);

  const unmountOpenOverlay = useCallback(() => {
    // A dismiss may have taken over the overlay while the fade ran — it
    // owns the overlay now and must not lose it
    if (phaseRef.current === "open") {
      setFlight(null);
    }
  }, []);

  /** Fade the held overlay out over the (already painted) pager. */
  const dropOpenOverlay = useCallback(() => {
    if (!openHoldRef.current) return;
    openHoldRef.current = false;
    clearOpenOverlayTimer();
    if (phaseRef.current !== "open") return;
    flightOpacity.value = withTiming(
      0,
      { duration: OPEN_OVERLAY_FADE_DURATION },
      (finished) => {
        if (finished) {
          runOnJS(unmountOpenOverlay)();
        }
      },
    );
  }, [clearOpenOverlayTimer, unmountOpenOverlay, flightOpacity]);

  /**
   * Drop the held overlay immediately (no fade) — used when a gesture is
   * about to move the pager underneath it, where a frozen overlay on top
   * would read as a glitch.
   */
  const releaseOpenOverlayNow = useCallback(() => {
    if (!openHoldRef.current) return;
    openHoldRef.current = false;
    clearOpenOverlayTimer();
    cancelAnimation(flightOpacity);
    flightOpacity.value = 1;
    unmountOpenOverlay();
  }, [clearOpenOverlayTimer, unmountOpenOverlay, flightOpacity]);

  /** The active page's image painted — safe to reveal the pager. */
  const handleActiveImageLoad = useCallback(() => {
    if (openHoldRef.current) {
      dropOpenOverlay();
    }
  }, [dropOpenOverlay]);

  /**
   * A video page's player activated/deactivated. Registration is keyed by
   * the player instance so a stale deactivation (page A unmounting after
   * page B already registered) can never clear B's registration.
   */
  const handleActivePlayerChange = useCallback(
    (player: VideoPlayer, active: boolean) => {
      if (active) {
        activeVideoPlayerRef.current = player;
        setActiveVideoPlayer(player);
      } else {
        if (activeVideoPlayerRef.current === player) {
          activeVideoPlayerRef.current = null;
        }
        setActiveVideoPlayer((prev) => (prev === player ? null : prev));
      }
    },
    [],
  );

  const handleToggleVideoMute = useCallback(() => {
    setVideoMuted((prev) => {
      const next = !prev;
      const player = activeVideoPlayerRef.current;
      if (player) {
        try {
          player.muted = next;
        } catch {
          // Player may already be released
        }
      }
      return next;
    });
  }, []);

  const handleToggleChrome = useCallback(() => {
    // The pager is about to resize under a still-held open overlay
    if (openHoldRef.current) {
      releaseOpenOverlayNow();
    }
    setChromeVisible((prev) => {
      const next = !prev;
      chromeOpacity.value = withTiming(next ? 1 : 0, { duration: 180 });
      // While zoomed, showing the chrome overlays it without re-fitting
      // the photo (as iPhone Photos does) — the re-fit happens on unzoom
      const fitTarget = next && scrollEnabledRef.current ? 1 : 0;
      chromeFit.value = withTiming(fitTarget, { duration: 180 });
      return next;
    });
  }, [chromeOpacity, chromeFit, releaseOpenOverlayNow]);

  const handleZoomChange = useCallback(
    (zoomed: boolean) => {
      // A zoom starting under the held overlay must reveal the pager
      if (zoomed && openHoldRef.current) {
        releaseOpenOverlayNow();
      }
      if (zoomed && chromeVisibleRef.current) {
        // iPhone-Photos behavior: zooming hides the chrome — which also
        // un-fits the photo back to fullscreen, so the zoom's pan bounds
        // (computed for the fullscreen fit) stay valid
        setChromeVisible(false);
        chromeOpacity.value = withTiming(0, { duration: 180 });
        chromeFit.value = withTiming(0, { duration: 180 });
      } else if (!zoomed && chromeVisibleRef.current) {
        // Unzoomed with the chrome up (it was shown by a tap mid-zoom) —
        // re-fit the photo above the filmstrip again
        chromeFit.value = withTiming(1, { duration: 180 });
      }
      // While zoomed, panning the photo must not page the FlatList
      setScrollEnabled(!zoomed);
    },
    [releaseOpenOverlayNow, chromeOpacity, chromeFit],
  );

  // -------------------------------------------------------------------------
  // Open flight: grid cell → fullscreen
  // -------------------------------------------------------------------------

  const scheduleOverlayFlight = useCallback((start: () => void) => {
    // Two frames so the overlay is committed and drawn — covering the
    // exact pixels it must take over from — before other layers change or
    // its own animation starts. For the open flight this also gives the
    // overlay image its decode head start before any animation runs.
    requestAnimationFrame(() => {
      requestAnimationFrame(start);
    });
  }, []);

  /** Plain 200ms fade-in of the fully-assembled viewer (no flight). */
  const startFadeOpen = useCallback(() => {
    onOpenTransitionStartRef.current?.();
    pagerLandedRef.current = true;
    setPhaseBoth("open");
    backdropOpacity.value = 1;
    chromeOpacity.value = 1;
    // The whole-content fade IS the entrance here — chrome fades in with
    // the photo, exactly like the flight path rides flightProgress
    chromeIntro.value = 1;
    contentOpacity.value = 0;
    contentOpacity.value = withTiming(1, { duration: 200 });
  }, [
    setPhaseBoth,
    backdropOpacity,
    chromeOpacity,
    chromeIntro,
    contentOpacity,
  ]);

  const finishOpenFlight = useCallback(() => {
    // Backdrop control returns to the gesture-driven value — the timing's
    // completion worklet set backdropOpacity to 1 on the UI thread before
    // scheduling this callback, so the branch switch is seamless
    flightActive.value = false;
    // The chrome rode flightProgress to exactly 1 during the flight —
    // snap the settled value to 1 in the same frame the branch switches,
    // so the handoff is invisible
    chromeOpacity.value = 1;
    chromeIntro.value = 1;
    // Mount the pager only now — its FlatList mount and the full-res page
    // decode happen strictly after the flight, never during it. The landed
    // overlay (pixel-identical to the pager's page) is held on top until
    // the active page's image paints, so the crossover can't show a blank
    // or soft frame.
    openHoldRef.current = true;
    pagerLandedRef.current = true;
    setPhaseBoth("open");
    // Cap: drop the overlay even if the page's onLoad never fires
    openOverlayTimerRef.current = setTimeout(() => {
      openOverlayTimerRef.current = null;
      dropOpenOverlay();
    }, OPEN_OVERLAY_HOLD_CAP);
  }, [flightActive, chromeOpacity, chromeIntro, setPhaseBoth, dropOpenOverlay]);

  // The open flight starts only once an overlay image has actually painted
  // (either layer's onLoad), with a short cap so it can never hang — remote
  // thumbnails routinely outlive the two-frame head start, and revealing an
  // overlay whose image hasn't decoded shows a dimmed cell with nothing
  // flying (the album-grid flicker).
  const openFlightArmedRef = useRef(false);
  const openFlightCapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearOpenFlightCapTimer = useCallback(() => {
    if (openFlightCapTimerRef.current != null) {
      clearTimeout(openFlightCapTimerRef.current);
      openFlightCapTimerRef.current = null;
    }
  }, []);

  const beginOpenFlightAnimation = useCallback(() => {
    if (!openFlightArmedRef.current) return;
    openFlightArmedRef.current = false;
    clearOpenFlightCapTimer();
    scheduleOverlayFlight(() => {
      // Aborted (Android back) between mount and start
      if (phaseRef.current !== "opening") return;
      // The overlay's transform has been applied and its image painted —
      // reveal it exactly over the cell and dim the cell in the same frame
      flightOpacity.value = 1;
      onOpenTransitionStartRef.current?.();
      flightProgress.value = withTiming(
        1,
        { duration: OPEN_FLIGHT_DURATION, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) {
            // Hand the (fully opaque) backdrop back to its own value on
            // the UI thread, in the same frame the flight branch ends
            backdropOpacity.value = 1;
            runOnJS(finishOpenFlight)();
          }
        },
      );
    });
  }, [
    clearOpenFlightCapTimer,
    scheduleOverlayFlight,
    finishOpenFlight,
    flightOpacity,
    flightProgress,
    backdropOpacity,
  ]);

  /** An overlay image painted — an armed open flight can start now. */
  const handleFlightImagePaint = useCallback(() => {
    beginOpenFlightAnimation();
  }, [beginOpenFlightAnimation]);

  const tryStartOpenFlight = useCallback(() => {
    const origin = pendingOpenRef.current;
    const root = rootMetricsRef.current;
    if (!origin || !root || openFlightStartedRef.current) return;
    // The open may have been aborted (e.g. Android back mid-"opening")
    if (phaseRef.current !== "opening") return;
    openFlightStartedRef.current = true;
    pendingOpenRef.current = null;
    const assetsNow = assetsRef.current;
    const index = Math.min(
      initialIndexRef.current,
      Math.max(assetsNow.length - 1, 0),
    );
    const asset = assetsNow[index];
    if (
      !asset ||
      root.height <= 0 ||
      !(asset.width > 0 && asset.height > 0)
    ) {
      // Degenerate open (missing asset, unmeasured root, or unknown asset
      // dimensions — where the cover-fit overlay cannot match the pager's
      // contain fit) — use the same fade as the null-originFrame open
      startFadeOpen();
      return;
    }
    // Fit within the page box the pager will render into: pages are laid
    // out at window width, and their height is the modal root's height
    const base = fitRect(
      asset.width,
      asset.height,
      pageSizeRef.current.pageWidth,
      root.height,
    );
    // Chrome is always visible at open, so the flight lands on the
    // chrome-fitted rect — where the (already fitted) pager page renders,
    // keeping the held-overlay crossover pixel-identical
    const fb = fitBoxRef.current;
    const fitS = chromeFitScale(
      asset.width,
      asset.height,
      pageSizeRef.current.pageWidth,
      root.height,
      fb.availableHeight,
    );
    // offsetY applies even at fitS === 1 — the page re-centers into the
    // available box regardless of whether it also had to shrink
    const landing: Frame = {
      x: pageSizeRef.current.pageWidth / 2 - (base.width * fitS) / 2,
      y: root.height / 2 + fb.offsetY - (base.height * fitS) / 2,
      width: base.width * fitS,
      height: base.height * fitS,
    };
    // Origin arrives in window coordinates; the overlay lives in the modal
    // root, so shift by the root's own window origin (non-zero on Android)
    const from: Frame = {
      x: origin.x - root.x,
      y: origin.y - root.y,
      width: origin.width,
      height: origin.height,
    };
    flightFrom.value = from;
    flightTo.value = landing;
    flightBase.value = base;
    flightProgress.value = 0;
    // Mounted INVISIBLE: the overlay's fixed layout is the fullscreen
    // fitted rect and only the animated transform maps it onto the cell —
    // if that initial transform misses the overlay's first frame, a
    // cached image flashes fullscreen. Revealed when the flight begins,
    // by which point the transform is guaranteed applied.
    flightOpacity.value = 0;
    flightBackdropFrom.value = 0;
    flightBackdropTo.value = 1;
    flightRadiusFrom.value = gridCornerRadius;
    // Land with the page's resting corners so the held-overlay crossover
    // is seamless (video pages render square, so land square there)
    flightRadiusTo.value = asset.mediaType === "video" ? 0 : PAGE_RADIUS;
    flightActive.value = true;
    setFlight({
      id: asset.id,
      uri: flightUriFor(asset),
      thumbUri: thumbnailUnderlayUri(asset),
      base,
      open: true,
    });
    // Armed: the flight begins when an overlay image paints (or the cap
    // expires) — never over a still-empty overlay
    openFlightArmedRef.current = true;
    clearOpenFlightCapTimer();
    openFlightCapTimerRef.current = setTimeout(() => {
      openFlightCapTimerRef.current = null;
      beginOpenFlightAnimation();
    }, OPEN_FLIGHT_PAINT_CAP_MS);
  }, [
    startFadeOpen,
    beginOpenFlightAnimation,
    clearOpenFlightCapTimer,
    flightFrom,
    flightTo,
    flightBase,
    flightProgress,
    flightOpacity,
    flightBackdropFrom,
    flightBackdropTo,
    flightRadiusFrom,
    flightRadiusTo,
    flightActive,
    gridCornerRadius,
  ]);

  const handleRootLayout = useCallback(() => {
    const node = rootRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) => {
      const { pageWidth: pw, pageHeight: ph } = pageSizeRef.current;
      rootMetricsRef.current = {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
        width: width > 0 ? width : pw,
        height: height > 0 ? height : ph,
      };
      tryStartOpenFlight();
    });
  }, [tryStartOpenFlight]);

  // Reset per-open state whenever the viewer is (re)opened. Chrome always
  // starts visible.
  // The hold-cap timer must never outlive the component (a parent unmount
  // during the 400ms crossover window would otherwise fire it on dead state)
  useEffect(
    () => () => {
      clearOpenOverlayTimer();
      clearOpenFlightCapTimer();
      openHoldRef.current = false;
      openFlightArmedRef.current = false;
    },
    [clearOpenOverlayTimer, clearOpenFlightCapTimer],
  );

  useEffect(() => {
    if (visible) {
      setActiveIndex(initialIndex);
      activeIndexRef.current = initialIndex;
      setScrollEnabled(true);
      setChromeVisible(true);
      // Every session starts with sound on (autoplay-with-sound contract)
      setVideoMuted(false);
      setInteractionLocked(false);
      dismissGuardRef.current = false;
      openFlightStartedRef.current = false;
      openHoldRef.current = false;
      pagerLandedRef.current = false;
      returnFramePrefetchRef.current = null;
      contentOpacity.value = 1;
      flightActive.value = false;
      flightProgress.value = 0;
      // Stays 0 until something owns the overlay: the open flight reveals
      // it when it starts, a dismiss mount sets it to 1 explicitly
      flightOpacity.value = 0;
      // Snap, don't animate: the pager must mount already chrome-fitted
      chromeFit.value = 1;
      // The open flight's progress carries the chrome in (see
      // chromeIntroProgress); this settled value takes over at landing
      chromeIntro.value = 0;
      scrollX.value = initialIndex * pageSizeRef.current.pageWidth;
      liveIndexSv.value = initialIndex;
      if (originFrame) {
        setPhaseBoth("opening");
        pendingOpenRef.current = originFrame;
        backdropOpacity.value = 0;
        // 1, not 0: the chrome is mounted DURING the flight now, and its
        // visibility there is chromeIntroProgress (0 at this commit) —
        // chromeOpacity stays the toggle/dismiss fade only
        chromeOpacity.value = 1;
        // The root may still be measured from a previous open on this
        // screen — start right away; otherwise onLayout starts the flight
        tryStartOpenFlight();
      } else {
        // No origin rect — plain fade-in of the fully-assembled viewer
        pendingOpenRef.current = null;
        startFadeOpen();
      }
    } else {
      setPhaseBoth("closed");
      clearOpenOverlayTimer();
      openHoldRef.current = false;
      openFlightArmedRef.current = false;
      clearOpenFlightCapTimer();
      setFlight(null);
      setInteractionLocked(false);
      pendingOpenRef.current = null;
      dismissGuardRef.current = false;
      returnFramePrefetchRef.current = null;
      // Park every layer invisible so the next open's first frame is clean
      cancelAnimation(flightProgress);
      cancelAnimation(flightOpacity);
      backdropOpacity.value = 0;
      chromeOpacity.value = 0;
      contentOpacity.value = 1;
      flightActive.value = false;
      flightProgress.value = 0;
      // Parked at 0 with ZEROED geometry: the next open's overlay can
      // briefly render this session's last-evaluated style before the new
      // values propagate — if these still held the dismissal's release
      // rect (big, rounded, opacity 1), that stale frame flashed as a
      // misplaced preview. Zero-sized and transparent renders nothing.
      flightOpacity.value = 0;
      flightFrom.value = { x: 0, y: 0, width: 0, height: 0 };
      flightTo.value = { x: 0, y: 0, width: 0, height: 0 };
      flightBase.value = { x: 0, y: 0, width: 0, height: 0 };
      flightRadiusFrom.value = 0;
      flightRadiusTo.value = 0;
    }
  }, [
    visible,
    initialIndex,
    originFrame,
    tryStartOpenFlight,
    startFadeOpen,
    clearOpenOverlayTimer,
    clearOpenFlightCapTimer,
    setPhaseBoth,
    backdropOpacity,
    chromeOpacity,
    contentOpacity,
    flightActive,
    flightProgress,
    flightOpacity,
    flightFrom,
    flightTo,
    flightBase,
    flightRadiusFrom,
    flightRadiusTo,
    chromeFit,
    scrollX,
    liveIndexSv,
  ]);

  // -------------------------------------------------------------------------
  // Dismiss flight: fullscreen → grid cell
  // -------------------------------------------------------------------------

  const finishClose = useCallback(() => {
    onClose();
  }, [onClose]);

  /**
   * Completion of a real cell landing. The dismiss haptic fires at the
   * release that decided the dismissal (handlePanDismiss), not here — the
   * landing is just the animation finishing.
   */
  const finishLanding = useCallback(() => {
    onClose();
  }, [onClose]);

  const mountDismissOverlay = useCallback(
    (
      asset: MediaAsset,
      base: Frame,
      from: Frame,
      contain = false,
      landingRadius = 0,
      startRadius = 0,
    ) => {
      // Take the overlay over from a still-held open crossover, if any —
      // its cap timer / fade must never unmount this flight's overlay
      openHoldRef.current = false;
      clearOpenOverlayTimer();
      cancelAnimation(flightOpacity);
      flightOpacity.value = 1;
      flightBase.value = base;
      flightFrom.value = from;
      flightProgress.value = 0;
      // Corners start at whatever the dragged page showed at release and
      // morph into the landing cell's radius (0 for non-landing fallbacks)
      flightRadiusFrom.value = startRadius;
      flightRadiusTo.value = landingRadius;
      // One batched commit: the overlay appears AND the pager is hidden
      // ("dismissing" + flight → display none) in the very same frame, so
      // the swap can never show both or neither. "dismissing" also pauses
      // an active video page (the flight flies the poster, never a live
      // player) and locks the pager's pointers. The pager unmounts with
      // the modal at close — after the flight, off the hot path.
      setFlight({
        id: asset.id,
        uri: flightUriFor(asset),
        thumbUri: thumbnailUnderlayUri(asset),
        base,
        contain,
      });
      setPhaseBoth("dismissing");
    },
    [
      clearOpenOverlayTimer,
      flightOpacity,
      flightBase,
      flightFrom,
      flightProgress,
      flightRadiusFrom,
      flightRadiusTo,
      setPhaseBoth,
    ],
  );

  const runDismissFlight = useCallback(
    async (
      capturedRect: Frame,
      velocityY: number,
      viaPan: boolean,
      startRadius = 0,
    ) => {
      const index = activeIndexRef.current;
      const asset = assetsRef.current[index];
      if (!asset) {
        finishClose();
        return;
      }
      // Unknown asset dimensions degrade fitRect, so the cover-fit overlay
      // cannot match the pager's contain fit — skip the landing flight and
      // take the non-landing fallbacks below (target stays null)
      const hasKnownSize = asset.width > 0 && asset.height > 0;
      // Resolve the landing cell. A pan dismiss normally finds this already
      // resolved — it was prefetched when the drag activated, while the
      // backdrop still fully hid the grid (awaiting from scratch here froze
      // the photo at the release position, with any grid scroll visible
      // through the faded backdrop). The close-button path awaits at press,
      // when the backdrop is fully opaque.
      let target: Frame | null = null;
      if (getReturnFrame && hasKnownSize) {
        const prefetched = returnFramePrefetchRef.current;
        returnFramePrefetchRef.current = null;
        const framePromise =
          prefetched && prefetched.index === index
            ? prefetched.promise
            : getReturnFrame(index);
        try {
          target = await withTimeoutNull(framePromise, RETURN_FRAME_TIMEOUT);
        } catch {
          target = null;
        }
      }
      // The viewer may have been closed externally while awaiting
      if (phaseRef.current !== "open") return;
      const root = rootMetricsRef.current;
      const { pageWidth: pw, pageHeight: ph } = pageSizeRef.current;
      const rootHeight = root?.height ?? ph;
      // The overlay's fixed layout: the fitted fullscreen rect of the
      // flying asset (degenerates to the full page box for unknown sizes,
      // which only the fallback paths below can reach)
      const base = fitRect(asset.width, asset.height, pw, rootHeight);
      if (target && root) {
        const localTarget: Frame = {
          x: target.x - root.x,
          y: target.y - root.y,
          width: target.width,
          height: target.height,
        };
        // Single progress spring drives the rect and the backdrop (from
        // its current value to 0) together — the backdrop can never lag
        // the landing, and a fast flick can never land big and shrink in
        // place. Set before the overlay mounts so its first frame is
        // exactly the captured rect.
        flightTo.value = localTarget;
        flightBackdropFrom.value = backdropOpacity.value;
        flightBackdropTo.value = 0;
        flightActive.value = true;
        mountDismissOverlay(
          asset,
          base,
          capturedRect,
          false,
          gridCornerRadius,
          startRadius,
        );
        scheduleOverlayFlight(() => {
          chromeOpacity.value = withTiming(0, { duration: 180 });
          // Map the pan's release velocity (px/s) into progress space
          // (1/s) so a flick keeps its motion through the unified flight.
          // Inherit ONLY velocity that points toward the cell, and cap it:
          // unclamped, a hard flick either teleports (overshoot clamping
          // snaps a past-target start to the end) or dives away from the
          // grid (negative when the cell is above the release point).
          const distanceY = localTarget.y - capturedRect.y;
          const rawVelocity =
            Math.abs(distanceY) > 1 ? velocityY / distanceY : 0;
          const progressVelocity = Math.min(Math.max(rawVelocity, 0), 4);
          flightProgress.value = withSpring(
            1,
            { ...RETURN_SPRING, velocity: progressVelocity },
            (finished) => {
              if (finished) {
                runOnJS(finishLanding)();
              }
            },
          );
        });
      } else if (viaPan) {
        // No landing cell — keep the pre-flight dismissal: spring the photo
        // off-screen with the release velocity while the backdrop fades.
        // Same-size rects means R(p) is a pure translation here. A decisive
        // flick chooses the exit direction; otherwise screen position does.
        const goesDown =
          Math.abs(velocityY) > 200
            ? velocityY > 0
            : capturedRect.y + capturedRect.height / 2 >= rootHeight / 2;
        const offscreenTop = goesDown ? rootHeight : -capturedRect.height;
        flightTo.value = { ...capturedRect, y: offscreenTop };
        // Backdrop fades on its own clock (as before), not with the spring
        flightActive.value = false;
        mountDismissOverlay(
          asset,
          base,
          capturedRect,
          !hasKnownSize,
          // No landing cell — keep the release corners while flying off
          startRadius,
          startRadius,
        );
        scheduleOverlayFlight(() => {
          backdropOpacity.value = withTiming(0, { duration: 180 });
          chromeOpacity.value = withTiming(0, { duration: 180 });
          const distanceY = offscreenTop - capturedRect.y;
          const rawVelocity =
            Math.abs(distanceY) > 1 ? velocityY / distanceY : 0;
          const progressVelocity = Math.min(Math.max(rawVelocity, 0), 6);
          flightProgress.value = withSpring(
            1,
            {
              ...SPRING_CONFIG,
              velocity: progressVelocity,
              overshootClamping: true,
            },
            (finished) => {
              if (finished) {
                runOnJS(finishClose)();
              }
            },
          );
        });
      } else {
        // Close button with no landing cell — fade the whole viewer out
        // ("dismissing" pauses an active video and locks the pager; no
        // flight overlay, so the pager stays visible for the fade)
        setPhaseBoth("dismissing");
        contentOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
          if (finished) {
            runOnJS(finishClose)();
          }
        });
      }
    },
    [
      getReturnFrame,
      finishClose,
      finishLanding,
      mountDismissOverlay,
      scheduleOverlayFlight,
      setPhaseBoth,
      backdropOpacity,
      chromeOpacity,
      contentOpacity,
      flightTo,
      flightActive,
      flightProgress,
      flightBackdropFrom,
      flightBackdropTo,
      gridCornerRadius,
    ],
  );

  /**
   * A 1x vertical drag activated (backdrop still ≈1.0) — prefetch the
   * return frame so the eventual release never awaits it, and any grid
   * scroll it triggers happens while the grid is fully occluded.
   */
  const handleDismissPanStart = useCallback(() => {
    // The drag is about to move the page — a still-held open overlay would
    // sit frozen on top of it
    if (openHoldRef.current) {
      releaseOpenOverlayNow();
    }
    if (phaseRef.current !== "open" || dismissGuardRef.current) return;
    if (!getReturnFrame) return;
    const index = activeIndexRef.current;
    const asset = assetsRef.current[index];
    // Unknown dimensions dismiss via the non-landing fallback — a prefetch
    // would only scroll the grid for a frame that is never used
    if (!asset || !(asset.width > 0 && asset.height > 0)) return;
    if (returnFramePrefetchRef.current?.index === index) return;
    let promise: Promise<Frame | null>;
    try {
      promise = getReturnFrame(index).catch(() => null);
    } catch {
      promise = Promise.resolve(null);
    }
    returnFramePrefetchRef.current = { index, promise };
  }, [getReturnFrame, releaseOpenOverlayNow]);

  /** The drag ended without dismissing — the prefetched frame is stale. */
  const handleDismissPanEnd = useCallback(() => {
    // A dismiss in flight owns (and consumes) the prefetch
    if (!dismissGuardRef.current) {
      returnFramePrefetchRef.current = null;
    }
  }, []);

  /** Pan release qualified as a dismiss — the page froze at this position. */
  const handlePanDismiss = useCallback(
    (
      translationX: number,
      translationY: number,
      releaseScale: number,
      releaseRadius: number,
      velocityY: number,
    ) => {
      if (dismissGuardRef.current || phaseRef.current !== "open") return;
      dismissGuardRef.current = true;
      // The dismissal is decided NOW, at release — punctuate the decision,
      // not the landing
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
        // Haptics are best-effort (unsupported devices / silent failures)
      });
      // Latch the pager inert before any await — the user must not be able
      // to swipe, zoom, or toggle chrome while the landing resolves
      setInteractionLocked(true);
      const asset = assetsRef.current[activeIndexRef.current];
      if (!asset) {
        finishClose();
        return;
      }
      // Current visual rect: the fitted rect scaled about the page centre
      // by the chrome-fit and the dismiss shrink, shifted by the pan
      // translation — the page's transforms at release folded into the
      // flight's start rect. The chrome-fit offset rides inside the
      // dismiss scale, mirroring the page's transform order.
      const { pageWidth: pw, pageHeight: ph } = pageSizeRef.current;
      const rootHeight = rootMetricsRef.current?.height ?? ph;
      const fb = fitBoxRef.current;
      const fitS = chromeVisibleRef.current
        ? chromeFitScale(
            asset.width,
            asset.height,
            pw,
            rootHeight,
            fb.availableHeight,
          )
        : 1;
      const fitTy = chromeVisibleRef.current ? fb.offsetY : 0;
      const fitted = fitRect(asset.width, asset.height, pw, rootHeight);
      const width = fitted.width * fitS * releaseScale;
      const height = fitted.height * fitS * releaseScale;
      const rect: Frame = {
        x: pw / 2 + translationX - width / 2,
        y: rootHeight / 2 + fitTy * releaseScale + translationY - height / 2,
        width,
        height,
      };
      void runDismissFlight(rect, velocityY, true, releaseRadius);
    },
    [finishClose, runDismissFlight],
  );

  const handleClosePress = useCallback(() => {
    if (dismissGuardRef.current || phaseRef.current !== "open") return;
    dismissGuardRef.current = true;
    // Latch the pager inert before any await (see handlePanDismiss)
    setInteractionLocked(true);
    const asset = assetsRef.current[activeIndexRef.current];
    if (!asset) {
      finishClose();
      return;
    }
    // The close button only exists while the chrome is visible, so the
    // photo is at its chrome-fitted rect — capture that, not fullscreen
    const { pageWidth: pw, pageHeight: ph } = pageSizeRef.current;
    const rootHeight = rootMetricsRef.current?.height ?? ph;
    const fb = fitBoxRef.current;
    const fitS = chromeVisibleRef.current
      ? chromeFitScale(
          asset.width,
          asset.height,
          pw,
          rootHeight,
          fb.availableHeight,
        )
      : 1;
    const fitTy = chromeVisibleRef.current ? fb.offsetY : 0;
    const fitted = fitRect(asset.width, asset.height, pw, rootHeight);
    const width = fitted.width * fitS;
    const height = fitted.height * fitS;
    const rect: Frame = {
      x: pw / 2 - width / 2,
      y: rootHeight / 2 + fitTy - height / 2,
      width,
      height,
    };
    // The page draws PAGE_RADIUS pre-scale, so the on-screen corners at
    // press are PAGE_RADIUS × the chrome-fit scale (videos render square)
    const startRadius =
      asset.mediaType === "video" ? 0 : PAGE_RADIUS * fitS;
    void runDismissFlight(rect, 0, false, startRadius);
  }, [finishClose, runDismissFlight]);

  /** Hardware/system close (Android back). */
  const handleRequestClose = useCallback(() => {
    if (phaseRef.current === "dismissing") return;
    if (phaseRef.current === "opening") {
      // Mid-open-flight: cancel the flight and fade out instead of a hard
      // cut. "dismissing" blocks re-entry and prevents the not-yet-started
      // flight from ever starting (the scheduled start checks the phase).
      if (dismissGuardRef.current) return;
      dismissGuardRef.current = true;
      setInteractionLocked(true);
      pendingOpenRef.current = null;
      setPhaseBoth("dismissing");
      // Freeze the flight where it is (backdrop derives from the same
      // progress, so it freezes with it) and fade everything out
      cancelAnimation(flightProgress);
      contentOpacity.value = withTiming(0, { duration: 150 }, (finished) => {
        if (finished) {
          runOnJS(onClose)();
        }
      });
      return;
    }
    handleClosePress();
  }, [
    handleClosePress,
    onClose,
    setPhaseBoth,
    contentOpacity,
    flightProgress,
  ]);

  // -------------------------------------------------------------------------
  // Pager
  // -------------------------------------------------------------------------

  // Keeps activeIndexRef live during paging momentum — a dismiss/close in
  // that window must capture the page actually on screen, not the page the
  // last completed momentum settled on. Called from the UI-thread scroll
  // worklet only when the rounded index changes (never per scroll frame),
  // and must stay setState-free apart from the rare landed-overlay release
  // below, which fires at most once per open.
  const handleLiveIndexChange = useCallback(
    (index: number) => {
      if (index === activeIndexRef.current) return;
      activeIndexRef.current = index;
      // A prefetched return frame belongs to the previous page
      returnFramePrefetchRef.current = null;
      // The user paged away while the landed overlay was still held —
      // it would sit frozen over the moving pager
      if (openHoldRef.current) {
        releaseOpenOverlayNow();
      }
    },
    [releaseOpenOverlayNow],
  );

  const handleSettledIndex = useCallback(
    (index: number) => {
      // A momentum settle after a dismiss/close started must not re-render
      // the pager mid-flight or resurrect the chrome over the landing
      if (phaseRef.current !== "open") return;
      setActiveIndex(index);
      activeIndexRef.current = index;
      onActiveIndexChange?.(index);
      // Defensive: the pager must never stay stuck unscrollable after a
      // page change, whatever happened to zoom state on the previous page
      setScrollEnabled(true);
    },
    [onActiveIndexChange],
  );

  // UI-thread scroll tracking: scrollX drives the filmstrip every frame;
  // JS work is throttled to page-index changes and momentum settles
  const pagerScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (e) => {
        scrollX.value = e.contentOffset.x;
        if (pageWidth <= 0) return;
        const index = clamp(
          Math.round(e.contentOffset.x / pageWidth),
          0,
          Math.max(assets.length - 1, 0),
        );
        if (index !== liveIndexSv.value) {
          liveIndexSv.value = index;
          runOnJS(handleLiveIndexChange)(index);
        }
      },
      onMomentumEnd: (e) => {
        if (pageWidth <= 0) return;
        const index = clamp(
          Math.round(e.contentOffset.x / pageWidth),
          0,
          Math.max(assets.length - 1, 0),
        );
        runOnJS(handleSettledIndex)(index);
      },
    },
    [pageWidth, assets.length, handleLiveIndexChange, handleSettledIndex],
  );

  // -------------------------------------------------------------------------
  // Filmstrip (thumb tap + scrub)
  // -------------------------------------------------------------------------

  /** Jump the pager to `index` (thumb tap / scrub release). */
  const jumpToIndex = useCallback(
    (index: number, animated?: boolean) => {
      if (phaseRef.current !== "open" || dismissGuardRef.current) return;
      const clampedIndex = Math.min(
        Math.max(index, 0),
        Math.max(assetsRef.current.length - 1, 0),
      );
      // The held overlay must not sit frozen over a page change under it
      if (openHoldRef.current) {
        releaseOpenOverlayNow();
      }
      // Animate only single-step moves — a far jump would page-flip
      // through every photo in between (iPhone Photos cuts straight there)
      const shouldAnimate =
        animated ?? Math.abs(clampedIndex - activeIndexRef.current) === 1;
      activeIndexRef.current = clampedIndex;
      returnFramePrefetchRef.current = null;
      liveIndexSv.value = clampedIndex;
      setActiveIndex(clampedIndex);
      onActiveIndexChange?.(clampedIndex);
      setScrollEnabled(true);
      const offset = clampedIndex * pageSizeRef.current.pageWidth;
      // A non-animated jump fires no momentum end (and on some platforms no
      // scroll event) — sync the filmstrip position directly
      if (!shouldAnimate) {
        scrollX.value = offset;
      }
      pagerListRef.current?.scrollToOffset({ offset, animated: shouldAnimate });
    },
    [onActiveIndexChange, releaseOpenOverlayNow, scrollX, liveIndexSv],
  );

  const handleThumbSelect = useCallback(
    (index: number) => jumpToIndex(index),
    [jumpToIndex],
  );

  /**
   * Keeps the open viewer coherent when `assets` shrinks under it — deleting
   * the on-screen photo should advance to the next one, not tear the viewer
   * down. The pager's offset doesn't move, so the following photo simply
   * slides into the same index and the counter re-renders; only two cases
   * need handling: nothing left to show (close), and the deleted photo was
   * the last one (step back onto the new final page).
   */
  const assetCount = assets.length;
  useEffect(() => {
    if (phaseRef.current !== "open") return;
    if (assetCount === 0) {
      finishClose();
      return;
    }
    const maxIndex = assetCount - 1;
    if (activeIndexRef.current > maxIndex) {
      jumpToIndex(maxIndex, false);
    }
  }, [assetCount, finishClose, jumpToIndex]);

  /** Filmstrip drag — drive the pager directly, one page per thumb-width. */
  const handleScrub = useCallback(
    (offset: number) => {
      if (phaseRef.current !== "open" || dismissGuardRef.current) return;
      if (openHoldRef.current) {
        releaseOpenOverlayNow();
      }
      pagerListRef.current?.scrollToOffset({ offset, animated: false });
    },
    [releaseOpenOverlayNow],
  );

  const handleScrubEnd = useCallback(
    (index: number) => jumpToIndex(index, true),
    [jumpToIndex],
  );

  // Stable across renders (ref-read) so passing it can't break the pages'
  // memoization; only the active page can physically receive a double-tap
  const onDoubleTapAssetRef = useRef(onDoubleTapAsset);
  onDoubleTapAssetRef.current = onDoubleTapAsset;
  const handlePageDoubleTap = useCallback(() => {
    const asset = assetsRef.current[activeIndexRef.current];
    if (asset) {
      onDoubleTapAssetRef.current?.(asset);
    }
  }, []);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<MediaAsset>) => {
      const isActive = index === activeIndex;
      if (item.mediaType === "video") {
        return (
          <VideoPage
            asset={item}
            // A dismissing viewer pauses the active video before its poster
            // flies home in the overlay
            isActive={isActive && phase !== "dismissing"}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            chromeFit={chromeFit}
            fitAvailableHeight={fitBox.availableHeight}
            fitOffsetY={fitBox.offsetY}
            muted={videoMuted}
            backdropOpacity={backdropOpacity}
            onToggleChrome={handleToggleChrome}
            onRequestDismiss={handlePanDismiss}
            onDismissPanStart={handleDismissPanStart}
            onDismissPanEnd={handleDismissPanEnd}
            onActivePlayerChange={handleActivePlayerChange}
            onFirstImageLoad={isActive ? handleActiveImageLoad : undefined}
          />
        );
      }
      return (
        <PhotoPage
          asset={item}
          isActive={isActive}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          chromeFit={chromeFit}
          fitAvailableHeight={fitBox.availableHeight}
          fitOffsetY={fitBox.offsetY}
          backdropOpacity={backdropOpacity}
          onToggleChrome={handleToggleChrome}
          onZoomChange={handleZoomChange}
          onRequestDismiss={handlePanDismiss}
          onDismissPanStart={handleDismissPanStart}
          onDismissPanEnd={handleDismissPanEnd}
          onFirstImageLoad={isActive ? handleActiveImageLoad : undefined}
          onDoubleTapLike={onDoubleTapAsset ? handlePageDoubleTap : undefined}
        />
      );
    },
    [
      activeIndex,
      phase,
      pageWidth,
      pageHeight,
      chromeFit,
      fitBox,
      backdropOpacity,
      videoMuted,
      handleActivePlayerChange,
      handleToggleChrome,
      handleZoomChange,
      handlePanDismiss,
      handleDismissPanStart,
      handleDismissPanEnd,
      handleActiveImageLoad,
      onDoubleTapAsset,
      handlePageDoubleTap,
    ],
  );

  const keyExtractor = useCallback((item: MediaAsset) => item.id, []);

  const getItemLayout = useCallback(
    (_: ArrayLike<MediaAsset> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  const extraData = useMemo(
    () => ({ activeIndex, phase }),
    [activeIndex, phase],
  );

  const activeAsset: MediaAsset | undefined = assets[activeIndex];

  // iPhone-Photos-style date label: Today / Yesterday / drop the year for
  // dates in the current year
  const dateLabel = useMemo(() => {
    if (!activeAsset?.creationTime) return "";
    const date = dayjs(activeAsset.creationTime);
    if (!date.isValid()) return "";
    const now = dayjs();
    if (date.isSame(now, "day")) {
      return `Today · ${date.format("HH:mm")}`;
    }
    if (date.isSame(now.subtract(1, "day"), "day")) {
      return `Yesterday · ${date.format("HH:mm")}`;
    }
    if (date.isSame(now, "year")) {
      return date.format("D MMMM · HH:mm");
    }
    return date.format("D MMMM YYYY · HH:mm");
  }, [activeAsset?.creationTime]);

  // Library total keeps the denominator stable while more pages load in
  const totalItems = totalCount ?? assets.length;

  const backdropStyle = useAnimatedStyle(() => ({
    // During a flight the backdrop derives from the same progress value as
    // the flight rect, so it can never lag (or outrun) the flight
    opacity: flightActive.value
      ? clamp(
          flightBackdropFrom.value +
            (flightBackdropTo.value - flightBackdropFrom.value) *
              flightProgress.value,
          0,
          1,
        )
      : backdropOpacity.value,
  }));

  // The chrome's entrance progress: DURING the open flight this IS the
  // flight's own progress (identified by a backdrop target of 1 — dismiss
  // flights target 0), so every chrome piece moves in the one motion the
  // photo does; otherwise the settled chromeIntro value (1) applies.
  const chromeIntroProgress = useDerivedValue(() =>
    flightActive.value && flightBackdropTo.value === 1
      ? flightProgress.value
      : chromeIntro.value,
  );

  // Everything that fades the chrome, folded into one UI-thread value for
  // the social slot: the show/hide toggle and dismiss-flight fade
  // (chromeOpacity) and the pan-to-dismiss backdrop coupling. Entirely
  // worklet-driven so the overlay can never lag the chrome by a frame
  // (a JS-effect-driven fade starts late whenever the JS thread is busy).
  const socialVisibility = useDerivedValue(() => {
    const openFlight = flightActive.value && flightBackdropTo.value === 1;
    const dismissFade = openFlight
      ? 1
      : interpolate(
          backdropOpacity.value,
          [0.7, 1],
          [0, 1],
          Extrapolation.CLAMP,
        );
    return chromeOpacity.value * dismissFade;
  });

  const chromeStyle = useAnimatedStyle(() => ({
    opacity: chromeOpacity.value * chromeIntroProgress.value,
    // Entrance only (progress idles at 1 afterwards): the header glides
    // down into place along the same curve the photo flies
    transform: [{ translateY: (1 - chromeIntroProgress.value) * -12 }],
  }));

  // The filmstrip fades with the chrome toggle AND with the pan-to-dismiss
  // backdrop — a photo being dragged away must not leave the strip floating
  // over the reappearing grid. It enters in the same flight motion as
  // everything else, rising into place.
  const bottomChromeStyle = useAnimatedStyle(() => {
    // backdropOpacity idles at 0 until an open flight LANDS — during the
    // flight the entrance is chromeIntroProgress's job, so the dismiss
    // coupling must not also zero the strip out
    const openFlight = flightActive.value && flightBackdropTo.value === 1;
    const dismissFade = openFlight
      ? 1
      : interpolate(
          backdropOpacity.value,
          [0.7, 1],
          [0, 1],
          Extrapolation.CLAMP,
        );
    return {
      opacity:
        chromeOpacity.value * chromeIntroProgress.value * dismissFade,
      transform: [{ translateY: (1 - chromeIntroProgress.value) * 16 }],
    };
  });

  // The video scrub bar fades exactly like the filmstrip (chrome toggle,
  // entrance, pan-to-dismiss coupling) but lives in its own layer: it must
  // exist without a filmstrip (single-asset viewers) and always render
  // ABOVE the strip, never behind it.
  const videoControlsStyle = useAnimatedStyle(() => {
    const openFlight = flightActive.value && flightBackdropTo.value === 1;
    const dismissFade = openFlight
      ? 1
      : interpolate(
          backdropOpacity.value,
          [0.7, 1],
          [0, 1],
          Extrapolation.CLAMP,
        );
    return {
      opacity:
        chromeOpacity.value * chromeIntroProgress.value * dismissFade,
      transform: [{ translateY: (1 - chromeIntroProgress.value) * 16 }],
    };
  });

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  // Outer flight "window": fixed layout at the fitted rect (flight.base),
  // moved and stretched along R(p) = lerp(from, to, p) purely via
  // transforms. Reanimated transforms are centre-origin, and array order
  // applies translate in parent (unscaled) space — translate to R(p)'s
  // centre first, then scale the window to R(p)'s size.
  const flightWindowStyle = useAnimatedStyle(() => {
    const p = flightProgress.value;
    const f = flightFrom.value;
    const t = flightTo.value;
    const b = flightBase.value;
    const bw = Math.max(b.width, 0.001);
    const bh = Math.max(b.height, 0.001);
    const w = Math.max(f.width + (t.width - f.width) * p, 0.001);
    const h = Math.max(f.height + (t.height - f.height) * p, 0.001);
    const cx =
      f.x + f.width / 2 + (t.x + t.width / 2 - (f.x + f.width / 2)) * p;
    const cy =
      f.y + f.height / 2 + (t.y + t.height / 2 - (f.y + f.height / 2)) * p;
    // Corner radius is authored in screen px, but the window renders its
    // radius pre-transform — divide out the scale so the drawn corners
    // match the grid cell at the endpoint. The scale is anisotropic, so a
    // scalar radius can't be exact on both axes mid-morph; the geometric
    // mean splits the error, and it vanishes as the aspects converge.
    const rScreen =
      flightRadiusFrom.value + (flightRadiusTo.value - flightRadiusFrom.value) * p;
    const borderRadius =
      rScreen > 0 ? rScreen / Math.sqrt((w / bw) * (h / bh)) : 0;
    return {
      opacity: flightOpacity.value,
      borderRadius,
      transform: [
        { translateX: cx - (b.x + bw / 2) },
        { translateY: cy - (b.y + bh / 2) },
        { scaleX: w / bw },
        { scaleY: h / bh },
      ],
    };
  });

  // Inner image wrapper: fixed layout at the fitted size, counter-scaled so
  // the image stays uniformly scaled (never distorted) while the window's
  // aspect morphs. u(p) is the uniform cover factor of the fitted image for
  // the current window; combined with the outer scale the image's total
  // scale is exactly u(p) on both axes, rendering a centre-cover crop —
  // identical to the grid thumbnail at p=0 and to the pager page at p=1.
  const flightImageStyle = useAnimatedStyle(() => {
    const p = flightProgress.value;
    const f = flightFrom.value;
    const t = flightTo.value;
    const b = flightBase.value;
    const bw = Math.max(b.width, 0.001);
    const bh = Math.max(b.height, 0.001);
    const w = Math.max(f.width + (t.width - f.width) * p, 0.001);
    const h = Math.max(f.height + (t.height - f.height) * p, 0.001);
    const u = Math.max(w / bw, h / bh);
    return {
      transform: [{ scaleX: (u * bw) / w }, { scaleY: (u * bh) / h }],
    };
  });

  // The pager exists only after landing ("opening" renders nothing but the
  // backdrop and the flight overlay, so the flight owns both threads), and
  // is hidden — in the same commit the dismiss overlay appears — for
  // overlay dismissals. It unmounts with the modal at close. The ref read
  // is safe: pagerLandedRef only changes together with a phase transition,
  // so every render that consults it is already up to date.
  const pagerMounted =
    (phase === "open" || phase === "dismissing") && pagerLandedRef.current;
  const pagerHidden = phase === "dismissing" && flight != null;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={handleRequestClose}
    >
      {/* Modal creates a new native root — gestures need their own root view */}
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.root, contentStyle]}>
          {/* Measured root: the flight overlay's coordinate base */}
          <View
            ref={rootRef}
            style={styles.root}
            onLayout={handleRootLayout}
            collapsable={false}
          >
            {/* hidden only ever changes while the viewer is at rest ("open"
                with the chrome toggle) — never mid-flight, where the iOS
                status-bar window animation would hitch the transition */}
            <StatusBar
              hidden={!chromeVisible}
              animated
              barStyle="light-content"
            />
            {/* Solid black (iPhone-Photos style) — a live blur here was a
                continuous GPU cost on weaker devices for a layer that is
                fully opaque whenever the viewer is at rest. Pan-to-dismiss
                still reveals the grid by fading this layer's opacity. */}
            <Animated.View
              style={[styles.backdrop, backdropStyle]}
              pointerEvents="none"
            />
            {pagerMounted && (
              <View
                style={[styles.pagerWrapper, pagerHidden && styles.hidden]}
                // Inert while a flight is running — and from the very first
                // synchronous moment a dismiss/close was requested, before
                // its async landing resolution (interactionLocked)
                pointerEvents={
                  phase === "open" && !interactionLocked ? "auto" : "none"
                }
              >
                <Animated.FlatList
                  ref={pagerListRef}
                  style={styles.pagerList}
                  data={assets}
                  renderItem={renderItem}
                  keyExtractor={keyExtractor}
                  extraData={extraData}
                  horizontal
                  pagingEnabled
                  scrollEnabled={scrollEnabled}
                  initialScrollIndex={Math.min(
                    initialIndex,
                    Math.max(assets.length - 1, 0),
                  )}
                  getItemLayout={getItemLayout}
                  windowSize={3}
                  initialNumToRender={1}
                  maxToRenderPerBatch={2}
                  showsHorizontalScrollIndicator={false}
                  onScroll={pagerScrollHandler}
                  scrollEventThrottle={16}
                  onEndReached={onEndReached}
                  onEndReachedThreshold={2}
                />
              </View>
            )}
            {flight != null && (
              <Animated.View
                style={[
                  styles.flightWindow,
                  // Static hidden fallback for open flights — see
                  // FlightSession.open. The animated style's opacity takes
                  // over the moment it attaches.
                  flight.open === true && styles.flightWindowOpenInit,
                  {
                    left: flight.base.x,
                    top: flight.base.y,
                    width: flight.base.width,
                    height: flight.base.height,
                  },
                  flightWindowStyle,
                ]}
                pointerEvents="none"
              >
                <Animated.View
                  style={[styles.flightImageWrap, flightImageStyle]}
                >
                  {/* Fixed fitted-rect layouts: each decodes once at mount
                      (with the double-rAF head start), never re-decodes
                      mid-flight. The thumbnail underlay carries the flight
                      until the full-res has downloaded — it painted in the
                      grid, so it comes straight from cache. */}
                  {flight.thumbUri != null && (
                    <Image
                      source={{ uri: flight.thumbUri, cacheKey: stableCacheKey(flight.thumbUri) }}
                      style={styles.media}
                      contentFit={flight.contain ? "contain" : "cover"}
                      recyclingKey={`${flight.id}-thumb`}
                      cachePolicy="memory-disk"
                      priority="high"
                      transition={0}
                      onLoad={handleFlightImagePaint}
                    />
                  )}
                  <Image
                    source={{ uri: flight.uri, cacheKey: stableCacheKey(flight.uri) }}
                    style={styles.media}
                    contentFit={flight.contain ? "contain" : "cover"}
                    recyclingKey={flight.id}
                    cachePolicy={cachePolicyFor(flight.uri)}
                    priority="high"
                    transition={0}
                    onLoad={handleFlightImagePaint}
                  />
                </Animated.View>
              </Animated.View>
            )}
            {/* Chrome mounts for "opening" too — it rides the flight's
                progress in (chromeIntroProgress starts at 0, so the mount
                commit is invisible). "closed" stays excluded: it includes
                the first commit of an open (the phase flips in an effect),
                where a mounting filmstrip could flash a static frame
                before its animated style attaches. */}
            {phase !== "closed" && (
              <Animated.View
                style={[styles.chrome, { paddingTop: insets.top }, chromeStyle]}
                pointerEvents={
                  phase === "open" && chromeVisible ? "auto" : "none"
                }
              >
                <LinearGradient
                  colors={["rgba(0, 0, 0, 0.55)", "transparent"]}
                  style={styles.chromeGradient}
                  pointerEvents="none"
                />
                <View style={styles.chromeRow}>
                  <Pressable
                    onPress={handleClosePress}
                    style={styles.closeButton}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={26} color="#fff" />
                  </Pressable>
                  <View style={styles.chromeCenter}>
                    {dateLabel !== "" && (
                      <Text style={styles.chromeDate} numberOfLines={1}>
                        {dateLabel}
                      </Text>
                    )}
                    <Text style={styles.chromeCounter}>
                      {totalItems > 0
                        ? `${activeIndex + 1} of ${totalItems}`
                        : ""}
                    </Text>
                  </View>
                  {/* Spacer mirroring the close button keeps the title centered */}
                  <View style={styles.closeButton} />
                </View>
              </Animated.View>
            )}
            {phase !== "closed" &&
              assets.length > 1 && (
              <Animated.View
                style={[
                  styles.bottomChrome,
                  { paddingBottom: insets.bottom + 8 },
                  bottomChromeStyle,
                ]}
                pointerEvents={
                  chromeVisible && phase === "open" && !interactionLocked
                    ? "box-none"
                    : "none"
                }
              >
                <LinearGradient
                  colors={[
                    "transparent",
                    "rgba(0, 0, 0, 0.08)",
                    "rgba(0, 0, 0, 0.22)",
                    "rgba(0, 0, 0, 0.34)",
                  ]}
                  locations={[0, 0.4, 0.75, 1]}
                  style={styles.bottomChromeGradient}
                  pointerEvents="none"
                />
                <Filmstrip
                  assets={assets}
                  pageWidth={pageWidth}
                  scrollX={scrollX}
                  activeIndex={activeIndex}
                  onSelect={handleThumbSelect}
                  onScrub={handleScrub}
                  onScrubEnd={handleScrubEnd}
                />
              </Animated.View>
            )}
            {/* Video scrub bar — part of the chrome (fades with it via the
                same worklet math), seated just above the filmstrip and
                rendered after it, so it is always ON TOP. The social bar's
                bottomInset accounts for this row on video pages. */}
            {phase !== "closed" &&
              activeAsset?.mediaType === "video" &&
              activeVideoPlayer != null && (
                <Animated.View
                  style={[
                    styles.videoControlsRow,
                    {
                      bottom:
                        insets.bottom +
                        8 +
                        (assets.length > 1 ? FILMSTRIP_HEIGHT + 14 : 6),
                    },
                    videoControlsStyle,
                  ]}
                  pointerEvents={
                    chromeVisible && phase === "open" && !interactionLocked
                      ? "box-none"
                      : "none"
                  }
                >
                  <VideoScrubBar
                    player={activeVideoPlayer}
                    muted={videoMuted}
                    onToggleMute={handleToggleVideoMute}
                  />
                </Animated.View>
              )}
            {/* Context-specific social layer — mounted from the open
                flight all the way through dismissal so it rides the same
                intro progress in and the same chrome fade out as the rest
                of the chrome, but inert unless the viewer is settled
                open. Sits above both chrome layers so sheets it opens
                cover them. */}
            {phase !== "closed" &&
              activeAsset != null &&
              renderSocialOverlay != null && (
                <View
                  style={StyleSheet.absoluteFill}
                  pointerEvents={
                    phase === "open" && !interactionLocked
                      ? "box-none"
                      : "none"
                  }
                >
                  {renderSocialOverlay({
                    asset: activeAsset,
                    chromeVisible,
                    intro: chromeIntroProgress,
                    visibility: socialVisibility,
                    bottomInset:
                      insets.bottom +
                      8 +
                      (assets.length > 1 ? FILMSTRIP_HEIGHT + 12 : 12) +
                      // Clear the video scrub bar so the social bar sits
                      // above it instead of colliding
                      (activeAsset.mediaType === "video"
                        ? VIDEO_CONTROLS_HEIGHT + 6
                        : 0),
                    requestClose: handleClosePress,
                  })}
                </View>
              )}
          </View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  pagerWrapper: {
    flex: 1,
  },
  pagerList: {
    flex: 1,
  },
  hidden: {
    display: "none",
  },
  flightWindow: {
    position: "absolute",
    overflow: "hidden",
  },
  flightWindowOpenInit: {
    opacity: 0,
  },
  flightImageWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  page: {
    height: "100%",
    justifyContent: "center",
  },
  pageMedia: {
    ...StyleSheet.absoluteFillObject,
  },
  pageMediaCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  fittedClip: {
    overflow: "hidden",
  },
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playPauseButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(20, 20, 22, 0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Optical centering: the play triangle reads left-heavy in a circle
  playIconNudge: {
    marginLeft: 3,
  },
  videoPosterFallback: {
    backgroundColor: "#101012",
  },
  videoControlsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: VIDEO_CONTROLS_HEIGHT,
    justifyContent: "center",
  },
  videoControlsInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  videoTimeText: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    minWidth: 34,
    textAlign: "center",
  },
  videoTrackTouch: {
    flex: 1,
    height: 30,
    justifyContent: "center",
  },
  videoTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
    overflow: "hidden",
  },
  videoTrackFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 1.5,
  },
  videoKnob: {
    position: "absolute",
    top: 10,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    marginLeft: -5.5,
    backgroundColor: "#fff",
  },
  videoMuteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  chrome: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  chromeGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    // Extend the scrim past the content row so it fades out, not cuts off
    bottom: -CHROME_GRADIENT_EXTENSION,
  },
  chromeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  chromeCenter: {
    flex: 1,
    alignItems: "center",
  },
  chromeDate: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  chromeCounter: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    marginTop: 1,
  },
  bottomChrome: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
  },
  bottomChromeGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: -BOTTOM_CHROME_GRADIENT_EXTENSION,
  },
});

export default PhotoViewer;
