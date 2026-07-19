/**
 * AlbumsGrid Component
 * Displays albums in a grid layout using AlbumCover cards
 */

import React, { useCallback, useEffect, memo } from "react";
import { View, StyleSheet, Pressable, Dimensions } from "react-native";
import { Text, ActivityIndicator } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Album } from "../types/album.types";
import { AlbumCover } from "./AlbumCover";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 12;
const GRID_PADDING = 20;
const ALBUM_CARD_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

interface AlbumsGridProps {
  albums: Album[] | undefined;
  isLoading?: boolean;
  onAlbumPress?: (album: Album) => void;
}

interface AlbumCardProps {
  album: Album;
  onPress?: () => void | null;
  size?: number;
  titleSize?: number;
}

export const AlbumCard: React.FC<AlbumCardProps> = memo(
  ({ album, onPress = null, size = ALBUM_CARD_SIZE, titleSize = 16 }) => {
    return (
      <Pressable
        style={({ pressed }) =>
          onPress && [styles.albumCard, pressed && styles.albumCardPressed]
        }
        onPress={onPress ?? undefined}
      >
        <AlbumCover
          album={album}
          size={size}
          titleSize={titleSize}
          borderRadius={30}
        />
      </Pressable>
    );
  },
  (prev, next) =>
    prev.album.albumId === next.album.albumId &&
    prev.size === next.size &&
    prev.titleSize === next.titleSize,
);

export const AlbumsGrid: React.FC<AlbumsGridProps> = ({
  albums,
  isLoading = false,
  onAlbumPress,
}) => {
  const router = useRouter();

  // Prefetch album screens so navigation feels instant
  useEffect(() => {
    if (!albums || albums.length === 0) return;

    albums.forEach((album) => {
      router.prefetch({
        pathname: `/album/${album.albumId}`,
        params: { title: album.title },
      });
    });
  }, [albums, router]);

  const handleAlbumPress = useCallback(
    (album: Album) => {
      if (onAlbumPress) {
        onAlbumPress(album);
      } else {
        router.push({
          pathname: `/album/${album.albumId}`,
          params: { title: album.title },
        });
      }
    },
    [router, onAlbumPress],
  );

  if (isLoading) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  }

  if (!albums || albums.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="albums-outline" size={48} color="#ccc" />
        <Text style={styles.placeholderText}>No albums yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {albums.map((album) => (
        <AlbumCard
          key={album.albumId}
          album={album}
          onPress={() => handleAlbumPress(album)}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
  },
  albumCard: {
    width: ALBUM_CARD_SIZE,
  },
  albumCardPressed: {
    opacity: 0.8,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    backgroundColor: "#f5f5f5",
    marginHorizontal: GRID_PADDING,
    borderRadius: 12,
  },
  placeholderText: {
    fontSize: 14,
    color: "#999",
    marginTop: 12,
  },
});

export default AlbumsGrid;
