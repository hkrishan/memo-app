/**
 * Filmstrip Component
 * iPhone-Photos-style thumbnail scrubber for the bottom of the PhotoViewer.
 *
 * Collapsed thumbs tile with a hairline gap; the active thumb expands into
 * a square with a clearly larger gap opening on each side. The strip is driven
 * by the pager's scrollX shared value, so it tracks swipes frame-by-frame
 * on the UI thread — mid-swipe, the expansion hands over smoothly from the
 * outgoing thumb to the incoming one.
 *
 * Geometry invariant: with p the fractional page position, only the two
 * thumbs straddling p are activated and their activations sum to 1, so the
 * strip's total width is constant and every position is a pure function of
 * scrollX — no layout state, no reflow of unrelated thumbs.
 *
 * Interactions: tap a thumb to jump; drag the strip to scrub the pager at
 * one page per thumb-width (with selection haptics per page), releasing
 * snaps to the nearest page.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { MediaAsset } from "@/features/album/hooks";
import { stableCacheKey } from "@/lib/imageCache";

/** Collapsed thumb width. */
const THUMB_WIDTH = 24;
/** Strip height; the active thumb expands to a square of this size. */
const THUMB_HEIGHT = 42;
/** Extra width the active thumb gains (collapsed → square). */
const ACTIVE_EXTRA = THUMB_HEIGHT - THUMB_WIDTH;
/** Small gap between every pair of thumbs. */
const THUMB_GAP = 2;
/** Extra gap (on top of THUMB_GAP) that opens on each side of the active thumb. */
const ACTIVE_GAP = 10;
/** Slot pitch of a collapsed thumb. */
const PITCH = THUMB_WIDTH + THUMB_GAP;
/** Total width the active region adds — constant while activations sum to 1. */
const ACTIVE_GROW = ACTIVE_EXTRA + 2 * ACTIVE_GAP;

/** Strip height, for layout math in the viewer. */
export const FILMSTRIP_HEIGHT = THUMB_HEIGHT;

const clamp = (value: number, min: number, max: number): number => {
  "worklet";
  return Math.min(Math.max(value, min), max);
};

interface ThumbCellProps {
  asset: MediaAsset;
  index: number;
  count: number;
  pageWidth: number;
  scrollX: SharedValue<number>;
  onPress: (index: number) => void;
}

