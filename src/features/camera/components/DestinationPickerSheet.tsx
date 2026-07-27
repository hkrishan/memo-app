/**
 * DestinationPickerSheet
 * A dark bottom sheet listing capture destinations:
 * optionally "Gallery" first, then the user's albums (cover thumb + title).
 * The current selection shows a checkmark on a highlighted row. Used both by
 * the camera's sticky destination picker and by the post-capture sheet's
 * one-off "Change album" flow. Matches the camera's dark UI.
 */

import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "react-native-paper";

import Sheet from "@/components/ui/Sheet";
import { Album } from "@/features/album/types/album.types";

/** Best available cover image for an album, or null when it has none yet. */
export const resolveAlbumCoverUri = (album: Album): string | null =>
  album.coverPhoto?.thumbnailUrl ??
  album.coverPhoto?.url ??
  album.coverPhotoUrl ??
  album.recentPhotos?.[0]?.thumbnailUrl ??
  album.recentPhotos?.[0]?.url ??
  null;

interface DestinationPickerSheetProps {
  visible: boolean;
  albums: Album[] | undefined;
  /** Show the "Gallery" row above the albums (sticky picker only). */
  showGallery: boolean;
  title: string;
  /** Currently-selected destination, for the checkmark/highlight. */
  selectedType?: "gallery" | "album";
  selectedAlbumId?: string | null;
  onSelectGallery?: () => void;
  onSelectAlbum: (albumId: string) => void;
  onClose: () => void;
}

export const DestinationPickerSheet: React.FC<DestinationPickerSheetProps> = ({
  visible,
  albums,
  showGallery,
  title,
  selectedType,
  selectedAlbumId,
  onSelectGallery,
  onSelectAlbum,
  onClose,
}) => {
  const hasAlbums = !!albums && albums.length > 0;

  return (
    <Sheet visible={visible} onClose={onClose} title={title} tone="dark">

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {showGallery && (
              <Pressable
                onPress={onSelectGallery}
                style={[
                  styles.row,
                  selectedType === "gallery" && styles.rowSelected,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save to gallery"
              >
                <View style={styles.galleryIcon}>
                  <Ionicons name="images" size={20} color="#fff" />
                </View>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  Gallery
                </Text>
                {selectedType === "gallery" && (
                  <Ionicons name="checkmark-circle" size={22} color="#30D158" />
                )}
              </Pressable>
            )}

            {hasAlbums ? (
              albums!.map((album) => {
                const cover = resolveAlbumCoverUri(album);
                const isSelected =
                  selectedType === "album" &&
                  selectedAlbumId === album.albumId;
                return (
                  <Pressable
                    key={album.albumId}
                    onPress={() => onSelectAlbum(album.albumId)}
                    style={[styles.row, isSelected && styles.rowSelected]}
                    accessibilityRole="button"
                    accessibilityLabel={`Save to album ${album.title}`}
                  >
                    {cover ? (
                      <Image
                        source={{ uri: cover }}
                        style={styles.cover}
                        contentFit="cover"
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
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color="#30D158"
                      />
                    )}
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.emptyText}>
                Create an album to send captures straight to it
              </Text>
            )}
          </ScrollView>
    </Sheet>
  );
};

const styles = StyleSheet.create({
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
  galleryIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    alignItems: "center",
    justifyContent: "center",
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
  emptyText: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
});

export default DestinationPickerSheet;
