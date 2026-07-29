/**
 * Memo Create — photo picker.
 *
 * A bottom sheet over the user's Memo library (the same merged, local-first
 * feed "My Photos" shows). Single mode fills one slot; multi mode fills a
 * fresh template in tap order, capped at the template's slot count.
 * Videos are hidden — collages and carousel splits are stills.
 *
 * With `allowCameraRoll`, a source row also offers the device photo
 * library (system multi-picker) — those picks carry no photoId; they are
 * local files, so there is nothing to heal against the Memo library. With
 * `allowAlbums`, a third source browses the user's albums; album picks
 * store `{ albumId, albumPhotoId }` and heal against that album's list.
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
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import Sheet from "@/components/ui/Sheet";
import { MediaTile } from "@/components/ui/MediaTile";
import { useMergedLibrary } from "@/features/photos/api/library.queries";
import { libraryPhotoToAsset } from "@/features/photos/utils/libraryAsset";
import { useGetAlbumsQuery } from "@/features/album/api/album.queries";
import { useGetPhotosQuery } from "@/features/album/api/photo.queries";
import { photoToMediaAsset } from "@/features/album/utils/mediaAsset";
import type { SlotPhoto } from "../store/createProjectsStore";
import type { MediaAsset } from "@/features/album/hooks";

// Cast to bypass type definition mismatch with the installed version
// (same pattern as the feed lists)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PickerFlashList = FlashList as any;

type PickerEntry = {
  asset: MediaAsset;
  photoId: string | null;
  albumId?: string;
  albumPhotoId?: string;
};

/** One grid cell — memoized so a selection change only re-renders the
 *  cells whose order actually changed (the whole unvirtualized grid used
 *  to re-render per tap, and per parent render). */