const ThumbCell = memo<ThumbCellProps>(
  ({ asset, index, count, pageWidth, scrollX, onPress }) => {
    const animatedStyle = useAnimatedStyle(() => {
      const p = clamp(scrollX.value / pageWidth, 0, count - 1);
      const k = Math.floor(p);
      const f = p - k;

      // This thumb's activation (nonzero only for the two straddling p)
      const a = Math.max(0, 1 - Math.abs(index - p));
      const width = THUMB_WIDTH + ACTIVE_EXTRA * a;

      // Content x: collapsed slots, plus the growth of activated thumbs
      // laid out before this one, plus this thumb's own leading gap
      const growBefore =
        (k < index ? 1 - f : 0) + (k + 1 < index ? f : 0);
      const x = index * PITCH + ACTIVE_GROW * growBefore + ACTIVE_GAP * a;

      // Screen-centered point: lerp between the centers of thumbs k and
      // k+1 so the active region glides continuously under the center
      const xK = k * PITCH + ACTIVE_GAP * (1 - f);
      const centerK = xK + (THUMB_WIDTH + ACTIVE_EXTRA * (1 - f)) / 2;
      const xK1 = (k + 1) * PITCH + ACTIVE_GROW * (1 - f) + ACTIVE_GAP * f;
      const centerK1 = xK1 + (THUMB_WIDTH + ACTIVE_EXTRA * f) / 2;
      const center = centerK + (centerK1 - centerK) * f;

      return {
        width,
        borderRadius: 4 * a,
        transform: [{ translateX: pageWidth / 2 - center + x }],
      };
    }, [index, count, pageWidth]);

    const handlePress = useCallback(() => {
      onPress(index);
    }, [onPress, index]);

    const thumbUri = asset.thumbnailUrl ?? asset.uri;
    // A remote video without a poster has no renderable image (its uri is
    // the video file) — the dark thumb background + play badge carry it
    const posterlessVideo =
      asset.mediaType === "video" &&
      asset.thumbnailUrl == null &&
      asset.uri.startsWith("http");

    return (
      <Animated.View style={[styles.thumb, animatedStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={`Photo ${index + 1}`}
        >
          {!posterlessVideo && (
            <Image
              source={{ uri: thumbUri, cacheKey: stableCacheKey(thumbUri) }}
              style={styles.thumbImage}
              contentFit="cover"
              recyclingKey={`${asset.id}-strip`}
              cachePolicy={
                thumbUri.startsWith("http") ? "memory-disk" : "memory"
              }
              transition={0}
              // The strip's ~30 mounted thumbs must never compete with the
              // active page's full-res fetch/decode for bandwidth or decode
              // slots — they're 24px tiles, always the last in line
              priority="low"
            />
          )}
          {asset.mediaType === "video" && (
            <View style={styles.playBadge} pointerEvents="none">
              <Ionicons
                name="play"
                size={10}
                color="rgba(255, 255, 255, 0.95)"
              />
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  },
);
ThumbCell.displayName = "ThumbCell";

interface FilmstripProps {
  assets: MediaAsset[];
  pageWidth: number;
  /** Pager content offset in px (UI-thread, from the viewer's scroll handler). */
  scrollX: SharedValue<number>;
  /** Settled page index — seeds the render window on mount. */
  activeIndex: number;
  /** Tap on a thumb. */
  onSelect: (index: number) => void;
  /** Per-frame scrub position as a pager content offset (px). */
  onScrub: (offset: number) => void;
  /** Scrub released — snap the pager to this index. */
  onScrubEnd: (index: number) => void;
}

export const Filmstrip: React.FC<FilmstripProps> = ({
  assets,
  pageWidth,
  scrollX,
  activeIndex,
  onSelect,
  onScrub,
  onScrubEnd,
}) => {
  const count = assets.length;

  // Only a window of thumbs around the live position is mounted — libraries
  // can hold thousands of assets. The window follows scrollX (so scrubbing
  // and far jumps stay covered, not just settled indices), with hysteresis:
  // re-centering is a React commit landing mid-swipe, so the window is
  // padded far enough that it only happens every RECENTER_SLACK pages
  // instead of on every crossing — one-page swipes stay commit-free.
  const visibleRadius = Math.ceil(pageWidth / 2 / PITCH);
  const recenterSlack = 6;
  const windowRadius = visibleRadius + recenterSlack + 2;
  const [windowCenter, setWindowCenter] = useState(activeIndex);
  const windowCenterSv = useSharedValue(activeIndex);
  useAnimatedReaction(
    () => Math.round(clamp(scrollX.value / pageWidth, 0, count - 1)),
    (current) => {
      if (Math.abs(current - windowCenterSv.value) >= recenterSlack) {
        windowCenterSv.value = current;
        runOnJS(setWindowCenter)(current);
      }
    },
    [pageWidth, count, recenterSlack],
  );

  const center = Math.min(Math.max(windowCenter, 0), count - 1);
  const start = Math.max(0, center - windowRadius);
  const end = Math.min(count - 1, center + windowRadius);

  const visibleCells = useMemo(() => {
    const cells: { asset: MediaAsset; index: number }[] = [];
    for (let i = start; i <= end; i++) {
      cells.push({ asset: assets[i], index: i });
    }
    return cells;
  }, [assets, start, end]);

  const hapticTick = useCallback(() => {
    Haptics.selectionAsync().catch(() => {
      // Haptics are best-effort
    });
  }, []);

  // Scrub state lives in shared values — the pan runs on the UI thread and
  // only crosses to JS for the pager scroll and the per-page haptic tick
  const scrubStart = useSharedValue(0);
  const scrubPosition = useSharedValue(0);
  const scrubTickIndex = useSharedValue(0);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .failOffsetY([-16, 16])
        .onStart(() => {
          const p = clamp(scrollX.value / pageWidth, 0, count - 1);
          scrubStart.value = p;
          scrubPosition.value = p;
          scrubTickIndex.value = Math.round(p);
        })
        .onUpdate((e) => {
          // One page per thumb slot, dragging left advances
          const p = clamp(
            scrubStart.value - e.translationX / PITCH,
            0,
            count - 1,
          );
          scrubPosition.value = p;
          const index = Math.round(p);
          if (index !== scrubTickIndex.value) {
            scrubTickIndex.value = index;
            runOnJS(hapticTick)();
          }
          runOnJS(onScrub)(p * pageWidth);
        })
        .onEnd(() => {
          runOnJS(onScrubEnd)(Math.round(scrubPosition.value));
        }),
    [
      count,
      pageWidth,
      scrollX,
      scrubStart,
      scrubPosition,
      scrubTickIndex,
      hapticTick,
      onScrub,
      onScrubEnd,
    ],
  );

  if (count <= 1) return null;

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.strip} collapsable={false}>
        {visibleCells.map(({ asset, index }) => (
          <ThumbCell
            key={asset.id}
            asset={asset}
            index={index}
            count={count}
            pageWidth={pageWidth}
            scrollX={scrollX}
            onPress={onSelect}
          />
        ))}
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  strip: {
    height: THUMB_HEIGHT,
    overflow: "hidden",
  },
  thumb: {
    position: "absolute",
    top: 0,
    left: 0,
    height: THUMB_HEIGHT,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  thumbImage: {
    ...StyleSheet.absoluteFillObject,
  },
  playBadge: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default Filmstrip;
