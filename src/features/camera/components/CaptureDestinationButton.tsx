/**
 * CaptureDestinationButton
 * Shows WHERE the next capture auto-saves, docked to the RIGHT of the shutter
 * (mirroring the last-capture thumbnail on the left). Gallery destination
 * renders an "images" glyph in a dark circular chip; an album renders the
 * album's cover thumbnail in the same chip (subtle white border), falling
 * back to an "albums" glyph. Tapping opens the destination picker.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { Album } from "@/features/album/types/album.types";
import { CaptureDestination } from "../store/captureDestinationStore";
import { resolveAlbumCoverUri } from "./DestinationPickerSheet";

const CHIP_SIZE = 46;

interface CaptureDestinationButtonProps {
  /** Resolved destination (album already checked to still exist). */
  destination: CaptureDestination;
  albums: Album[] | undefined;
  onPress: () => void;
}

export const CaptureDestinationButton: React.FC<
  CaptureDestinationButtonProps
> = ({ destination, albums, onPress }) => {
  const album =
    destination.type === "album"
      ? albums?.find((a) => a.albumId === destination.albumId)
      : undefined;
  const coverUri = album ? resolveAlbumCoverUri(album) : null;
  const label = destination.type === "album" ? (album?.title ?? "Album") : "Gallery";

  const accessibilityLabel =
    destination.type === "album"
      ? `Capture destination: ${album?.title ?? "album"}. Tap to change.`
      : "Capture destination: gallery. Tap to change.";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.chip}>
      {destination.type === "album" ? (
        coverUri ? (
          <Image
            source={{ uri: coverUri }}
            style={styles.cover}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View style={styles.fallback}>
            <Ionicons
              name="albums"
              size={20}
              color="rgba(255, 255, 255, 0.95)"
            />
          </View>
        )
      ) : (
        <View style={styles.fallback}>
          <Ionicons name="images" size={22} color="rgba(255, 255, 255, 0.95)" />
        </View>
      )}
      </View>
      {/* Destination name, tiny, under the chip — legible over any scene */}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    width: 64,
  },
  label: {
    marginTop: 4,
    maxWidth: 64,
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  chip: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: CHIP_SIZE / 2,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.9)",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  pressed: {
    opacity: 0.7,
  },
  cover: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CaptureDestinationButton;
