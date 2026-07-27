/**
 * CaptureExtrasSheet
 * The sticky capture-destination preferences. Every capture always saves to
 * the Memo library (a fixed, non-removable row), and the user toggles the
 * optional extras here: also save to the device camera roll, and/or also
 * copy into a single album (tap an album to set it, tap again to clear).
 * Dark, matching the camera UI.
 */

import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Album } from "@/features/album/types/album.types";
import { CaptureExtras } from "../store/captureDestinationStore";
import { resolveAlbumCoverUri } from "./DestinationPickerSheet";

interface CaptureExtrasSheetProps {
  visible: boolean;
  albums: Album[] | undefined;
  extras: CaptureExtras;
  onToggleDeviceGallery: (value: boolean) => void;
  /** Toggle the single sticky album (tapping the active one clears it). */
  onToggleAlbum: (albumId: string) => void;
  onClose: () => void;
}

export const CaptureExtrasSheet: React.FC<CaptureExtrasSheetProps> = ({
  visible,
  albums,
  extras,
  onToggleDeviceGallery,
  onToggleAlbum,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const hasAlbums = !!albums && albums.length > 0;

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
          <Text style={styles.title}>Save captures to</Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Fixed, non-removable base: the Memo library, always on */}
            <View style={[styles.row, styles.rowFixed]}>
              <View style={styles.glyph}>
                <Ionicons name="bookmark" size={20} color="#fff" />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  Memo library
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  Always — every photo is saved here
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color="#30D158" />
            </View>

            {/* Extra: device camera roll */}
            <Pressable
              onPress={() => onToggleDeviceGallery(!extras.alsoDeviceGallery)}
              style={styles.row}
              accessibilityRole="switch"
              accessibilityState={{ checked: extras.alsoDeviceGallery }}
              accessibilityLabel="Also save to device camera roll"
            >
              <View style={styles.glyph}>
                <Ionicons name="images" size={20} color="#fff" />
              </View>
              <Text style={styles.rowTitle} numberOfLines={1}>
                Also save to camera roll
              </Text>
              <Ionicons
                name={extras.alsoDeviceGallery ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={extras.alsoDeviceGallery ? "#30D158" : "rgba(255,255,255,0.35)"}
              />
            </Pressable>

            <Text style={styles.sectionLabel}>Also add to album</Text>

            {hasAlbums ? (
              albums!.map((album) => {
                const cover = resolveAlbumCoverUri(album);
                const isSelected = extras.alsoAlbumId === album.albumId;
                return (
                  <Pressable
                    key={album.albumId}
                    onPress={() => onToggleAlbum(album.albumId)}
                    style={[styles.row, isSelected && styles.rowSelected]}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={`Also add captures to album ${album.title}`}
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
                    <Ionicons
                      name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                      size={22}
                      color={isSelected ? "#30D158" : "rgba(255,255,255,0.35)"}
                    />
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.emptyText}>
                Create an album to also send captures straight to it
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
    maxHeight: "72%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    marginBottom: 14,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
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
  sectionLabel: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 2,
    marginLeft: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  rowFixed: {
    backgroundColor: "rgba(48, 209, 88, 0.10)",
  },
  rowSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.10)",
  },
  rowTextWrap: {
    flex: 1,
  },
  glyph: {
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
  rowSubtitle: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
});

export default CaptureExtrasSheet;
