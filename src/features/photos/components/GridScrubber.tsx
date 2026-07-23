/**
 * GridScrubber Component
 * iOS-Photos-style fast-scroll scrubber for the sectioned CameraRollGrid.
 *
 * - A right-edge handle rides a vertical track, tracking scroll progress
 *   straight from the grid's scrollY SharedValue (no per-frame setState).
 * - Auto-hides: fades in on any scroll activity, fades out after a quiet
 *   period — a reanimated withSequence/withDelay "last activity" pattern
 *   where each new scroll event replaces (and thereby cancels) the pending
 *   hide. While dragging it never hides.
 * - Drag-to-scrub: a Pan gesture maps the finger's window Y onto track
 *   progress on the UI thread (the handle follows instantly); the list
 *   follows via scrollToOffset(animated: false) through runOnJS with a
 *   requestAnimationFrame coalescing guard — at most one scrollToOffset
 *   per frame. The grid's scroll handler keeps writing scrollY as the list
 *   moves, so handle and list can never diverge.
 * - While dragging, a dark date bubble to the left of the handle shows the
 *   month under the scrub offset (binary search over precomputed month
 *   ranges, probed at offset + 30% of the viewport so the label matches
 *   what is roughly on screen). The bubble label is React state but only
 *   updates when the label actually changes; each change fires a selection
 *   haptic.
 * - The overlay never blocks grid taps: the container is pointerEvents
 *   box-none and only the handle itself is touchable.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

/** Content-space vertical range of one month section (headers included). */
export interface MonthRange {
  /** Bubble label, e.g. "July 2026". */
  label: string;
  topY: number;
  bottomY: number;
}

/** Track inset from the grid container's top edge. */
const TRACK_MARGIN = 16;
/** Touchable handle area (the visual pill is smaller, centered inside). */
const HANDLE_WIDTH = 36;
const HANDLE_HEIGHT = 44;
const BUBBLE_HEIGHT = 36;
/** Quiet period after the last scroll activity before the handle hides. */
const HIDE_DELAY = 1400;
const FADE_IN_DURATION = 150;
const FADE_OUT_DURATION = 300;
const BUBBLE_FADE_DURATION = 120;
/** Probe point below the scrub offset used to pick the bubble's month. */
const PROBE_VIEWPORT_FRACTION = 0.3;

const clamp = (value: number, min: number, max: number): number => {
  "worklet";
  return Math.min(Math.max(value, min), max);
};

/**
 * Label of the month range containing content-space `y` — the last range
 * whose top is at or above `y`, clamped to the first/last range.
 */
const findMonthLabel = (ranges: MonthRange[], y: number): string | null => {
  if (ranges.length === 0) return null;
  let lo = 0;
  let hi = ranges.length - 1;
  let answer = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ranges[mid].topY <= y) {
      answer = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ranges[answer].label;
};

interface GridScrubberProps {
  /** The grid's live scroll offset (written by its scroll worklet). */
  scrollY: SharedValue<number>;
  /** Total list content height in px (bottom padding included). */
  contentHeight: number;
  /** Grid container height in px. */
  viewportHeight: number;
  /** Month ranges in content space, ordered top to bottom. */
  monthRanges: MonthRange[];
  /** Scrolls the grid to an absolute content offset (non-animated). */
  onScrubToOffset: (offset: number) => void;
  /**
   * While truthy, scroll movement is NOT treated as user activity — set by
   * the grid around programmatic jumps (viewer-dismiss scroll-into-view) so
   * the handle doesn't flash in next to a landing flight.
   */
  suppressActivity?: SharedValue<boolean>;
}

