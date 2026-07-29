import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, RefreshControl } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Button, Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import {
  useSwipeableTabs,
  TOP_BAR_HEIGHT,
} from "../../../contexts/SwipeableTabsContext";
import { CreateBanner } from "@/features/create/components/CreateBanner";
import {
  GalleryCarousel,
  AlbumsGrid,
  AlbumSortControl,
  AlbumsSearchOverlay,
} from "../components";
import { AlbumCard } from "../components/AlbumsGrid";
import { useLiveDropAlbumIds } from "@/features/moments/hooks/useLiveDropAlbumIds";
import { ImageWarmup, type WarmupItem } from "@/components/ui/ImageWarmup";

// Cast to bypass type definition mismatch with the installed version
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AlbumsFlashList = FlashList as any;
import { useGetAlbumsQuery } from "../api/album.queries";
import { sortAlbums, useAlbumSortStore } from "../store/albumSortStore";
import { Album } from "../types/album.types";
import { theme } from "@/lib/theme";

export default function AlbumTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { scrollPosition, pageIndex } = useSwipeableTabs();
  // "My Photos" owns its own data through the shared library viewer session
  // (see GalleryCarousel) — local-first, so a capture still uploading shows
  // from its on-device file the instant the shutter fires.
  const {
    data: albums,
    isLoading: albumsLoading,
    isError: albumsError,
    isRefetching,
    refetch,
  } = useGetAlbumsQuery();

  // Client-side ordering (persisted choice). New array; the grid glides cards
  // to their new positions via reanimated layout animations.
  const sort = useAlbumSortStore((s) => s.sort);
  const sortedAlbums = useMemo(
    () => (albums ? sortAlbums(albums, sort) : albums),
    [albums, sort],
  );

  const [searchOpen, setSearchOpen] = useState(false);

  const handleViewAll = useCallback(() => {
    router.push("/photos");
  }, [router]);

  const handleViewAlbums = useCallback(() => {
    router.push("/album");
  }, [router]);

  const handleAddNewAlbum = useCallback(() => {
    router.push("/album/create");
  }, [router]);

  const openAlbum = useCallback(
    (album: Album) => {
      setSearchOpen(false);
      router.push({
        pathname: `/album/${album.albumId}`,
        params: { title: album.title },
      });
    },
    [router],
  );

  const contentFadeStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - pageIndex);
    const opacity = interpolate(distance, [0, 1], [1, 0], Extrapolation.CLAMP);

    const translateY = interpolate(
      distance,
      [0, 1],
      [0, -10],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  // Everything above the grid rides as the list header, so the whole tab
  // is ONE virtualized surface — the old ScrollView mounted every album
  // card (cover decode included) on first paint
  const listHeader = useMemo(
    () => (
      <View style={{ paddingTop: insets.top + TOP_BAR_HEIGHT + 20, gap: 20 }}>
        <Animated.View style={[styles.section, contentFadeStyle]}>
          <View style={styles.sectionHeader}>
            <Pressable onPress={handleViewAll} style={styles.viewAllButton}>
              <Text style={styles.sectionTitle}>My Photos</Text>
              <Ionicons name="chevron-forward" size={20} color="#000" />
            </Pressable>
          </View>
          <GalleryCarousel />
        </Animated.View>

        {/* Memo Create — collage & carousel builder */}
        <Animated.View style={contentFadeStyle}>
          <CreateBanner />
        </Animated.View>

        <Animated.View style={contentFadeStyle}>
          <View style={styles.sectionHeader}>
            <Pressable onPress={handleViewAlbums} style={styles.viewAllButton}>
              <Text style={styles.sectionTitle}>Albums</Text>
              <Ionicons name="chevron-forward" size={20} color="#000" />
            </Pressable>

            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setSearchOpen(true)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.searchIconButton,
                  pressed && styles.searchIconButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Search albums"
              >
                <Ionicons name="search" size={20} color="#111" />
              </Pressable>

              <Button
                onPress={handleAddNewAlbum}
                style={{
                  backgroundColor: theme.colors.primary,
                }}
                textColor={theme.colors.onPrimary}
              >
                + Add new
              </Button>
            </View>
          </View>

          <View style={styles.sortRow}>
            <AlbumSortControl />
          </View>
        </Animated.View>
      </View>
    ),
    [
      insets.top,
      contentFadeStyle,
      handleViewAll,
      handleViewAlbums,
      handleAddNewAlbum,
    ],
  );

  // One shared query for all cards (same as the old grid)
  const liveDropAlbumIds = useLiveDropAlbumIds();

  // Prefetch the first few album routes (capped + id-keyed — the old
  // grid prefetched EVERY album on every refetch)
  const prefetchSignature = useMemo(
    () =>
      (sortedAlbums ?? [])
        .slice(0, 6)
        .map((album) => album.albumId)
        .join(","),
    [sortedAlbums],
  );
  React.useEffect(() => {
    if (!sortedAlbums || sortedAlbums.length === 0) return;
    for (const album of sortedAlbums.slice(0, 6)) {
      router.prefetch({
        pathname: `/album/${album.albumId}`,
        params: { title: album.title },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetchSignature, router]);

  // Snapchat-style prefetch: the albums list already carries each album's
  // recent photo thumbnails — warm the top albums' grids onto disk so
  // opening one paints instantly instead of blur-upping over the network
  const warmupItems = useMemo<WarmupItem[]>(() => {
    const items: WarmupItem[] = [];
    for (const album of (sortedAlbums ?? []).slice(0, 4)) {
      for (const photo of (album.recentPhotos ?? []).slice(0, 6)) {
        const uri = photo.thumbnailUrl ?? (photo.mediaType === "video" ? null : photo.url);
        if (uri) items.push({ uri, bucket: "tile" });
      }
    }
    return items;
  }, [sortedAlbums]);

  const renderAlbum = useCallback(
    ({ item, index }: { item: Album; index: number }) => (
      <Animated.View
        style={[
          styles.cardSlot,
          index % 2 === 0 ? styles.cardSlotLeft : styles.cardSlotRight,
          contentFadeStyle,
        ]}
      >
        <AlbumCard
          album={item}
          onPress={openAlbum}
          hasLiveDrop={liveDropAlbumIds.has(item.albumId)}
        />
      </Animated.View>
    ),
    [openAlbum, contentFadeStyle, liveDropAlbumIds],
  );

  const keyExtractor = useCallback((item: Album) => item.albumId, []);

  // Empty/loading/error states render through the existing AlbumsGrid
  // branches (zero albums = zero rows, so it doubles as ListEmpty)
  const listEmpty = useMemo(
    () => (
      <AlbumsGrid
        albums={sortedAlbums}
        isLoading={albumsLoading}
        isError={albumsError}
        onRetry={refetch}
        onCreateAlbum={handleAddNewAlbum}
        onAlbumPress={openAlbum}
      />
    ),
    [
      sortedAlbums,
      albumsLoading,
      albumsError,
      refetch,
      handleAddNewAlbum,
      openAlbum,
    ],
  );

  return (
    <View style={styles.container}>
      <AlbumsFlashList
        data={sortedAlbums ?? []}
        renderItem={renderAlbum}
        keyExtractor={keyExtractor}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#888"
          />
        }
      />

      <AlbumsSearchOverlay
        visible={searchOpen}
        albums={albums}
        onClose={() => setSearchOpen(false)}
        onAlbumPress={openAlbum}
      />

      {/* Background disk warmup for the albums the user opens most */}
      <ImageWarmup items={warmupItems} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  // No horizontal padding here — the header sections pad themselves and
  // the carousel bleeds edge-to-edge; the grid cells pad per-column below
  scrollContent: {
    paddingBottom: 100,
  },
  // Column padding reproduces the old grid geometry exactly:
  // 20 outer gutters + a 12 gap → card width (SW − 52) / 2
  cardSlot: {
    paddingBottom: 20,
  },
  cardSlotLeft: {
    paddingLeft: 20,
    paddingRight: 6,
  },
  cardSlotRight: {
    paddingLeft: 6,
    paddingRight: 20,
  },
  section: {},
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  searchIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F1F3",
  },
  searchIconButtonPressed: {
    opacity: 0.6,
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
});
