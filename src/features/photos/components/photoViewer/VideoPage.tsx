/**
 * The PhotoViewer's video surfaces: the page itself (custom chrome — the
 * native controls are off) and the scrub bar it seats above the filmstrip.
 *
 * Split out of PhotoViewer purely to keep that file readable; the contract
 * with the viewer is unchanged.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Image } from "expo-image";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
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
import { cachePolicyFor, chromeFitScale } from "./geometry";

const SPRING_CONFIG = { damping: 30, stiffness: 300, mass: 0.6 };
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
// Fraction of the page height of drag travel at which the dismiss shrink
// bottoms out — smaller means the video scales down faster
const DISMISS_SCALE_TRAVEL_RATIO = 0.4;
// Scale the video shrinks to at full dismiss travel
const DISMISS_MIN_SCALE = 0.52;

/**
 * Height of the video scrub-bar row the viewer seats just above the
 * filmstrip. The social overlay's bottomInset accounts for it on video
 * pages so the like/comment bar never collides with the scrubber.
 */
export const VIDEO_CONTROLS_HEIGHT = 38;
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
 * Remote videos prefer the screen-sized display poster (the 640px grid
 * thumbnail blown up to fullscreen is visibly pixelated), falling back to
 * the thumbnail for videos uploaded before display posters existed; local
 * library videos' ph://-style uris render as poster frames directly. A
 * remote video with no poster has NO renderable image — null yields the
 * dark fallback tile.
 */
const videoPosterUri = (asset: MediaAsset): string | null => {
  if (asset.displayUrl) {
    return asset.displayUrl;
  }
  if (asset.thumbnailUrl && asset.thumbnailUrl !== asset.uri) {
    return asset.thumbnailUrl;
  }
  return asset.uri.startsWith("http") ? null : asset.uri;
};

