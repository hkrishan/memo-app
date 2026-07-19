/**
 * AlbumCover Component
 * Complete album card with cover photo/grid background, title overlay, and member avatars
 */

import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Text } from "react-native-paper";
import { BlurView } from "expo-blur";
import { Album } from "../types/album.types";
import AvatarListRow from "@/components/ui/AvatarListRow";
import { CachedImage } from "@/components/ui/CachedImage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface AlbumCoverProps {
  album: Album;
  size?: number;
  borderRadius?: number;
  titleSize?: number;
  showMembers?: boolean;
}

export const AlbumCover: React.FC<AlbumCoverProps> = ({
  album,
  size = (SCREEN_WIDTH - 52) / 2,
  borderRadius = 30,
  titleSize = 16,
  showMembers = true,
}) => {
  const { title, coverPhoto, recentPhotos, members } = album;
  const hasRecentPhotos = recentPhotos && recentPhotos.length > 0;
  const photoGridSize = size / 3;

  const renderBackground = () => {
    // If we have a dedicated cover photo, show it full size
    if (coverPhoto?.url) {
      return (
        <CachedImage
          uri={coverPhoto.url}
          style={[styles.coverImage, { borderRadius }]}
          showPlaceholder={false}
        />
      );
    }

    // If we have recent photos, show a blurred grid
    if (hasRecentPhotos) {
      return (
        <>
          <CachedImage
            uri={recentPhotos[0].url}
            style={[styles.coverImage, { borderRadius }]}
            showPlaceholder={false}
          />
          <BlurView
            style={[styles.blurOverlay, { borderRadius }]}
            intensity={8}
          />
        </>
      );
    }

    // Fallback placeholder background
    return <View style={[styles.placeholderBg, { borderRadius }]} />;
  };

  return (
    <View
      style={[styles.container, { width: size, height: size, borderRadius }]}
    >
      {renderBackground()}

      {/* Title overlay */}
      <View style={styles.titleOverlay}>
        <Text
          style={[
            styles.albumTitle,
            {
              fontSize: titleSize,
              fontFamily: "BowlbyOneSC",
            },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>

      {/* Members row */}
      {showMembers && members && members.length > 0 && (
        <View style={styles.membersRow}>
          <AvatarListRow
            avatars={members}
            maxAvatars={3}
            avatarSize={24}
            gap={-5}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#e0e0e0",
    overflow: "hidden",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  photoGrid: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  placeholderBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#c0c0c0",
  },
  titleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  albumTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  membersRow: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
  },
});

export default AlbumCover;
