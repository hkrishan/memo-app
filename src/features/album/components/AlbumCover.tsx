/**
 * AlbumCover Component
 * Square album cover: crisp cover photo (or most recent photo), member
 * avatars over a soft bottom scrim, and a hairline edge so light photos
 * don't dissolve into the page. The album title is NOT rendered here —
 * cards caption themselves below the cover (see AlbumCard).
 */

import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Album, AlbumPhoto } from "../types/album.types";
import AvatarListRow from "@/components/ui/AvatarListRow";
import { CachedImage } from "@/components/ui/CachedImage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/** The renderable image for a cover candidate: videos use their poster
 *  frame (the raw video URL is not an image), and photos prefer the
 *  thumbnail — decoding the full-resolution original into a ~180pt tile
 *  cost a full-size decode per album card. || (not ??) so empty-string
 *  URLs fall through too. */
const coverImageUri = (photo?: AlbumPhoto | null): string | null => {
  if (!photo) return null;
  if (photo.mediaType === "video") return photo.thumbnailUrl || null;
  return photo.thumbnailUrl || photo.url || null;
};

interface AlbumCoverProps {
  album: Album;
  size?: number;
  borderRadius?: number;
  showMembers?: boolean;
}

export const AlbumCover: React.FC<AlbumCoverProps> = ({
  album,
  size = (SCREEN_WIDTH - 52) / 2,
  borderRadius = 24,
  showMembers = true,
}) => {
  const { coverPhoto, recentPhotos, members } = album;
  // The dedicated cover wins; otherwise the newest photo stands in — shown
  // crisp either way, since no text sits on top of it anymore.
  const coverUri =
    coverImageUri(coverPhoto) || coverImageUri(recentPhotos?.[0]) || null;
  const hasAvatars = showMembers && members && members.length > 0;

  return (
    <View
      style={[styles.container, { width: size, height: size, borderRadius }]}
    >
      {coverUri ? (
        <CachedImage
          uri={coverUri}
          style={[styles.coverImage, { borderRadius }]}
          showPlaceholder={false}
        />
      ) : (
        <View style={styles.emptyWell}>
          <Ionicons name="images-outline" size={28} color="#C7C7CC" />
        </View>
      )}

      {/* Avatars need to read over any photo; a scrim over the empty well
          would just look dirty */}
      {hasAvatars && coverUri != null && (
        <LinearGradient
          colors={["transparent", "rgba(0, 0, 0, 0.35)"]}
          style={styles.avatarScrim}
          pointerEvents="none"
        />
      )}

      {hasAvatars && (
        <View style={styles.membersRow}>
          <AvatarListRow
            avatars={members}
            maxAvatars={3}
            avatarSize={24}
            gap={-5}
          />
        </View>
      )}

      <View
        style={[styles.edge, { borderRadius }]}
        pointerEvents="none"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F1F1F3",
    overflow: "hidden",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  emptyWell: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
  },
  edge: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.08)",
  },
  membersRow: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
  },
});

export default AlbumCover;
