/**
 * Pages / Albums tabs for the feed — editorial text tabs (ink label with a
 * sliding underline) instead of a pill control, per the app's flat design
 * language. The Albums tab carries a black count badge when albums have
 * new photos. The underline slides between the measured label widths and
 * labels cross-fade ink ↔ muted as it passes.
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { color, font } from "@/lib/tokens";
import type { FeedMode } from "../store/feedModeStore";

/**
 * Height of the tabs row on the feed (labels + underline + paddings). The
 * feed lists reserve this much top padding so content starts below the row.
 */
export const SWITCH_ROW_HEIGHT = 46;

const UNDERLINE_HEIGHT = 2;
const TIMING = { duration: 220, easing: Easing.out(Easing.cubic) };

type LabelFrame = { x: number; width: number };

const TabLabel = memo<{
  label: string;
  /** Thumb progress, 0 = pages, 1 = albums */
  progress: SharedValue<number>;
  /** Progress value at which this tab is active */
  activeAt: 0 | 1;
}>(({ label, progress, activeAt }) => {
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      Math.abs(progress.value - activeAt),
      [0, 1],
      [color.textPrimary, "#9a9aa0"],
    ),
  }));
  return (
    <Animated.Text style={[styles.tabLabel, textStyle]} numberOfLines={1}>
      {label}
    </Animated.Text>
  );
});

interface FeedModeSwitchProps {
  mode: FeedMode;
  onChange: (mode: FeedMode) => void;
  /** Shared 0..1 progress (0 = pages, 1 = albums); this control drives it */
  progress: SharedValue<number>;
  /** Albums with new photos — shown as a black count badge (hidden at 0) */
  albumsBadge?: number;
}

const FeedModeSwitch = memo<FeedModeSwitchProps>(
  ({ mode, onChange, progress, albumsBadge = 0 }) => {
    useEffect(() => {
      progress.value = withTiming(mode === "albums" ? 1 : 0, TIMING);
    }, [mode, progress]);

    // The underline needs each label's frame in ROW coordinates: the tab
    // Pressable's x (row-relative) plus the label's width (the word only —
    // the Albums badge must not stretch the underline). Two onLayouts per
    // tab, merged here.
    const [frames, setFrames] = useState<[LabelFrame | null, LabelFrame | null]>(
      [null, null],
    );
    const mergeFrame = useCallback(
      (index: 0 | 1, patch: Partial<LabelFrame>) => {
        setFrames((prev) => {
          const current = prev[index] ?? { x: 0, width: 0 };
          const merged = { ...current, ...patch };
          if (current.x === merged.x && current.width === merged.width) {
            return prev;
          }
          const next: [LabelFrame | null, LabelFrame | null] = [...prev];
          next[index] = merged;
          return next;
        });
      },
      [],
    );
    const onTabLayout = useCallback(
      (index: 0 | 1) => (event: LayoutChangeEvent) =>
        mergeFrame(index, { x: event.nativeEvent.layout.x }),
      [mergeFrame],
    );
    const onLabelLayout = useCallback(
      (index: 0 | 1) => (event: LayoutChangeEvent) =>
        mergeFrame(index, { width: event.nativeEvent.layout.width }),
      [mergeFrame],
    );

    const [pagesFrame, albumsFrame] = frames;
    const underlineStyle = useAnimatedStyle(() => {
      if (!pagesFrame?.width || !albumsFrame?.width) return { opacity: 0 };
      return {
        opacity: 1,
        width: interpolate(
          progress.value,
          [0, 1],
          [pagesFrame.width, albumsFrame.width],
        ),
        transform: [
          {
            translateX: interpolate(
              progress.value,
              [0, 1],
              [pagesFrame.x, albumsFrame.x],
            ),
          },
        ],
      };
    }, [pagesFrame, albumsFrame]);

    const select = useCallback(
      (next: FeedMode) => {
        if (next === mode) return;
        Haptics.selectionAsync();
        onChange(next);
      },
      [mode, onChange],
    );

    return (
      <View style={styles.row}>
        <Pressable
          style={styles.tab}
          onLayout={onTabLayout(0)}
          onPress={() => select("pages")}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === "pages" }}
          accessibilityLabel="Pages feed"
        >
          {/* The measured wrapper holds ONLY the word — the underline
              matches the text width, not the tab's touch area */}
          <View onLayout={onLabelLayout(0)}>
            <TabLabel label="Pages" progress={progress} activeAt={0} />
          </View>
        </Pressable>
        <Pressable
          style={styles.tab}
          onLayout={onTabLayout(1)}
          onPress={() => select("albums")}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === "albums" }}
          accessibilityLabel={
            albumsBadge > 0
              ? `Albums feed, ${albumsBadge} with new photos`
              : "Albums feed"
          }
        >
          <View onLayout={onLabelLayout(1)}>
            <TabLabel label="Albums" progress={progress} activeAt={1} />
          </View>
          {albumsBadge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {albumsBadge > 9 ? "9+" : albumsBadge}
              </Text>
            </View>
          )}
        </Pressable>
        <Animated.View style={[styles.underline, underlineStyle]} />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: SWITCH_ROW_HEIGHT,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 20,
  },
  tabLabel: {
    fontSize: 17,
    ...font.bold,
    letterSpacing: 0.1,
  },
  underline: {
    position: "absolute",
    bottom: 6,
    left: 0,
    height: UNDERLINE_HEIGHT,
    borderRadius: UNDERLINE_HEIGHT / 2,
    backgroundColor: color.textPrimary,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    marginLeft: 7,
    backgroundColor: color.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: color.textInverse,
    fontSize: 11,
    ...font.semibold,
    fontVariant: ["tabular-nums"],
  },
});

export default FeedModeSwitch;
