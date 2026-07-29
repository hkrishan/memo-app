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
  useAnimatedProps,
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
 * Slightly underdamped return spring (~0.91 damping ratio) — the photo
 * barely dips past the cell before settling, just a hint of give.
 */
const RETURN_SPRING = {
  damping: 26,
  stiffness: 340,
  mass: 0.6,
  overshootClamping: false,
};
/** How long getReturnFrame may take before the dismiss falls back. */
const RETURN_FRAME_TIMEOUT = 350;

import { PhotoPage } from "./photoViewer/PhotoPage";
import {
  VideoPage,
  VideoScrubBar,
  VIDEO_CONTROLS_HEIGHT,
} from "./photoViewer/VideoPage";
import {
  cachePolicyFor,
  chromeFitScale,
  clamp,
  fitRect,
  flightUriFor,
  panBounds,
  thumbnailUnderlayUri,
  withTimeoutNull,
} from "./photoViewer/geometry";

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
   * Per-PAGE chrome (the uploader pill): rendered inside each pager item so
   * it travels with its photo during swipes, unlike renderSocialOverlay
   * which is one fixed layer for the active page.
   */
  renderPageAttribution?: (asset: MediaAsset) => React.ReactNode;
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
  renderPageAttribution,
  onDoubleTapAsset,
}) => {
  const insets = useSafeAreaInsets();
  // Actual window size (excludes Android status/nav bars where relevant) so
  // gesture math and paging stay correct across devices and rotation
  const { width: pageWidth, height: pageHeight } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  // Shared value + animated prop, NOT React state: paging is toggled at
  // pinch start/end, and a state flip there commits a full viewer
  // re-render mid-gesture — the release hitch. This path never renders.
  const scrollEnabledSV = useSharedValue(true);
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
  const pagerAnimatedProps = useAnimatedProps(() => ({
    scrollEnabled: scrollEnabledSV.value,
  }));

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

  // Page-attribution pills fade exactly like the social overlay: in with
  // the viewer's intro, out with the chrome. Declaration ORDER matters for
  // all three: worklet closures capture what exists at this point in the
  // body, so these sit right after the shared values they read and before
  // renderItem, which consumes them.
  const pageAttributionOpacity = useDerivedValue(
    () => chromeIntroProgress.value * socialVisibility.value,
  );

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
      const fitTarget = next && scrollEnabledSV.value ? 1 : 0;
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
      scrollEnabledSV.value = !zoomed;
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
      scrollEnabledSV.value = true;
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
      scrollEnabledSV.value = true;
    },
    [onActiveIndexChange],
  );

  // The asset count crosses into the scroll worklet as a shared value:
  // with `assets.length` in the handler's deps, paginating mid-swipe
  // rebuilt and re-attached the scroll worklet while the pager was moving
  const assetCountSv = useSharedValue(assets.length);
  useEffect(() => {
    assetCountSv.value = assets.length;
  }, [assets.length, assetCountSv]);

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
          Math.max(assetCountSv.value - 1, 0),
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
          Math.max(assetCountSv.value - 1, 0),
        );
        runOnJS(handleSettledIndex)(index);
      },
    },
    [pageWidth, handleLiveIndexChange, handleSettledIndex],
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
      scrollEnabledSV.value = true;
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
      const isAdjacent = Math.abs(index - activeIndex) === 1;
      const attribution = renderPageAttribution
        ? renderPageAttribution(item)
        : null;
      if (item.mediaType === "video") {
        return (
          <VideoPage
            asset={item}
            attribution={attribution}
            attributionOpacity={pageAttributionOpacity}
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
          attribution={attribution}
          attributionOpacity={pageAttributionOpacity}
          isActive={isActive}
          isAdjacent={isAdjacent}
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
      renderPageAttribution,
      pageAttributionOpacity,
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
                  animatedProps={pagerAnimatedProps}
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
                      source={{
                        uri: flight.thumbUri,
                        cacheKey: stableCacheKey(flight.thumbUri, "full"),
                      }}
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
                    source={{
                      uri: flight.uri,
                      cacheKey: stableCacheKey(flight.uri, "full"),
                    }}
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
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  // Optical centering: the play triangle reads left-heavy in a circle
  videoControlsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: VIDEO_CONTROLS_HEIGHT,
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