interface VideoPageProps {
  asset: MediaAsset;
  isActive: boolean;
  /**
   * One page either side of the active one. Adjacent video pages get a
   * real (paused) player so AVPlayer pulls the moov atom and its first
   * buffer BEFORE the swipe lands — arriving on a cold video was the
   * whole time-to-first-frame users felt.
   */
  isAdjacent?: boolean;
  /** Per-page uploader pill — see PhotoPageProps.renderAttribution for why
   *  this is a render function and not a prebuilt element. */
  renderAttribution?: (asset: MediaAsset) => React.ReactNode;
  /** Chrome-synced fade for the attribution (intro x visibility). */
  attributionOpacity?: SharedValue<number>;
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

export const VideoPage = memo<VideoPageProps>(
  ({
    asset,
    isActive,
    isAdjacent = false,
    renderAttribution,
    attributionOpacity,
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
    // NOTE (2026-07-29): do NOT defer the adjacent source attach off the
    // settle frame (tried as a `sourceEnabled` timer to shave swipe-settle
    // JS stalls, reverted same day). useVideoPlayer RELEASES and recreates
    // the player whenever its source argument changes — deferral let the
    // flip happen AT activation, after the player was registered with the
    // viewer chrome, and the scrub bar then read `player.playing` on the
    // released object (NativeSharedObjectNotFoundException). The current
    // shape is safe precisely because the source attaches while the page
    // is still adjacent, before anything else holds the player.

    // ph:// URIs are not reliably playable — resolve to a local file URI
    const { resolvedUri } = useResolvedAssetUri({
      assetId: asset.id,
      uri: asset.uri,
      enabled: isActive || isAdjacent,
    });

    // Active AND adjacent pages get a real source — the adjacent player
    // sits paused, pre-buffering, so the swipe lands on warm bytes. Pages
    // further out hold a null source so nothing loads or plays (and the
    // player is released on unmount). Remote sources cache to disk:
    // re-watching (or re-entering the viewer) must not re-download a
    // multi-MB clip. The cache keys on the full URL, so a hit lasts as
    // long as the signed URL's 24h signing window — good enough.
    const player = useVideoPlayer(
      isActive || isAdjacent
        ? {
            uri: resolvedUri,
            useCaching: resolvedUri.startsWith("http"),
          }
        : null,
      (p) => {
        p.loop = false;
        // Start playback after a small forward buffer instead of AVPlayer's
        // conservative automatic target — these are short social clips, not
        // long-form streams, and time-to-first-frame is what users feel
        p.bufferOptions = { preferredForwardBufferDuration: 2 };
      },
    );

    const { isPlaying } = useEvent(player, "playingChange", {
      isPlaying: player.playing,
    });

    // A source the native player rejects (unreadable file, unreachable
    // URL) previously froze on the poster with a dead play button and no
    // signal anywhere — surface it instead.
    const playerStatus = useEvent(player, "statusChange", {
      status: player.status,
    });
    const playbackFailed = playerStatus.status === "error";
    useEffect(() => {
      if (playerStatus.status === "error" && __DEV__) {
        console.warn(
          "Video playback failed:",
          playerStatus.error?.message ?? "unknown error",
          resolvedUri,
        );
      }
    }, [playerStatus.status, playerStatus.error, resolvedUri]);

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
    const showCenterButton =
      showPlayer && !playbackFailed && (!isPlaying || centerFlash);

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
                [0, pageHeight * DISMISS_SCALE_TRAVEL_RATIO],
                [1, DISMISS_MIN_SCALE],
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

    const attributionFadeStyle = useAnimatedStyle(() => ({
      opacity: attributionOpacity ? attributionOpacity.value : 1,
    }));

    const fitStyle = useAnimatedStyle(() => {
      // Shrink as the video is dragged away, exactly like the photo
      // pages; the chrome-fit transform rides inside the dismiss
      // transforms so the drag tracks the finger 1:1
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

    const attribution = renderAttribution ? renderAttribution(asset) : null;

    return (
      <GestureDetector gesture={dismissPanGesture}>
      <View style={[styles.page, { width: pageWidth }]}>
        {attribution != null && (
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.attributionLayer, attributionFadeStyle]}
            pointerEvents="none"
          >
            {attribution}
          </Animated.View>
        )}
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
                  source={{ uri: posterUri, cacheKey: stableCacheKey(posterUri, "full") }}
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
              {playbackFailed ? (
                <View style={styles.playbackErrorWrap}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={34}
                    color="rgba(255, 255, 255, 0.9)"
                  />
                  <Text style={styles.playbackErrorText}>
                    Couldn't play this video
                  </Text>
                </View>
              ) : showCenterButton ? (
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
export const VideoScrubBar = memo<VideoScrubBarProps>(
  ({ player, muted, onToggleMute }) => {
    const [time, setTime] = useState({ current: 0, duration: 0 });
    // Fraction being scrubbed (null when idle) — drives the current-time
    // LABEL only; the bar itself tracks on the UI thread
    const [scrubFraction, setScrubFraction] = useState<number | null>(null);
    const scrubbingRef = useRef(false);
    const lastSeekAtRef = useRef(0);

    const { isPlaying } = useEvent(player, "playingChange", {
      isPlaying: player.playing,
    });

    // UI-thread mirrors: the drag writes these directly. The old shape
    // round-tripped EVERY pan frame through runOnJS + setState and laid
    // out a percentage width per frame.
    const fillFraction = useSharedValue(0);
    const barWidth = useSharedValue(0);
    const lastSentAt = useSharedValue(0);
    const scrubbingSv = useSharedValue(false);

    useEffect(() => {
      const read = () => {
        if (scrubbingRef.current || scrubbingSv.value) return;
        try {
          const current = player.currentTime;
          const duration = player.duration;
          if (!Number.isFinite(current) || !Number.isFinite(duration)) return;
          if (duration > 0) {
            fillFraction.value = Math.min(current / duration, 1);
          }
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
      // Poll only while playing — a paused position doesn't move, and the
      // old unconditional interval kept ticking while paused/hidden
      if (!isPlaying) return;
      const id = setInterval(read, 250);
      return () => clearInterval(id);
    }, [player, isPlaying, fillFraction, scrubbingSv]);

    /** JS-side scrub commit: label + (throttled) live seek. Reached at
     *  most ~6x/s from the drag worklet, never per frame. */
    const applyScrub = useCallback(
      (fraction: number, force: boolean) => {
        setScrubFraction(fraction);
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

    const beginScrub = useCallback((fraction: number) => {
      scrubbingRef.current = true;
      setScrubFraction(fraction);
    }, []);

    const endScrub = useCallback(
      (fraction: number) => {
        applyScrub(fraction, true);
        // Show the landed position immediately — the next poll confirms it
        setTime((prev) => ({
          ...prev,
          current: fraction * (prev.duration || 0),
        }));
        setScrubFraction(null);
        scrubbingRef.current = false;
      },
      [applyScrub],
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
            const w = barWidth.value;
            const fraction = w > 0 ? Math.min(Math.max(e.x / w, 0), 1) : 0;
            // Set the scrub flag on the UI thread synchronously — the JS
            // ref flips a beat later, and a 250ms poll tick in that gap
            // used to stomp the fill
            scrubbingSv.value = true;
            fillFraction.value = fraction;
            lastSentAt.value = 0;
            runOnJS(beginScrub)(fraction);
          })
          .onUpdate((e) => {
            const w = barWidth.value;
            if (w <= 0) return;
            const fraction = Math.min(Math.max(e.x / w, 0), 1);
            // The bar/knob follow the finger entirely on the UI thread
            fillFraction.value = fraction;
            // JS hop (label + live seek) is throttled, not per-frame
            const now = Date.now();
            if (now - lastSentAt.value < 150) return;
            lastSentAt.value = now;
            runOnJS(applyScrub)(fraction, false);
          })
          .onFinalize((e) => {
            const w = barWidth.value;
            const fraction = w > 0 ? Math.min(Math.max(e.x / w, 0), 1) : 0;
            scrubbingSv.value = false;
            fillFraction.value = fraction;
            runOnJS(endScrub)(fraction);
          }),
      [barWidth, fillFraction, lastSentAt, scrubbingSv, beginScrub, applyScrub, endScrub],
    );

    const fillStyle = useAnimatedStyle(() => ({
      transform: [{ scaleX: fillFraction.value }],
    }));
    const knobStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: fillFraction.value * barWidth.value }],
    }));

    const duration = time.duration;
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
              barWidth.value = e.nativeEvent.layout.width;
            }}
          >
            <View style={styles.videoTrack}>
              <Animated.View style={[styles.videoTrackFill, fillStyle]} />
            </View>
            <Animated.View
              style={[styles.videoKnob, knobStyle]}
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


const styles = StyleSheet.create({
  // Above the page's media siblings (the pill is declared first in the
  // tree so gestures/transforms stay untouched underneath)
  attributionLayer: {
    zIndex: 10,
  },
  // Verbatim from the pre-split PhotoViewer: pageMedia MUST be a full
  // absolute fill — position:absolute with no anchors is a zero-size box,
  // which rendered the video (and its poster) into 0x0: a black page.
  page: {
    height: "100%",
    justifyContent: "center",
  },
  pageMedia: {
    ...StyleSheet.absoluteFillObject,
  },
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  playIconNudge: {
    marginLeft: 3,
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
  videoControlsInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  videoKnob: {
    position: "absolute",
    top: 10,
    left: 0,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    // translateX-driven (UI thread); the margin centers it on the position
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
  videoPosterFallback: {
    backgroundColor: "#101012",
  },
  playbackErrorWrap: {
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  playbackErrorText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 13.5,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  videoTimeText: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 11,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    minWidth: 34,
    textAlign: "center",
  },
  videoTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
    overflow: "hidden",
  },
  videoTrackFill: {
    height: "100%",
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 1.5,
    // scaleX-driven fill (UI thread) — scales from the left edge
    transformOrigin: "left",
  },
  videoTrackTouch: {
    flex: 1,
    height: 30,
    justifyContent: "center",
  },
});
