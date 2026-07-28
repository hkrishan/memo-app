/**
 * The PhotoViewer's zoomable photo page: pinch/pan/double-tap, the
 * thumbnail underlay while the full-res streams in, and the pan-to-dismiss
 * gesture that drives the viewer's return flight.
 *
 * Split out of PhotoViewer purely to keep that file readable; the contract
 * with the viewer is unchanged.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  withDecay,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import type { MediaAsset } from "@/features/album/hooks";
import { useResolvedAssetUri } from "@/features/album/hooks";
import { stableCacheKey } from "@/lib/imageCache";
import type { Frame } from "../types";
import {
  cachePolicyFor,
  displayUriFor,
  chromeFitScale,
  clamp,
  fitRect,
  panBounds,
  thumbnailUnderlayUri,
} from "./geometry";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
const SPRING_CONFIG = { damping: 30, stiffness: 300, mass: 0.6 };
/** Overshoot damping while dragging past the pan bounds. */
const RUBBER_FACTOR = 0.35;
/** Cap on release velocity fed into the decay — a finger-lift can report a
 *  one-frame centroid spike that would otherwise fling the photo. */
const MAX_FLING_VELOCITY = 2400;
/** Same 15pt threshold the old activeOffset/failOffset config used. */
const PAN_SLOP = 15;

/** clamp() with give: past the edge, movement continues at RUBBER_FACTOR
 *  so the drag resists instead of hitting a wall (iOS Photos feel). */
const rubberClamp = (value: number, min: number, max: number): number => {
  "worklet";
  if (value < min) return min + (value - min) * RUBBER_FACTOR;
  if (value > max) return max + (value - max) * RUBBER_FACTOR;
  return value;
};
const PAGE_RADIUS = 12;
const DISMISS_RADIUS = 24;
const DISMISS_RADIUS_TRAVEL = 100;
// Fraction of the page height of drag travel at which the dismiss shrink
// bottoms out — smaller means the photo scales down faster
const DISMISS_SCALE_TRAVEL_RATIO = 0.4;
// Scale the photo shrinks to at full dismiss travel
const DISMISS_MIN_SCALE = 0.52;

