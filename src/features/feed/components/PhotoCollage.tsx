/**
 * Adaptive 1–4 cell photo collage shared by the feed surfaces:
 * AlbumActivityCard (full-bleed, in the Pages feed) and the Albums-timeline
 * photos_added card (inset, rounded). Layouts: single square, two side by
 * side, one-large-two-stacked for three, 2x2 for four-plus with a +N
 * overlay on the last cell. Video cells get a small play badge.
 */

import React, { memo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { CachedImage } from "@/components/ui/CachedImage";

export interface CollageItem {
  id: string;
  uri: string;
  isVideo?: boolean;
}

const MAX_VISIBLE = 4;

const Cell = memo<{
  item: CollageItem;
  width: number;
  height: number;
  onPress?: () => void;
  extra?: number;
}>(({ item, width, height, onPress, extra }) => (
  <Pressable
    style={[styles.cell, { width, height }]}
    onPress={onPress}
    disabled={!onPress}
  >
    <CachedImage
      uri={item.uri}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
    />
    {item.isVideo && !extra && (
      <View style={styles.playBadge} pointerEvents="none">
        <Ionicons name="play" size={12} color="#fff" />
      </View>
    )}
    {!!extra && extra > 0 && (
      <View style={styles.extraOverlay} pointerEvents="none">
        <Text style={styles.extraText}>+{extra}</Text>
      </View>
    )}
  </Pressable>
));

interface PhotoCollageProps {
  items: CollageItem[];
  /** Total collage width in px */
  width: number;
  /** Gap between cells (default 2, matching the full-bleed feed grid) */
  spacing?: number;
  /**
   * How many more items exist beyond the last visible cell; rendered as a
   * "+N" scrim. Defaults to items beyond the fourth.
   */
  extraCount?: number;
  onPressItem?: (index: number) => void;
}

export const PhotoCollage = memo<PhotoCollageProps>(
  ({ items, width, spacing = 2, extraCount, onPressItem }) => {
    const count = items.length;
    if (count === 0) return null;

    const visible = items.slice(0, MAX_VISIBLE);
    const extra = extraCount ?? Math.max(0, count - MAX_VISIBLE);
    const press = (i: number) =>
      onPressItem ? () => onPressItem(i) : undefined;

    // Single item — full-width square
    if (count === 1) {
      return (
        <Cell
          item={visible[0]}
          width={width}
          height={width}
          onPress={press(0)}
          extra={extra}
        />
      );
    }

    // Two — side by side
    if (count === 2) {
      const cellW = (width - spacing) / 2;
      return (
        <View style={[styles.row, { gap: spacing }]}>
          {visible.map((item, i) => (
            <Cell
              key={item.id}
              item={item}
              width={cellW}
              height={cellW}
              onPress={press(i)}
              extra={i === 1 ? extra : 0}
            />
          ))}
        </View>
      );
    }

    // Three — one large left, two stacked right
    if (count === 3) {
      const bigW = (width - spacing) * 0.62;
      const smallW = width - bigW - spacing;
      const bigH = smallW * 2 + spacing;
      return (
        <View style={[styles.row, { gap: spacing }]}>
          <Cell
            item={visible[0]}
            width={bigW}
            height={bigH}
            onPress={press(0)}
          />
          <View style={{ gap: spacing }}>
            {visible.slice(1).map((item, i) => (
              <Cell
                key={item.id}
                item={item}
                width={smallW}
                height={smallW}
                onPress={press(i + 1)}
                extra={i === 1 ? extra : 0}
              />
            ))}
          </View>
        </View>
      );
    }

    // Four-plus — 2x2 grid, +N overlay on the last cell
    const cellW = (width - spacing) / 2;
    return (
      <View style={{ gap: spacing }}>
        <View style={[styles.row, { gap: spacing }]}>
          {visible.slice(0, 2).map((item, i) => (
            <Cell
              key={item.id}
              item={item}
              width={cellW}
              height={cellW}
              onPress={press(i)}
            />
          ))}
        </View>
        <View style={[styles.row, { gap: spacing }]}>
          {visible.slice(2).map((item, i) => (
            <Cell
              key={item.id}
              item={item}
              width={cellW}
              height={cellW}
              onPress={press(i + 2)}
              extra={i === 1 ? extra : 0}
            />
          ))}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
  },
  cell: {
    overflow: "hidden",
    backgroundColor: "#2c2c2e",
  },
  playBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 1,
  },
  extraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  extraText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
});

export default PhotoCollage;
