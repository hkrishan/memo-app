/**
 * Pages / Albums segmented control for the feed. A frosted dark track with
 * a white sliding thumb (the app's pill language, inverted for the feed's
 * dark canvas). Labels cross-fade between ink-on-white and muted gray as
 * the thumb passes under them.
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
import type { FeedMode } from "../store/feedModeStore";

const SEGMENT_WIDTH = 96;
const TRACK_PADDING = 3;
const TRACK_HEIGHT = 36;

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
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.10)",
  },
  thumb: {
    position: "absolute",
    top: TRACK_PADDING,
    left: TRACK_PADDING,
    width: SEGMENT_WIDTH,
    height: TRACK_HEIGHT - TRACK_PADDING * 2,
    borderRadius: (TRACK_HEIGHT - TRACK_PADDING * 2) / 2,
    backgroundColor: "#f5f5f5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
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
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});

export default FeedModeSwitch;
