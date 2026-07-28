/**
 * Memo Create — photo picker.
 *
 * A bottom sheet over the user's Memo library (the same merged, local-first
 * feed "My Photos" shows). Single mode fills one slot; multi mode fills a
 * fresh template in tap order, capped at the template's slot count.
 * Videos are hidden — collages and carousel splits are stills.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";

import Sheet from "@/components/ui/Sheet";
import { MediaTile } from "@/components/ui/MediaTile";
import { useMergedLibrary } from "@/features/photos/api/library.queries";
import { libraryPhotoToAsset } from "@/features/photos/utils/libraryAsset";
import type { SlotPhoto } from "../store/createProjectsStore";

const COLUMNS = 4;
const GRID_GAP = 2;
const SHEET_HEIGHT = Math.round(Dimensions.get("window").height * 0.62);
const CELL = Math.floor(
  (Dimensions.get("window").width - GRID_GAP * (COLUMNS - 1)) / COLUMNS,
);

interface LibraryPickerSheetProps {
  visible: boolean;
  /** 1 = replace a single slot; >1 = fill a template in tap order. */
  maxCount: number;
  onConfirm: (photos: SlotPhoto[]) => void;
  onClose: () => void;
}

export const LibraryPickerSheet = memo<LibraryPickerSheetProps>(
  ({ visible, maxCount, onConfirm, onClose }) => {
    const { photos, fetchNextPage, hasNextPage } = useMergedLibrary();

    const assets = useMemo(
      () =>
        photos
          .filter((photo) => photo.mediaType !== "video")
          .map((photo) => ({
            asset: libraryPhotoToAsset(photo),
            // Pending captures' ids are queue-local, not library photoIds —
            // a draft must not try to re-resolve against them later
            photoId: photo.pending ? null : photo.photoId,
          })),
      [photos],
    );

    // Selection in tap order (order = slot order for template fills)
    const [selected, setSelected] = useState<string[]>([]);
    useEffect(() => {
      if (visible) setSelected([]);
    }, [visible]);

    const toggle = useCallback(
      (assetId: string) => {
        setSelected((current) => {
          if (current.includes(assetId)) {
            return current.filter((id) => id !== assetId);
          }
          if (maxCount === 1) return [assetId];
          if (current.length >= maxCount) return current;
          return [...current, assetId];
        });
      },
      [maxCount],
    );

    const handleConfirm = useCallback(() => {
      const byId = new Map(assets.map((entry) => [entry.asset.id, entry]));
      const chosen = selected
        .map((id) => byId.get(id))
        .filter((entry): entry is NonNullable<typeof entry> => entry != null)
        .map(({ asset, photoId }) => ({ uri: asset.uri, photoId }));
      if (chosen.length > 0) onConfirm(chosen);
    }, [assets, selected, onConfirm]);

    const handleScrollEnd = useCallback(
      (event: {
        nativeEvent: {
          contentOffset: { y: number };
          contentSize: { height: number };
          layoutMeasurement: { height: number };
        };
      }) => {
        const { contentOffset, contentSize, layoutMeasurement } =
          event.nativeEvent;
        const remaining =
          contentSize.height - contentOffset.y - layoutMeasurement.height;
        if (remaining < CELL * 4 && hasNextPage) fetchNextPage();
      },
      [hasNextPage, fetchNextPage],
    );

    const title =
      maxCount === 1 ? "Choose a photo" : `Choose up to ${maxCount} photos`;

    return (
      <Sheet visible={visible} onClose={onClose} title={title}>
        <View style={styles.body}>
          <ScrollView
            style={styles.grid}
            onScroll={handleScrollEnd}
            scrollEventThrottle={64}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.gridContent}>
              {assets.map(({ asset }) => {
                const order = selected.indexOf(asset.id);
                const isSelected = order >= 0;
                return (
                  <Pressable
                    key={asset.id}
                    style={styles.cell}
                    onPress={() => toggle(asset.id)}
                    accessibilityRole="imagebutton"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel="Photo"
                  >
                    <MediaTile asset={asset} recyclingKeySuffix="picker" />
                    {isSelected && (
                      <View style={styles.selectedOverlay} pointerEvents="none">
                        <View style={styles.orderBadge}>
                          <Text style={styles.orderText}>
                            {maxCount === 1 ? "✓" : order + 1}
                          </Text>
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
            {assets.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="images-outline" size={40} color="#ccc" />
                <Text style={styles.emptyText}>No photos yet</Text>
              </View>
            )}
          </ScrollView>

          <Pressable
            onPress={handleConfirm}
            disabled={selected.length === 0}
            style={({ pressed }) => [
              styles.confirm,
              selected.length === 0 && styles.confirmDisabled,
              pressed && styles.confirmPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Use selected photos"
          >
            <Text style={styles.confirmText}>
              {selected.length === 0
                ? "Select photos"
                : maxCount === 1
                  ? "Use photo"
                  : `Use ${selected.length} photo${selected.length === 1 ? "" : "s"}`}
            </Text>
          </Pressable>
        </View>
      </Sheet>
    );
  },
);
LibraryPickerSheet.displayName = "LibraryPickerSheet";

const styles = StyleSheet.create({
  body: {
    height: SHEET_HEIGHT,
  },
  grid: {
    flex: 1,
  },
  gridContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "flex-end",
  },
  orderBadge: {
    margin: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  orderText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#000",
    fontVariant: ["tabular-nums"],
  },
  empty: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    color: "#888",
  },
  confirm: {
    marginHorizontal: 16,
    marginTop: 12,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDisabled: {
    backgroundColor: "#D1D1D6",
  },
  confirmPressed: {
    opacity: 0.85,
  },
  confirmText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default LibraryPickerSheet;
