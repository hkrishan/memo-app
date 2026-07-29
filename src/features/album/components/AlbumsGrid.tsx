/**
 * AlbumsGrid Component
 * Displays albums in a grid layout using AlbumCover cards, each captioned
 * with its title (and who's in it) below the cover.
 */

import React, { useCallback, useEffect, useMemo, memo } from "react";
import { View, StyleSheet, Pressable, Dimensions } from "react-native";
import { Text, ActivityIndicator } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, {
  ZoomIn,
  LinearTransition,
} from "react-native-reanimated";
import { useLiveDropAlbumIds } from "@/features/moments/hooks/useLiveDropAlbumIds";
import { Album } from "../types/album.types";
import { AlbumCover } from "./AlbumCover";

/** Cards glide to new positions when the sort order changes. */
const CARD_LAYOUT = LinearTransition.springify().damping(18).stiffness(160);

/** "NEW +5", capped at 99+ so the pill stays compact over any cover. */
const newBadgeLabel = (count: number): string =>
  `NEW +${count > 99 ? "99+" : count}`;

/** Total picture count over the cover, capped like the NEW pill. */
const countBadgeLabel = (count: number): string =>
  count > 999 ? "999+" : `${count}`;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
/** How many album routes to pre-mount for instant navigation. */
const PREFETCH_COUNT = 6;
const GRID_GAP = 12;
const GRID_ROW_GAP = 20;
const GRID_PADDING = 20;
const ALBUM_CARD_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

interface AlbumsGridProps {
  albums: Album[] | undefined;
  isLoading?: boolean;
  onAlbumPress?: (album: Album) => void;
}

interface AlbumCardProps {
  album: Album;
  onPress?: (album: Album) => void;
  size?: number;
  /** True while the album has an open drop the user hasn't posted to */
  hasLiveDrop?: boolean;
}

/** "Just you" / "n members" — matches the avatars overlaid on the cover. */
const membersLabel = (album: Album): string => {
  const count = album.members?.length ?? 0;
  if (count <= 1) return "Just you";
  return `${count} members`;
};

export const AlbumCard: React.FC<AlbumCardProps> = memo(
  ({ album, onPress, size = ALBUM_CARD_SIZE, hasLiveDrop = false }) => {
    const handlePress = useCallback(() => {
      onPress?.(album);
    }, [onPress, album]);

    const newCount = album.newPhotoCount ?? 0;
    const photoCount = album.photoCount ?? 0;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.albumCard,
          { width: size },
          pressed && onPress != null && styles.albumCardPressed,
        ]}
        onPress={onPress ? handlePress : undefined}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={
          newCount > 0
            ? `${album.title}, ${newCount} new photos`
            : album.title
        }
      >
        <View style={{ width: size, height: size }}>
          <AlbumCover album={album} size={size} borderRadius={24} />
          {photoCount > 0 && (
            <View style={styles.countBadge} pointerEvents="none">
              <Ionicons name="images" size={10} color="#fff" />
              <Text style={styles.countBadgeLabel}>
                {countBadgeLabel(photoCount)}
              </Text>
            </View>
          )}
        </View>
        {newCount > 0 && (
          <Animated.View
            key={newCount}
            entering={ZoomIn.springify().damping(12).stiffness(200)}
            style={styles.newBadge}
            pointerEvents="none"
          >
            <Text style={styles.newBadgeLabel}>{newBadgeLabel(newCount)}</Text>
          </Animated.View>
        )}
        {hasLiveDrop && (
          <View style={styles.liveBadge} pointerEvents="none">
            <Ionicons name="flash" size={11} color="#fff" />
            <Text style={styles.liveBadgeLabel}>LIVE</Text>
          </View>
        )}
        <View style={styles.caption}>
          <Text style={styles.title} numberOfLines={1}>
            {album.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {membersLabel(album)}
          </Text>
        </View>
      </Pressable>
    );
  },
);
AlbumCard.displayName = "AlbumCard";

export const AlbumsGrid: React.FC<AlbumsGridProps> = ({
  albums,
  isLoading = false,
  onAlbumPress,
}) => {
  const router = useRouter();
  // One shared query for the whole grid — cards get a plain boolean
  const liveDropAlbumIds = useLiveDropAlbumIds();

  // Prefetch the first few album screens so the most likely navigations
  // feel instant. Capped and keyed on the id signature: prefetching EVERY
  // album re-ran on each refetch (fresh array identity) and mounted one
  // offscreen AlbumScreen — with its own queries — per album.
  const prefetchSignature = useMemo(
    () =>
      (albums ?? [])
        .slice(0, PREFETCH_COUNT)
        .map((album) => album.albumId)
        .join(","),
    [albums],
  );
  useEffect(() => {
    if (!albums || albums.length === 0) return;
    for (const album of albums.slice(0, PREFETCH_COUNT)) {
      router.prefetch({
        pathname: `/album/${album.albumId}`,
        params: { title: album.title },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetchSignature, router]);

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
        <Animated.View
          key={album.albumId}
          layout={CARD_LAYOUT}
          style={styles.cardSlot}
        >
          <AlbumCard
            album={album}
            onPress={handleAlbumPress}
            hasLiveDrop={liveDropAlbumIds.has(album.albumId)}
          />
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: GRID_PADDING,
    columnGap: GRID_GAP,
    rowGap: GRID_ROW_GAP,
  },
  cardSlot: {
    width: ALBUM_CARD_SIZE,
  },
  albumCard: {
    width: ALBUM_CARD_SIZE,
  },
  albumCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  newBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "#FF3B30",
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  newBadgeLabel: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  countBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 11,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
  },
  countBadgeLabel: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  liveBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FF3B30",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveBadgeLabel: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  caption: {
    paddingTop: 8,
    paddingHorizontal: 4,
    gap: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
  },
  meta: {
    fontSize: 13,
    color: "#8E8E93",
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