export const GridScrubber = memo<GridScrubberProps>(function GridScrubber({
  scrollY,
  contentHeight,
  viewportHeight,
  monthRanges,
  onScrubToOffset,
  suppressActivity,
}) {
  const insets = useSafeAreaInsets();

  const [bubbleLabel, setBubbleLabel] = useState("");
  // Mirrors the handle's shown/hidden state into React so an invisible
  // handle can't be hit-tested (Android dispatches touches to alpha-0 views)
  const [interactive, setInteractive] = useState(false);

  // Layout/geometry mirrored into SharedValues so every position/progress
  // computation runs on the UI thread
  const contentHeightSV = useSharedValue(contentHeight);
  const viewportHeightSV = useSharedValue(viewportHeight);
  const bottomMarginSV = useSharedValue(TRACK_MARGIN + insets.bottom);
  // Window-space Y of the track container, so the pan can map absolute
  // finger position onto track progress
  const trackWindowTopSV = useSharedValue(0);

  useEffect(() => {
    contentHeightSV.value = contentHeight;
    viewportHeightSV.value = viewportHeight;
    bottomMarginSV.value = TRACK_MARGIN + insets.bottom;
  }, [
    contentHeight,
    viewportHeight,
    insets.bottom,
    contentHeightSV,
    viewportHeightSV,
    bottomMarginSV,
  ]);

  const handleOpacity = useSharedValue(0);
  const bubbleOpacity = useSharedValue(0);
  const dragging = useSharedValue(false);
  // While dragging the handle follows the finger, not the (rAF-lagged) list
  const dragProgress = useSharedValue(0);
  // UI-thread mirror of `interactive`, so the reaction only crosses to JS
  // on actual show/hide transitions (never per scroll frame)
  const shownSV = useSharedValue(false);

  // -------------------------------------------------------------------------
  // JS-side scrub plumbing (rAF-coalesced scroll + guarded bubble updates)
  // -------------------------------------------------------------------------

  const monthRangesRef = useRef(monthRanges);
  monthRangesRef.current = monthRanges;
  const viewportHeightRef = useRef(viewportHeight);
  viewportHeightRef.current = viewportHeight;
  const onScrubToOffsetRef = useRef(onScrubToOffset);
  onScrubToOffsetRef.current = onScrubToOffset;

  const lastLabelRef = useRef<string | null>(null);
  const pendingOffsetRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    [],
  );

  /** Update the bubble only when the month under the probe changes. */
  const updateBubble = useCallback((offset: number) => {
    const probe = offset + viewportHeightRef.current * PROBE_VIEWPORT_FRACTION;
    const label = findMonthLabel(monthRangesRef.current, probe);
    if (label === null || label === lastLabelRef.current) return;
    lastLabelRef.current = label;
    setBubbleLabel(label);
    Haptics.selectionAsync().catch(() => {
      // Haptics are best-effort
    });
  }, []);

  /** Scrub tick: coalesce to one scrollToOffset per frame, update bubble. */
  const handleScrub = useCallback(
    (offset: number) => {
      pendingOffsetRef.current = offset;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const pending = pendingOffsetRef.current;
          pendingOffsetRef.current = null;
          if (pending != null) {
            onScrubToOffsetRef.current(pending);
          }
        });
      }
      updateBubble(offset);
    },
    [updateBubble],
  );

  // -------------------------------------------------------------------------
  // Auto-hide: show on any scroll activity, hide after a quiet period.
  // Each scroll event replaces the running sequence, which cancels the
  // pending withDelay hide — the classic "last activity" pattern, with no
  // per-frame setState anywhere.
  // -------------------------------------------------------------------------

  useAnimatedReaction(
    () => scrollY.value,
    (current, previous) => {
      if (previous === null || current === previous) return;
      // Programmatic jumps (viewer-dismiss scroll-into-view) are not user
      // activity — don't flash the handle in next to a landing flight
      if (suppressActivity?.value) return;
      if (!shownSV.value) {
        shownSV.value = true;
        runOnJS(setInteractive)(true);
      }
      if (dragging.value) {
        // The scrub itself scrolls the list — keep the handle fully shown,
        // never schedule a hide mid-drag
        handleOpacity.value = withTiming(1, { duration: FADE_IN_DURATION });
        return;
      }
      handleOpacity.value = withSequence(
        withTiming(1, { duration: FADE_IN_DURATION }),
        withDelay(
          HIDE_DELAY,
          withTiming(0, { duration: FADE_OUT_DURATION }, (finished) => {
            // Only a completed fade-out disarms the handle — a new scroll
            // replaces this sequence and fires the callback unfinished
            if (finished) {
              shownSV.value = false;
              runOnJS(setInteractive)(false);
            }
          }),
        ),
      );
    },
    [scrollY, dragging, handleOpacity, suppressActivity, shownSV],
  );

  // -------------------------------------------------------------------------
  // Drag-to-scrub
  // -------------------------------------------------------------------------

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 16, right: 8, top: 12, bottom: 12 })
        .activeOffsetY([-2, 2])
        .onStart(() => {
          dragging.value = true;
          // Seed the drag at the current scroll progress so the handle
          // can't jump before the first onUpdate
          const maxScroll = Math.max(
            1,
            contentHeightSV.value - viewportHeightSV.value,
          );
          dragProgress.value = clamp(scrollY.value / maxScroll, 0, 1);
          handleOpacity.value = withTiming(1, { duration: FADE_IN_DURATION });
          bubbleOpacity.value = withTiming(1, {
            duration: BUBBLE_FADE_DURATION,
          });
          runOnJS(updateBubble)(scrollY.value);
        })
        .onUpdate((event) => {
          const travel = Math.max(
            1,
            viewportHeightSV.value -
              TRACK_MARGIN -
              bottomMarginSV.value -
              HANDLE_HEIGHT,
          );
          const fingerY = event.absoluteY - trackWindowTopSV.value;
          const progress = clamp(
            (fingerY - TRACK_MARGIN - HANDLE_HEIGHT / 2) / travel,
            0,
            1,
          );
          dragProgress.value = progress;
          const maxScroll = Math.max(
            0,
            contentHeightSV.value - viewportHeightSV.value,
          );
          runOnJS(handleScrub)(progress * maxScroll);
        })
        .onFinalize(() => {
          dragging.value = false;
          bubbleOpacity.value = withTiming(0, {
            duration: BUBBLE_FADE_DURATION,
          });
          // The drag itself was activity — restart the quiet-period hide
          handleOpacity.value = withDelay(
            HIDE_DELAY,
            withTiming(0, { duration: FADE_OUT_DURATION }, (finished) => {
              if (finished) {
                shownSV.value = false;
                runOnJS(setInteractive)(false);
              }
            }),
          );
        }),
    [
      dragging,
      dragProgress,
      handleOpacity,
      bubbleOpacity,
      contentHeightSV,
      viewportHeightSV,
      bottomMarginSV,
      trackWindowTopSV,
      scrollY,
      handleScrub,
      updateBubble,
    ],
  );

  // -------------------------------------------------------------------------
  // Layout / animated styles
  // -------------------------------------------------------------------------

  const trackRef = useRef<View>(null);

  const handleTrackLayout = useCallback(() => {
    const node = trackRef.current;
    if (!node) return;
    node.measureInWindow((x, y) => {
      if (Number.isFinite(y)) {
        trackWindowTopSV.value = y;
      }
    });
  }, [trackWindowTopSV]);

  const handleStyle = useAnimatedStyle(() => {
    const maxScroll = Math.max(1, contentHeightSV.value - viewportHeightSV.value);
    const progress = dragging.value
      ? dragProgress.value
      : clamp(scrollY.value / maxScroll, 0, 1);
    const travel = Math.max(
      0,
      viewportHeightSV.value -
        TRACK_MARGIN -
        bottomMarginSV.value -
        HANDLE_HEIGHT,
    );
    return {
      opacity: handleOpacity.value,
      transform: [{ translateY: TRACK_MARGIN + progress * travel }],
    };
  });

  const bubbleStyle = useAnimatedStyle(() => {
    const maxScroll = Math.max(1, contentHeightSV.value - viewportHeightSV.value);
    const progress = dragging.value
      ? dragProgress.value
      : clamp(scrollY.value / maxScroll, 0, 1);
    const travel = Math.max(
      0,
      viewportHeightSV.value -
        TRACK_MARGIN -
        bottomMarginSV.value -
        HANDLE_HEIGHT,
    );
    return {
      opacity: bubbleOpacity.value,
      transform: [
        {
          translateY:
            TRACK_MARGIN +
            progress * travel +
            (HANDLE_HEIGHT - BUBBLE_HEIGHT) / 2,
        },
      ],
    };
  });

  return (
    <View
      ref={trackRef}
      style={styles.container}
      pointerEvents="box-none"
      collapsable={false}
      onLayout={handleTrackLayout}
    >
      <Animated.View
        style={[styles.bubble, bubbleStyle]}
        pointerEvents="none"
      >
        <Text style={styles.bubbleText} numberOfLines={1}>
          {bubbleLabel}
        </Text>
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[styles.handle, handleStyle]}
          pointerEvents={interactive ? "auto" : "none"}
        >
          <View style={styles.handlePill} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: HANDLE_WIDTH,
  },
  handle: {
    position: "absolute",
    top: 0,
    right: 0,
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 4,
  },
  handlePill: {
    width: 6,
    height: HANDLE_HEIGHT,
    borderRadius: 3,
    backgroundColor: "#00000055",
  },
  bubble: {
    position: "absolute",
    top: 0,
    right: HANDLE_WIDTH + 10,
    height: BUBBLE_HEIGHT,
    borderRadius: BUBBLE_HEIGHT / 2,
    backgroundColor: "#000000cc",
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  bubbleText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});

export default GridScrubber;
