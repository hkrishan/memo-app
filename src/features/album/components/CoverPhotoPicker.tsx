/**
 * CoverPhotoPicker
 * Sheet for choosing the album picture from the album's own photos.
 * "Latest photo" is the automatic default when no picture is chosen.
 */

import React, { memo, useCallback } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  Dimensions,
} from "react-native";
import { Text, ActivityIndicator } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { MediaAsset } from "../hooks";
import { CachedImage } from "@/components/ui/CachedImage";
import { useUpdateAlbumMutation } from "../api/album.queries";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const GRID_GAP = 2;
const CELL_SIZE =
  (SCREEN_WIDTH - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

interface CoverPhotoPickerProps {
  visible: boolean;
  albumId: string;
  assets: MediaAsset[];
  /** photoId of the explicitly chosen cover, null when automatic */
  currentCoverId: string | null;
  onClose: () => void;
}

export const CoverPhotoPicker: React.FC<CoverPhotoPickerProps> = memo(
  ({ visible, albumId, assets, currentCoverId, onClose }) => {
    const insets = useSafeAreaInsets();
    const updateAlbum = useUpdateAlbumMutation(albumId);

    const handleSelect = useCallback(
      (coverPhotoId: string | null) => {
        if (updateAlbum.isPending) return;
        if (coverPhotoId === currentCoverId) {
          onClose();
          return;
        }
        Haptics.selectionAsync();
        updateAlbum.mutate(
          { coverPhotoId },
          {
            onSuccess: () => {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              onClose();
            },
          },
        );
      },
      [updateAlbum, currentCoverId, onClose],
    );

    const renderItem = useCallback(
      ({ item, index }: { item: MediaAsset; index: number }) => {
        const selected = item.id === currentCoverId;
        return (
          <Pressable
            onPress={() => handleSelect(item.id)}
            style={[
              styles.cell,
              index % NUM_COLUMNS !== 0 && { marginLeft: GRID_GAP },
            ]}
          >
            <CachedImage
              uri={item.thumbnailUrl ?? item.uri}
              style={styles.cellImage}
            />
            {selected && (
              <View style={styles.cellSelectedOverlay}>
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                </View>
              </View>
            )}
          </Pressable>
        );
      },
      [currentCoverId, handleSelect],
    );

    const latest = assets[0];

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.headerButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Album picture</Text>
            <View style={styles.headerButton}>
              {updateAlbum.isPending && <ActivityIndicator size={16} />}
            </View>
          </View>

          <FlatList
            data={assets}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            numColumns={NUM_COLUMNS}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            ListHeaderComponent={
              <Pressable
                onPress={() => handleSelect(null)}
                style={styles.automaticRow}
              >
                <View style={styles.automaticThumb}>
                  {latest ? (
                    <CachedImage
                      uri={latest.thumbnailUrl ?? latest.uri}
                      style={styles.automaticThumbImage}
                    />
                  ) : (
                    <Ionicons name="images-outline" size={20} color="#999" />
                  )}
                </View>
                <View style={styles.automaticTextContainer}>
                  <Text style={styles.automaticTitle}>Latest photo</Text>
                  <Text style={styles.automaticSubtitle}>
                    Always shows the newest photo in the album
                  </Text>
                </View>
                {currentCoverId === null && (
                  <Ionicons name="checkmark" size={22} color="#000" />
                )}
              </Pressable>
            }
          />
        </View>
      </Modal>
    );
  },
);
CoverPhotoPicker.displayName = "CoverPhotoPicker";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  headerButton: {
    minWidth: 56,
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 16,
    color: "#000",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  automaticRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  automaticThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  automaticThumbImage: {
    width: "100%",
    height: "100%",
  },
  automaticTextContainer: {
    flex: 1,
  },
  automaticTitle: {
    fontSize: 16,
    color: "#000",
  },
  automaticSubtitle: {
    fontSize: 13,
    color: "#888",
    marginTop: 1,
  },
  gridRow: {
    marginBottom: GRID_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  cellImage: {
    width: "100%",
    height: "100%",
  },
  cellSelectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    padding: 6,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CoverPhotoPicker;
