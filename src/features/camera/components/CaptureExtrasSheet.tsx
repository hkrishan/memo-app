/**
 * CaptureExtrasSheet — "Where captures go"
 * The sticky capture-destination preferences. Every capture always saves to
 * the Memo library (stated as a fixed fact up top), and the user toggles the
 * optional extras here: also save to the device camera roll, and/or also
 * copy into any number of albums. The FIRST selected album is the one the
 * camera's "Saving to" pill names, marked "default" in the list.
 * Dark, matching the camera UI.
 */

import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "react-native-paper";

import Sheet from "@/components/ui/Sheet";
import { color, font } from "@/lib/tokens";
import { Album } from "@/features/album/types/album.types";
import { CaptureExtras } from "../store/captureDestinationStore";
import { resolveAlbumCoverUri } from "./DestinationPickerSheet";

interface CaptureExtrasSheetProps {
  visible: boolean;
  albums: Album[] | undefined;
  extras: CaptureExtras;
  onToggleDeviceGallery: (value: boolean) => void;
  /** Add/remove one album from the sticky set. */
  onToggleAlbum: (albumId: string) => void;
  onClose: () => void;
}

/** "Just you · 152 photos" / "4 people · 166 photos" — from what the album
 *  actually carries; either segment drops out when the data isn't there. */
const albumSubtitle = (album: Album): string => {
  const parts: string[] = [];
  const people = album.members?.length;
  if (people != null) {
    parts.push(people <= 1 ? "Just you" : `${people} people`);
  }
  if (album.photoCount != null) {
    parts.push(`${album.photoCount} ${album.photoCount === 1 ? "photo" : "photos"}`);
  }
  return parts.join(" · ");
};

export const CaptureExtrasSheet: React.FC<CaptureExtrasSheetProps> = ({
  visible,
  albums,
  extras,
  onToggleDeviceGallery,
  onToggleAlbum,
  onClose,
}) => {
  const hasAlbums = !!albums && albums.length > 0;
  const selectedCount = extras.alsoAlbumIds.length;
  const defaultAlbumId = extras.alsoAlbumIds[0] ?? null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      tone="dark"
      style={styles.sheet}
    >
      {/* Header: title + close */}
      <View style={styles.header}>
        <Text style={styles.title}>Where captures go</Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
        </Pressable>
      </View>
      <Text style={styles.subtitle}>
        Applies to every photo until you change it.
      </Text>

      {/* The fixed base — a fact, not a control */}
      <View style={styles.baseRow}>
        <Ionicons
          name="lock-closed-outline"
          size={18}
          color="rgba(255,255,255,0.7)"
        />
        <Text style={styles.baseText}>
          Always saved to your <Text style={styles.baseTextStrong}>Memo library</Text>
        </Text>
      </View>

      <View style={styles.divider} />

      {/* Extra: device camera roll */}
      <View style={styles.rollRow}>
        <View style={styles.rollGlyph}>
          <Ionicons name="image-outline" size={20} color="#fff" />
        </View>
        <Text style={styles.rollTitle} numberOfLines={1}>
          Also save to camera roll
        </Text>
        <Switch
          value={extras.alsoDeviceGallery}
          onValueChange={onToggleDeviceGallery}
          trackColor={{
            false: "rgba(255, 255, 255, 0.16)",
            true: color.success,
          }}
          ios_backgroundColor="rgba(255, 255, 255, 0.16)"
          accessibilityLabel="Also save to camera roll"
        />
      </View>

      <View style={styles.divider} />

      {/* Albums */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Add to album</Text>
        {selectedCount > 0 && (
          <Text style={styles.sectionCount}>
            {selectedCount} selected
          </Text>
        )}
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {hasAlbums ? (
          albums!.map((album) => {
            const cover = resolveAlbumCoverUri(album);
            const isSelected = extras.alsoAlbumIds.includes(album.albumId);
            const subtitle = albumSubtitle(album);
            return (
              <Pressable
                key={album.albumId}
                onPress={() => onToggleAlbum(album.albumId)}
                style={styles.albumRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={`Add captures to album ${album.title}`}
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
                <View style={styles.albumTextWrap}>
                  <View style={styles.albumTitleRow}>
                    <Text style={styles.albumTitle} numberOfLines={1}>
                      {album.title}
                    </Text>
                    {album.albumId === defaultAlbumId && (
                      <View style={styles.defaultChip}>
                        <Text style={styles.defaultChipText}>Default</Text>
                      </View>
                    )}
                  </View>
                  {subtitle !== "" && (
                    <Text style={styles.albumSubtitle} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  )}
                </View>
                {isSelected ? (
                  <View style={styles.checkOn}>
                    <Ionicons name="checkmark" size={15} color="#000" />
                  </View>
                ) : (
                  <View style={styles.checkOff} />
                )}
              </Pressable>
            );
          })
        ) : (
          <Text style={styles.emptyText}>
            Create an album to also send captures straight to it
          </Text>
        )}
      </ScrollView>

      <Pressable
        onPress={onClose}
        style={({ pressed }) => [styles.doneButton, pressed && styles.donePressed]}
        accessibilityRole="button"
        accessibilityLabel="Done"
      >
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  title: {
    ...font.bold,
    fontSize: 22,
    color: "#fff",
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    ...font.regular,
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.55)",
    marginTop: 4,
    marginBottom: 18,
  },
  baseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    paddingBottom: 16,
  },
  baseText: {
    ...font.regular,
    fontSize: 15,
    color: "rgba(255, 255, 255, 0.85)",
    flex: 1,
  },
  baseTextStrong: {
    ...font.bold,
    color: "#fff",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separatorDark,
  },
  rollRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
  },
  rollGlyph: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  rollTitle: {
    ...font.medium,
    flex: 1,
    fontSize: 16,
    color: "#fff",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 6,
  },
  sectionLabel: {
    ...font.semibold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.5)",
  },
  sectionCount: {
    ...font.medium,
    fontSize: 13,
    color: "#fff",
  },
  list: {
    flexGrow: 0,
    maxHeight: 320,
  },
  listContent: {
    paddingBottom: 4,
  },
  albumRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 10,
  },
  cover: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  coverFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  albumTextWrap: {
    flex: 1,
  },
  albumTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  albumTitle: {
    ...font.semibold,
    flexShrink: 1,
    fontSize: 16,
    color: "#fff",
  },
  defaultChip: {
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  defaultChipText: {
    ...font.bold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.8)",
  },
  albumSubtitle: {
    ...font.regular,
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 2,
  },
  checkOn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOff: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  emptyText: {
    ...font.regular,
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 14,
    paddingVertical: 12,
  },
  doneButton: {
    marginTop: 14,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  donePressed: {
    opacity: 0.85,
  },
  doneText: {
    ...font.semibold,
    fontSize: 17,
    color: "#000",
  },
});

export default CaptureExtrasSheet;
