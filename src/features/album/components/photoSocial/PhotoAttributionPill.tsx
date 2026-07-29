/**
 * "Who took it" pill for a photo in the fullscreen viewer.
 *
 * Rendered PER PAGE (inside each pager item), so while swiping the pill
 * travels with its own photo and the next photo brings its own — instead
 * of one fixed pill lagging behind the scroll.
 *
 * The background is the uploader's album identity color at low opacity
 * (their avatar ring color); your own uploads read "You".
 */

import React, { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";

import { useAuthStore } from "@/features/auth/store/authStore";
import type { MediaAsset } from "@/features/album/hooks/useMediaLibrary";
import { useGetPhotosQuery } from "../../api/photo.queries";
import { useGetAlbumQuery } from "../../api/album.queries";
import { memberColor } from "../../memberColor";

/** "now", "5m", "3h", "2d", then a date — matches the social overlay. */
const compactTimeAgo = (iso: string): string => {
  const then = dayjs(iso);
  if (!then.isValid()) return "";
  const minutes = dayjs().diff(then, "minute");
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return then.format("D MMM");
};

/** #RRGGBB → rgba() at the given alpha (pill backgrounds). */
const withAlpha = (hex: string, alpha: number): string => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return `rgba(0, 0, 0, ${alpha})`;
  const value = parseInt(match[1]!, 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

interface PhotoAttributionPillProps {
  albumId: string;
  asset: MediaAsset;
}

export const PhotoAttributionPill = memo<PhotoAttributionPillProps>(
  ({ albumId, asset }) => {
    const insets = useSafeAreaInsets();
    // Cache hits — the viewer surfaces already run both queries
    const { data: photos } = useGetPhotosQuery(albumId);
    const { data: album } = useGetAlbumQuery(albumId);
    const currentUserId = useAuthStore((state) => state.user?.id);

    const photo = useMemo(
      () => photos?.find((p) => p.photoId === asset.id),
      [photos, asset.id],
    );

    if (!photo?.uploader) return null;

    const isMe = photo.uploader.userId === currentUserId;
    const member = album?.members?.find(
      (m) => m.userId === photo.uploader.userId,
    );
    const ring = memberColor(member);
    const timeAgo = compactTimeAgo(photo.createdAt);

    return (
      <View
        style={[styles.row, { top: insets.top + 58 }]}
        pointerEvents="none"
      >
        <View style={[styles.pill, { backgroundColor: withAlpha(ring, 0.4) }]}>
          {photo.uploader.avatarUrl ? (
            <Image
              source={{ uri: photo.uploader.avatarUrl }}
              style={[styles.avatar, { borderColor: ring }]}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { borderColor: ring }]}>
              <Ionicons name="person" size={11} color="#eee" />
            </View>
          )}
          <Text style={styles.name} numberOfLines={1}>
            {isMe ? "You" : photo.uploader.name}
          </Text>
          {timeAgo !== "" && <Text style={styles.time}>{timeAgo}</Text>}
        </View>
      </View>
    );
  },
);
PhotoAttributionPill.displayName = "PhotoAttributionPill";

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 28,
    maxWidth: 260,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  avatarFallback: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    flexShrink: 1,
  },
  time: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 12,
  },
});

export default PhotoAttributionPill;
