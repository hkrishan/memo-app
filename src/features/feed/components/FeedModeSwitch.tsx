/**
 * Pages / Albums segmented control for the feed. A soft gray track with a
 * white sliding thumb (the app's pill language on the feed's light
 * canvas). Labels cross-fade between ink-on-white and muted gray as the
 * thumb passes under them.
 */

import React, { memo, useCallback, useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import type { FeedMode } from "../store/feedModeStore";

const SEGMENT_WIDTH = 96;
const TRACK_PADDING = 3;
const TRACK_HEIGHT = 36;

/**
 * Height of the floating switch row on the feed (the 36pt pill plus the
 * row's 10/4 vertical paddings). The feed lists reserve this much top
 * padding so content starts below the pill but scrolls underneath it.
 */
export const SWITCH_ROW_HEIGHT = TRACK_HEIGHT + 14;

const TIMING = { duration: 220, easing: Easing.out(Easing.cubic) };

const SegmentLabel = memo<{
  label: string;
  /** Thumb progress, 0 = pages, 1 = albums */
  progress: SharedValue<number>;
  /** Progress value at which this segment sits under the thumb */
  activeAt: 0 | 1;
}>(({ label, progress, activeAt }) => {
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      Math.abs(progress.value - activeAt),
      [0, 1],
      ["#111111", "#9a9aa0"],
    ),
  }));
  return (
    <Animated.Text style={[styles.segmentLabel, textStyle]} numberOfLines={1}>
      {label}
    </Animated.Text>
  );
});

interface FeedModeSwitchProps {
  mode: FeedMode;
  onChange: (mode: FeedMode) => void;
  /** Shared 0..1 progress (0 = pages, 1 = albums); this control drives it */
  progress: SharedValue<number>;
}

const FeedModeSwitch = memo<FeedModeSwitchProps>(
  ({ mode, onChange, progress }) => {
    useEffect(() => {
      progress.value = withTiming(mode === "albums" ? 1 : 0, TIMING);
    }, [mode, progress]);

    const thumbStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: progress.value * SEGMENT_WIDTH }],
    }));

    const select = useCallback(
      (next: FeedMode) => {
        if (next === mode) return;
        Haptics.selectionAsync();
        onChange(next);
      },
      [mode, onChange],
    );

    return (
      <View style={styles.track}>
        {/* Frosted backdrop — the pill floats over the scrolling feed */}
        <BlurView intensity={25} tint="light" style={styles.trackBlur} />
        <Animated.View style={[styles.thumb, thumbStyle]} />
        <Pressable
          style={styles.segment}
          onPress={() => select("pages")}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === "pages" }}
          accessibilityLabel="Pages feed"
        >
          <SegmentLabel label="Pages" progress={progress} activeAt={0} />
        </Pressable>
        <Pressable
          style={styles.segment}
          onPress={() => select("albums")}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === "albums" }}
          accessibilityLabel="Albums feed"
        >
          <SegmentLabel label="Albums" progress={progress} activeAt={1} />
        </Pressable>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    alignSelf: "center",
    height: TRACK_HEIGHT,
    padding: TRACK_PADDING,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.06)",
  },
  trackBlur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: "hidden",
  },
  thumb: {
    position: "absolute",
    top: TRACK_PADDING,
    left: TRACK_PADDING,
    width: SEGMENT_WIDTH,
    height: TRACK_HEIGHT - TRACK_PADDING * 2,
    borderRadius: (TRACK_HEIGHT - TRACK_PADDING * 2) / 2,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  segment: {
    width: SEGMENT_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentLabel: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});

export default FeedModeSwitch;