const PickerCell = memo<{
  entry: PickerEntry;
  order: number;
  maxCount: number;
  onToggle: (assetId: string) => void;
}>(({ entry, order, maxCount, onToggle }) => {
  const isSelected = order >= 0;
  const handlePress = useCallback(
    () => onToggle(entry.asset.id),
    [onToggle, entry.asset.id],
  );
  return (
    <Pressable
      style={styles.cell}
      onPress={handlePress}
      accessibilityRole="imagebutton"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel="Photo"
    >
      <MediaTile asset={entry.asset} recyclingKeySuffix="picker" />
      {isSelected && (
        <View style={styles.selectedOverlay} pointerEvents="none">
          <View style={styles.orderBadge}>
            <Text style={styles.orderText}>
              {maxCount === 1 ? "\u2713" : order + 1}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
});
PickerCell.displayName = "PickerCell";

/** A pick plus its pixel size when known (0/undefined = unknown). */
export type PickedPhoto = SlotPhoto & { width?: number; height?: number };

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
  /** Offer the device photo library as a second source. */
  allowCameraRoll?: boolean;
  /** Offer the user's albums as a third source. */
  allowAlbums?: boolean;
  onConfirm: (photos: PickedPhoto[]) => void;
  onClose: () => void;
}

export const LibraryPickerSheet = memo<LibraryPickerSheetProps>(
  ({
    visible,
    maxCount,
    allowCameraRoll = false,
    allowAlbums = false,
    onConfirm,
    onClose,
  }) => {
    const { photos, fetchNextPage, hasNextPage } = useMergedLibrary();

    const [source, setSource] = useState<"memo" | "albums">("memo");
    const [albumId, setAlbumId] = useState<string | null>(null);
    const { data: albums } = useGetAlbumsQuery();
    const { data: albumPhotos } = useGetPhotosQuery(
      allowAlbums && source === "albums" ? (albumId ?? "") : "",
    );

    const memoAssets = useMemo(
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

    const albumAssets = useMemo<PickerEntry[]>(
      () =>
        albumId
          ? (albumPhotos ?? [])
              .filter((photo) => (photo.mediaType ?? "photo") !== "video")
              .map((photo) => ({
                asset: photoToMediaAsset(photo),
                photoId: null,
                albumId,
                albumPhotoId: photo.photoId,
              }))
          : [],
      [albumPhotos, albumId],
    );

    const assets = source === "albums" ? albumAssets : memoAssets;

    // Selections can span sources/albums; remember every entry ever shown
    // so confirm can resolve picks the current grid no longer renders
    const entryCacheRef = useRef(new Map<string, PickerEntry>());
    useEffect(() => {
      for (const entry of assets) {
        entryCacheRef.current.set(entry.asset.id, entry);
      }
    }, [assets]);

    // Selection in tap order (order = slot order for template fills)
    const [selected, setSelected] = useState<string[]>([]);
    useEffect(() => {
      if (visible) {
        setSelected([]);
        setSource("memo");
        entryCacheRef.current.clear();
      }
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
      const chosen = selected
        .map((id) => entryCacheRef.current.get(id))
        .filter((entry): entry is PickerEntry => entry != null)
        .map(({ asset, photoId, albumId: srcAlbum, albumPhotoId }) => ({
          uri: asset.uri,
          photoId,
          ...(srcAlbum && albumPhotoId
            ? { albumId: srcAlbum, albumPhotoId }
            : {}),
          width: asset.width,
          height: asset.height,
        }));
      if (chosen.length > 0) onConfirm(chosen);
    }, [selected, onConfirm]);

    // Camera roll path: hand off to the system multi-picker and confirm
    // straight from its result
    const handleCameraRoll = useCallback(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: maxCount > 1,
        selectionLimit: maxCount,
        quality: 1,
      });
      if (result.canceled || result.assets.length === 0) return;
      onConfirm(
        result.assets.slice(0, maxCount).map((asset) => ({
          uri: asset.uri,
          photoId: null,
          width: asset.width,
          height: asset.height,
        })),
      );
    }, [maxCount, onConfirm]);

    // Album queries auto-drain their own pages; only the library paginates
    const handleEndReached = useCallback(() => {
      if (source === "memo" && hasNextPage) fetchNextPage();
    }, [source, hasNextPage, fetchNextPage]);

    // O(1) selection-order lookups for the cells
    const selectionOrder = useMemo(
      () => new Map(selected.map((id, index) => [id, index])),
      [selected],
    );

    const renderCell = useCallback(
      ({ item }: { item: PickerEntry }) => (
        <PickerCell
          entry={item}
          order={selectionOrder.get(item.asset.id) ?? -1}
          maxCount={maxCount}
          onToggle={toggle}
        />
      ),
      [selectionOrder, maxCount, toggle],
    );

    const keyExtractor = useCallback(
      (item: PickerEntry) => item.asset.id,
      [],
    );

    const title =
      maxCount === 1 ? "Choose a photo" : `Choose up to ${maxCount} photos`;

    return (
      <Sheet visible={visible} onClose={onClose} title={title}>
        <View style={styles.body}>
          {(allowCameraRoll || allowAlbums) && (
            <View style={styles.sourceRow}>
              <Pressable
                onPress={() => setSource("memo")}
                style={[
                  styles.sourceChip,
                  source === "memo" && styles.sourceChipActive,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: source === "memo" }}
              >
                <Text
                  style={[
                    styles.sourceText,
                    source === "memo" && styles.sourceTextActive,
                  ]}
                >
                  My Photos
                </Text>
              </Pressable>
              {allowAlbums && (
                <Pressable
                  onPress={() => {
                    setSource("albums");
                    if (!albumId && albums?.[0]) setAlbumId(albums[0].albumId);
                  }}
                  style={[
                    styles.sourceChip,
                    source === "albums" && styles.sourceChipActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: source === "albums" }}
                >
                  <Text
                    style={[
                      styles.sourceText,
                      source === "albums" && styles.sourceTextActive,
                    ]}
                  >
                    Albums
                  </Text>
                </Pressable>
              )}
              {allowCameraRoll && (
                <Pressable
                  onPress={handleCameraRoll}
                  style={styles.sourceChip}
                  accessibilityRole="button"
                  accessibilityLabel="Choose from camera roll"
                >
                  <Ionicons
                    name="phone-portrait-outline"
                    size={13}
                    color="#000"
                  />
                  <Text style={styles.sourceText}>Camera Roll</Text>
                </Pressable>
              )}
            </View>
          )}

          {source === "albums" && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.albumRowScroll}
              contentContainerStyle={styles.albumRow}
            >
              {(albums ?? []).map((album) => {
                const active = album.albumId === albumId;
                return (
                  <Pressable
                    key={album.albumId}
                    onPress={() => setAlbumId(album.albumId)}
                    style={[
                      styles.albumChip,
                      active && styles.albumChipActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.albumChipText,
                        active && styles.albumChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {album.title}
                    </Text>
                  </Pressable>
                );
              })}
              {(albums ?? []).length === 0 && (
                <Text style={styles.albumEmptyText}>No albums yet</Text>
              )}
            </ScrollView>
          )}
          {/* Virtualized: the whole merged library used to mount one
              image view per photo inside a ScrollView */}
          <PickerFlashList
            style={styles.grid}
            data={assets}
            renderItem={renderCell}
            keyExtractor={keyExtractor}
            numColumns={COLUMNS}
            extraData={selectionOrder}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="images-outline" size={40} color="#ccc" />
                <Text style={styles.emptyText}>No photos yet</Text>
              </View>
            }
          />

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
  sourceRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  sourceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: "#F2F2F7",
  },
  sourceChipActive: {
    backgroundColor: "#000",
  },
  sourceText: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  sourceTextActive: {
    color: "#fff",
  },
  albumRowScroll: {
    flexGrow: 0,
    marginBottom: 10,
  },
  albumRow: {
    gap: 8,
    paddingHorizontal: 16,
  },
  albumChip: {
    height: 30,
    maxWidth: 160,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: "#F9F9FB",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  albumChipActive: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  albumChipText: {
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#3C3C43",
  },
  albumChipTextActive: {
    color: "#fff",
  },
  albumEmptyText: {
    fontSize: 13,
    color: "#8E8E93",
    paddingVertical: 6,
  },
  grid: {
    flex: 1,
  },
  cell: {
    height: CELL,
    margin: GRID_GAP / 2,
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
    fontFamily: "InstrumentSans_700Bold",
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
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
});

export default LibraryPickerSheet;
