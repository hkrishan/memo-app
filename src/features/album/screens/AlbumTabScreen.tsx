import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
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
import {
  GalleryCarousel,
  AlbumsGrid,
  AlbumSortControl,
  AlbumsSearchOverlay,
} from "../components";
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
  const { data: albums, isLoading: albumsLoading } = useGetAlbumsQuery();

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

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

          <Animated.View style={[styles.section, contentFadeStyle]}>
            <View style={styles.sectionHeader}>
              <Pressable
                onPress={handleViewAlbums}
                style={styles.viewAllButton}
              >
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

            <AlbumsGrid
              albums={sortedAlbums}
              isLoading={albumsLoading}
              onAlbumPress={openAlbum}
            />
          </Animated.View>
        </View>
      </ScrollView>

      <AlbumsSearchOverlay
        visible={searchOpen}
        albums={albums}
        onClose={() => setSearchOpen(false)}
        onAlbumPress={openAlbum}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    paddingBottom: 100,
    flexGrow: 1,
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