interface PhotoPageProps {
  asset: MediaAsset;
  isActive: boolean;
  /** Per-page uploader pill — travels with this page while swiping. */
  attribution?: React.ReactNode;
  /** Chrome-synced fade for the attribution (intro x visibility). */
  attributionOpacity?: SharedValue<number>;
  /** One page either side of the active one — preloads its full image. */
  isAdjacent: boolean;
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

export const PhotoPage = memo<PhotoPageProps>(
  ({
    asset,
    isActive,
    attribution,
    attributionOpacity,
    isAdjacent,
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
    const isZoomedRef = useRef(false);

    // Which URI the full-res Image has painted — compared against the
    // current asset.uri (not a boolean) so a URI change can never leave the
    // underlay wrongly hidden behind a stale flag
    const [loadedUri, setLoadedUri] = useState<string | null>(null);
    const thumbUri = thumbnailUnderlayUri(asset);
    const showThumbUnderlay = thumbUri != null && loadedUri !== asset.uri;

    // The page you land on always loads its full image; an ADJACENT page
    // preloads too, so a swipe arrives on a decoded frame instead of a
    // 640px thumbnail that visibly sharpens. That preload is only
    // affordable because the source is the screen-sized derivative — this
    // used to be the multi-megabyte original, where three in flight per
    // swipe is exactly what made large albums stutter. Once loaded, a page
    // keeps its image through later swipes, so paging back is instant.
    const [reachedActive, setReachedActive] = useState(isActive || isAdjacent);
    useEffect(() => {
      if (isActive || isAdjacent) {
        setReachedActive(true);
      }
    }, [isActive, isAdjacent]);
    const showFullRes = reachedActive || thumbUri == null;
    // Screen-sized derivative when the server made one — paging must not
    // decode the multi-megabyte original
    const fullUri = displayUriFor(asset);

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
    // First-touch origin for the manual activation decision
    const panTouchStartX = useSharedValue(0);
    const panTouchStartY = useSharedValue(0);
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

    // No setState here: flipping React state at pinch release rebuilt the
    // pan gesture and committed a re-render exactly when the settle springs
    // were running — the release hitch. Zoom state lives in shared values /
    // refs; activation is decided per-move in the worklet below.
    const setZoomed = useCallback(
      (zoomed: boolean) => {
        isZoomedRef.current = zoomed;
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
            // Freeze the pager NOW, not at pinch end: while scrollEnabled
            // is still true the FlatList's native pan competes with the
            // pinch, and any horizontal drift between the two fingers
            // pages the carousel mid-zoom — the "laggy zoom" jitter.
            // (Deliberately not setZoomed: the local isZoomed state waits
            // for onEnd so the pan gesture's config can't rebuild while
            // fingers are still down.)
            runOnJS(onZoomChange)(true);
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
            // A finger lifting mid-pinch can emit one last update whose
            // focal has jumped from the midpoint to the surviving finger —
            // applying it shifts the photo by half the finger separation
            if (e.numberOfPointers < 2) return;
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
              // Hand over at the CURRENT (possibly out-of-bounds) position.
              // Snapping to clamped here is what caused the release jump:
              // with one finger still down, the continuing pan's next frame
              // re-asserted the clamped target and teleported the photo by
              // the whole overshoot. The pan's rubber clamp + the release
              // decay bring it back into bounds smoothly instead.
              savedTranslateX.value = translateX.value;
              savedTranslateY.value = translateY.value;
              runOnJS(setZoomed)(true);
            }
          })
          .onFinalize(() => {
            // Covers cancellation paths that skip onEnd: a pinch that dies
            // at 1x must hand the pager back (onStart froze it)
            if (scale.value <= MIN_SCALE) {
              runOnJS(setZoomed)(false);
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
        onZoomChange,
      ],
    );

    const panGesture = useMemo(() => {
      const gesture = Gesture.Pan()
        .maxPointers(2)
        // Activation is decided in onTouchesMove instead of via
        // activeOffset/failOffset config, so the gesture object NEVER has
        // to be rebuilt when zoom starts or ends (a rebuild re-attaches
        // the recognizer — mid-interaction, that's a visible stutter)
        .manualActivation(true)
        .onTouchesDown((e) => {
          if (e.numberOfTouches === 1) {
            const touch = e.allTouches[0];
            if (touch) {
              panTouchStartX.value = touch.x;
              panTouchStartY.value = touch.y;
            }
          }
        })
        .onTouchesMove((e, manager) => {
          // Zoomed (or pinching, or two fingers down): the pan is ours
          if (
            scale.value > 1 ||
            pinchActive.value ||
            e.numberOfTouches >= 2
          ) {
            manager.activate();
            return;
          }
          // 1x, one finger — the old declarative constraints, per-move:
          // dominant-vertical drags activate (dismiss), dominant-horizontal
          // fail fast so the FlatList can page
          const touch = e.allTouches[0];
          if (!touch) return;
          const dx = touch.x - panTouchStartX.value;
          const dy = touch.y - panTouchStartY.value;
          if (Math.abs(dx) > PAN_SLOP || Math.abs(dy) > PAN_SLOP) {
            if (Math.abs(dy) > Math.abs(dx)) {
              manager.activate();
            } else {
              manager.fail();
            }
          }
        })
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
            translateX.value = rubberClamp(
              savedTranslateX.value +
                (e.translationX - panBaseTranslationX.value),
              -bounds.x,
              bounds.x,
            );
            translateY.value = rubberClamp(
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
            // Zoomed pan: carry the release velocity into a decay glide,
            // rubber-banding at the pan bounds — a flick coasts instead of
            // stopping dead under the finger
            if (scale.value > 1 && !pinchActive.value) {
              const bounds = panBounds(
                scale.value,
                fittedWidth,
                fittedHeight,
                pageWidth,
                pageHeight,
              );
              translateX.value = withDecay({
                velocity: clamp(e.velocityX, -MAX_FLING_VELOCITY, MAX_FLING_VELOCITY),
                clamp: [-bounds.x, bounds.x],
                rubberBandEffect: true,
              });
              translateY.value = withDecay({
                velocity: clamp(e.velocityY, -MAX_FLING_VELOCITY, MAX_FLING_VELOCITY),
                clamp: [-bounds.y, bounds.y],
                rubberBandEffect: true,
              });
            }
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
              [0, pageHeight * DISMISS_SCALE_TRAVEL_RATIO],
              [1, DISMISS_MIN_SCALE],
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

      return gesture;
    }, [
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

    const attributionFadeStyle = useAnimatedStyle(() => ({
      opacity: attributionOpacity ? attributionOpacity.value : 1,
    }));

    const animatedStyle = useAnimatedStyle(() => {
      // Shrink slightly as the photo is dragged away during dismiss —
      // driven by how far it has travelled in any direction
      const travel = Math.sqrt(
        dismissTranslateX.value * dismissTranslateX.value +
          dismissTranslateY.value * dismissTranslateY.value,
      );
      const dismissScale = interpolate(
        travel,
        [0, pageHeight * DISMISS_SCALE_TRAVEL_RATIO],
        [1, DISMISS_MIN_SCALE],
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
          {attribution != null && (
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.attributionLayer, attributionFadeStyle]}
              pointerEvents="none"
            >
              {attribution}
            </Animated.View>
          )}
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
                  source={{
                    uri: thumbUri,
                    // Full-screen decode of the same object the grids draw
                    // small — a shared key would reuse their bitmap
                    cacheKey: stableCacheKey(thumbUri, "full"),
                  }}
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
                  source={{ uri: fullUri, cacheKey: stableCacheKey(fullUri, "full") }}
                  style={styles.media}
                  contentFit="contain"
                  recyclingKey={asset.id}
                  cachePolicy={cachePolicyFor(fullUri)}
                  transition={0}
                  // The active page is what the user is waiting on; a
                  // preloading neighbour must never outrank it
                  priority={isActive ? "high" : "low"}
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


const styles = StyleSheet.create({
  // Above the page's media siblings (the pill is declared first in the
  // tree so gestures/transforms stay untouched underneath)
  attributionLayer: {
    zIndex: 10,
  },
  // Verbatim from the pre-split PhotoViewer: the thumb underlay and the
  // full-res image are siblings that must OVERLAY (absolute fill) — as
  // in-flow 100% blocks the full-res stacked below and was clipped.
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  fittedClip: {
    overflow: "hidden",
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
});
