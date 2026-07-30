/**
 * CaptureDestinationButton
 * The ALBUM tile docked to the RIGHT of the shutter (mirroring the
 * last-capture thumbnail on the left). Shows the first sticky album's cover
 * as its face — or a quiet dark tile when captures go to the library alone —
 * with the Memo bookmark riding the corner (every capture always lands in
 * the Memo library). Tapping opens the capture-extras sheet.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { font } from "@/lib/tokens";
import { Album } from "@/features/album/types/album.types";
import { CaptureExtras } from "../store/captureDestinationStore";
import { resolveAlbumCoverUri } from "./DestinationPickerSheet";

const TILE_SIZE = 56;

interface CaptureDestinationButtonProps {
  /** Resolved extras (albums already checked to still exist). */
  extras: CaptureExtras;
  albums: Album[] | undefined;
  onPress: () => void;
}

export const CaptureDestinationButton: React.FC<
  CaptureDestinationButtonProps
> = ({ extras, albums, onPress }) => {
  const primaryAlbum = extras.alsoAlbumIds.length
    ? albums?.find((a) => a.albumId === extras.alsoAlbumIds[0])
    : undefined;
  const coverUri = primaryAlbum ? resolveAlbumCoverUri(primaryAlbum) : null;

  const albumNames = extras.alsoAlbumIds
    .map((id) => albums?.find((a) => a.albumId === id)?.title)
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Capture destinations: Memo library${
        albumNames ? ` and ${albumNames}` : ""
      }${extras.alsoDeviceGallery ? ", camera roll" : ""}. Tap to change.`}
    >
      <View style={styles.tile}>
        {coverUri && (
          <Image
            source={{ uri: coverUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={120}
          />
        )}
        {/* Label scrim: keeps ALBUM legible over any cover */}
        <View style={styles.labelScrim} />
        <Text style={styles.label}>Album</Text>
      </View>
      {/* Memo-library bookmark riding the corner — the always-on base */}
      <View style={styles.memoBadge}>
        <Ionicons name="bookmark" size={11} color="#000" />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  pressed: {
    opacity: 0.8,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(24, 24, 24, 0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.25)",
    justifyContent: "flex-end",
  },
  labelScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 26,
    backgroundColor: "rgba(0, 0, 0, 0.28)",
  },
  label: {
    ...font.bold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  memoBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CaptureDestinationButton;
