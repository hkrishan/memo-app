/**
 * AlbumMultiSelectSheet
 * Album picker for a library photo: a checkbox list of every album, with the
 * ones the photo already lives in pre-checked. The user ticks/unticks freely
 * and confirms once — membership is then synced as a diff (checked albums
 * gain a copy, unchecked ones lose theirs). Clearing every box is a valid
 * choice: the photo then lives only in the Memo library.
 *
 * Matches DestinationPickerSheet's dark styling so the viewer's sheets read
 * as one family.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { stableCacheKey } from "@/lib/imageCache";
import { Album } from "@/features/album/types/album.types";
import { resolveAlbumCoverUri } from "@/features/camera/components/DestinationPickerSheet";

interface AlbumMultiSelectSheetProps {
  visible: boolean;
  albums: Album[] | undefined;
  /** Album ids the photo currently belongs to — the initial checked set. */
  selectedAlbumIds: string[];
  /** Confirmed selection (may be empty = library only). */
  onConfirm: (albumIds: string[]) => void;
  onClose: () => void;
  /** Disables Done while a previous sync is still running. */
  busy?: boolean;
}

export const AlbumMultiSelectSheet: React.FC<AlbumMultiSelectSheetProps> = ({
  visible,
  albums,
  selectedAlbumIds,
  onConfirm,
  onClose,
  busy = false,
}) => {
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState<string[]>(selectedAlbumIds);

  // Seed exactly on OPEN, from a ref — the library feed refetches in the
  // background, and re-seeding on every membership identity change would
  // wipe ticks the user had already made while the sheet was up.
  const selectedRef = useRef(selectedAlbumIds);
  selectedRef.current = selectedAlbumIds;
  useEffect(() => {
    if (visible) setChecked(selectedRef.current);
  }, [visible]);

  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const hasAlbums = !!albums && albums.length > 0;

  const dirty = useMemo(() => {
    const initial = new Set(selectedAlbumIds);
    if (initial.size !== checkedSet.size) return true;
    for (const id of checkedSet) if (!initial.has(id)) return true;
    return false;
  }, [selectedAlbumIds, checkedSet]);

  const toggle = (albumId: string) => {
    setChecked((ids) =>
      ids.includes(albumId)
        ? ids.filter((id) => id !== albumId)
        : [...ids, albumId],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text style={styles.title}>Add to album</Text>
            <Pressable
              onPress={() => onConfirm(checked)}
              disabled={busy || !dirty}
              hitSlop={8}
              style={({ pressed }) => [
                styles.doneButton,
                (busy || !dirty) && styles.doneButtonDisabled,
                pressed && styles.doneButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save album selection"
            >
              <Text
                style={[
                  styles.doneText,
                  (busy || !dirty) && styles.doneTextDisabled,
                ]}
              >
                Done
              </Text>
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            {checked.length === 0
              ? "Saved to your Memo photos only"
              : `In ${checked.length} album${checked.length === 1 ? "" : "s"}`}
          </Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {hasAlbums ? (
              albums!.map((album) => {
                const cover = resolveAlbumCoverUri(album);
                const isChecked = checkedSet.has(album.albumId);
                return (
                  <Pressable
                    key={album.albumId}
                    onPress={() => toggle(album.albumId)}
                    style={[styles.row, isChecked && styles.rowSelected]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                    accessibilityLabel={album.title}
                  >
                    {cover ? (
                      <Image
                        source={{ uri: cover, cacheKey: stableCacheKey(cover) }}
                        style={styles.cover}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={120}
                      />
                    ) : (
                      <View style={[styles.cover, styles.coverFallback]}>
                        <Ionicons
                          name="albums"
                          size={18}
                          color="rgba(255,255,255,0.7)"
                        />
                      </View>
                    )}
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {album.title}
                    </Text>
                    <View
                      style={[
                        styles.checkbox,
                        isChecked && styles.checkboxChecked,
                      ]}
                    >
                      {isChecked && (
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      )}
                    </View>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.emptyText}>
                Create an album to add this photo to it
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  sheet: {
    backgroundColor: "rgba(22, 22, 24, 0.98)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
    maxHeight: "70%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginLeft: 4,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  doneButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "#0A84FF",
  },
  doneButtonDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  doneButtonPressed: {
    opacity: 0.75,
  },
  doneText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  doneTextDisabled: {
    color: "rgba(255, 255, 255, 0.4)",
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
    marginLeft: 4,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: 8,
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  rowSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.10)",
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  coverFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#0A84FF",
    borderColor: "#0A84FF",
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
});

export default AlbumMultiSelectSheet;
