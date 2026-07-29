/**
 * CaptureDestinationButton
 * Shows where the next capture goes, docked to the RIGHT of the shutter
 * (mirroring the last-capture thumbnail on the left). Every capture goes to
 * the Memo library (the always-on base, shown as the Memo glyph); the sticky
 * EXTRAS ride on top — a small album cover badge when an album extra is set,
 * plus a tiny label naming just those extras ("Roll", "<Album>",
 * "Roll · <Album>"), blank when there are none. The Memo base is deliberately
 * not named: it never changes, so printing it only crowds the label.
 * Tapping opens the capture-extras preferences sheet.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { Album } from "@/features/album/types/album.types";
import { CaptureExtras } from "../store/captureDestinationStore";
import { resolveAlbumCoverUri } from "./DestinationPickerSheet";

const CHIP_SIZE = 46;

interface CaptureDestinationButtonProps {
  /** Resolved extras (album already checked to still exist). */
  extras: CaptureExtras;
  albums: Album[] | undefined;
  onPress: () => void;
}

export const CaptureDestinationButton: React.FC<
  CaptureDestinationButtonProps
> = ({ extras, albums, onPress }) => {
  const album = extras.alsoAlbumId
    ? albums?.find((a) => a.albumId === extras.alsoAlbumId)
    : undefined;
  const coverUri = album ? resolveAlbumCoverUri(album) : null;

  // The Memo library is the always-on base, so naming it adds nothing — the
  // label reads only the EXTRAS riding on top ("Roll", "<Album>", both), and
  // stays empty when there are none.
  const parts: string[] = [];
  if (extras.alsoDeviceGallery) parts.push("Roll");
  if (album) parts.push(album.title);
  const label = parts.join(" · ");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      accessibilityRole="button"
      // Screen readers still hear the full picture, Memo base included
      accessibilityLabel={`Capture destinations: Memo${
        label ? ` · ${label}` : ""
      }. Tap to change.`}
    >
      <View style={styles.chip}>
        <View style={styles.fallback}>
          <Ionicons
            name="bookmark"
            size={20}
            color="rgba(255, 255, 255, 0.95)"
          />
        </View>
        {/* Album extra: cover thumbnail badge overlapping the base chip */}
        {album ? (
          coverUri ? (
            <Image
              source={{ uri: coverUri }}
              style={styles.albumBadge}
              contentFit="cover"
              transition={120}
            />
          ) : (
            <View style={[styles.albumBadge, styles.albumBadgeFallback]}>
              <Ionicons
                name="albums"
                size={12}
                color="rgba(255, 255, 255, 0.95)"
              />
            </View>
          )
        ) : null}
      </View>
      {/* Extra destinations, tiny, under the chip — legible over any scene.
          Omitted entirely with no extras, so the chip doesn't sit above a
          blank line's worth of space. */}
      {label !== "" && (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      )}
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
    fontFamily: "InstrumentSans_600SemiBold",
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
    overflow: "visible",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.9)",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  albumBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "rgba(0, 0, 0, 0.6)",
    backgroundColor: "rgba(60, 60, 66, 0.9)",
  },
  albumBadgeFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  fallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CaptureDestinationButton;
