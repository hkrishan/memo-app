/**
 * AlbumTabScreenB — the editorial "My albums" tab (albums-tab A/B,
 * "editorial" arm; AlbumTabScreen is the classic control).
 *
 * Display title + hairline structure instead of section cards: an ALL MY
 * PHOTOS strip with a MORE cell, the Memo Create pill, an ALBUMS header
 * with underline filter tabs (All / Shared / Just you), and 2-up covers
 * captioned "4 people · 2h ago". The "+ New" pill opens AddAlbumSheetB
 * rather than routing to the classic choice modal.
 *
 * Everything below the header (FlashList virtualization, route prefetch,
 * cover warmup, search overlay, pager fade) matches AlbumTabScreen so the
 * A/B compares layout, not performance.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Dimensions,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import {
  useSwipeableTabs,
  TOP_BAR_HEIGHT,
} from "../../../contexts/SwipeableTabsContext";
import { AlbumsGrid, AlbumSortControl, AlbumsSearchOverlay } from "../components";
import AddAlbumSheetB from "../components/AddAlbumSheetB";
import { AlbumCover } from "../components/AlbumCover";
import { useLiveDropAlbumIds } from "@/features/moments/hooks/useLiveDropAlbumIds";
import { ImageWarmup, type WarmupItem } from "@/components/ui/ImageWarmup";
import { CachedImage } from "@/components/ui/CachedImage";
import { useGetAlbumsQuery } from "../api/album.queries";
import { useMergedLibrary } from "@/features/photos/api/library.queries";
import { sortAlbums, useAlbumSortStore } from "../store/albumSortStore";
import { Album } from "../types/album.types";
import { color, font, radius, scriptType, type } from "@/lib/tokens";

// Cast to bypass type definition mismatch with the installed version
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AlbumsFlashList = FlashList as any;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Same geometry as the classic grid: 20 gutters + 12 gap
const CARD_SIZE = (SCREEN_WIDTH - 52) / 2;

// ALL MY PHOTOS strip: 4 thumbs + the MORE cell, hairline 2px gaps
const STRIP_CELLS = 5;
const STRIP_GAP = 2;
const STRIP_CELL =
  (SCREEN_WIDTH - 40 - STRIP_GAP * (STRIP_CELLS - 1)) / STRIP_CELLS;

type AlbumsFilter = "all" | "shared" | "solo";

/** "1 284" — thin-space thousands, like the mockup's editorial figures. */
const formatCount = (count: number): string =>
  String(count).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** "now" / "34m ago" / "2h ago" / "yesterday" / "3d ago" / "Jun 12" */
const timeAgo = (iso?: string | null): string | null => {
  if (!iso) return null;
  const stamp = new Date(iso).getTime();
  if (!Number.isFinite(stamp)) return null;
  const minutes = Math.floor((Date.now() - stamp) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(stamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

/** "4 people · 2h ago" / "Just you · yesterday" */
const cardMeta = (album: Album): string => {
  const memberCount = album.members?.length ?? 0;
  const who = memberCount > 1 ? `${memberCount} people` : "Just you";
  const when = timeAgo(album.lastActivityAt);
  return when ? `${who} · ${when}` : who;
};

const isShared = (album: Album): boolean => (album.members?.length ?? 0) > 1;

interface AlbumCardBProps {
  album: Album;
  onPress: (album: Album) => void;
  hasLiveDrop: boolean;
}

/**
 * Editorial album card: cover with the members facepile (AlbumCover),
 * a white NEW pill, the bare photo count, and a two-line caption.
 */
const AlbumCardB = React.memo<AlbumCardBProps>(
  ({ album, onPress, hasLiveDrop }) => {
    const handlePress = useCallback(() => onPress(album), [onPress, album]);

    const newCount = album.newPhotoCount ?? 0;
    const photoCount = album.photoCount ?? 0;

    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [pressed && styles.cardPressed]}
        accessibilityRole="button"
        accessibilityLabel={
          newCount > 0 ? `${album.title}, ${newCount} new photos` : album.title
        }
      >
        <View style={{ width: CARD_SIZE, height: CARD_SIZE }}>
          <AlbumCover album={album} size={CARD_SIZE} borderRadius={radius.lg} />
          {newCount > 0 && (
            <View style={styles.newPill} pointerEvents="none">
              <Text style={styles.newPillLabel}>
                {newCount > 99 ? "99+" : newCount} NEW
              </Text>
            </View>
          )}
          {hasLiveDrop && (
            <View style={styles.livePill} pointerEvents="none">
              <Ionicons name="flash" size={10} color={color.textPrimary} />
              <Text style={styles.newPillLabel}>LIVE</Text>
            </View>
          )}
          {photoCount > 0 && (
            <Text style={styles.countLabel} pointerEvents="none">
              {photoCount > 999 ? "999+" : photoCount}
            </Text>
          )}
        </View>
        <View style={styles.cardCaption}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {album.title}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {cardMeta(album)}
          </Text>
        </View>
      </Pressable>
    );
  },
);
AlbumCardB.displayName = "AlbumCardB";

export default function AlbumTabScreenB() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { scrollPosition, pageIndex } = useSwipeableTabs();

  const {
    data: albums,
    isLoading: albumsLoading,
    isError: albumsError,
    isRefetching,
    refetch,
  } = useGetAlbumsQuery();

  // Local-first library — the strip shows a capture the instant the
  // shutter fires, same as the classic tab's carousel
  const { photos: libraryPhotos } = useMergedLibrary();

  const sort = useAlbumSortStore((s) => s.sort);
  const sortedAlbums = useMemo(
    () => (albums ? sortAlbums(albums, sort) : albums),
    [albums, sort],
  );

  const [filter, setFilter] = useState<AlbumsFilter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  const counts = useMemo(() => {
    const all = sortedAlbums?.length ?? 0;
    const shared = (sortedAlbums ?? []).filter(isShared).length;
    return { all, shared, solo: all - shared };
  }, [sortedAlbums]);

  const filteredAlbums = useMemo(() => {
    if (!sortedAlbums || filter === "all") return sortedAlbums;
    return sortedAlbums.filter((album) =>
      filter === "shared" ? isShared(album) : !isShared(album),
    );
  }, [sortedAlbums, filter]);

  // The library is cursor-paginated with no total, so the figure is the
  // albums' summed photo counts — the same number the covers advertise
  const totalPhotos = useMemo(
    () =>
      (albums ?? []).reduce((sum, album) => sum + (album.photoCount ?? 0), 0),
    [albums],
  );

  const stripPhotos = useMemo(
    () => libraryPhotos.slice(0, STRIP_CELLS - 1),
    [libraryPhotos],
  );
  const moreCount = Math.max(totalPhotos - stripPhotos.length, 0);

  const handleViewAll = useCallback(() => {
    router.push("/photos");
  }, [router]);

  const handleOpenAddSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddSheetOpen(true);
  }, []);

  const handleSheetCreate = useCallback(() => {
    setAddSheetOpen(false);
    router.push("/album/create?mode=create");
  }, [router]);

  const handleSheetJoin = useCallback(() => {
    setAddSheetOpen(false);
    router.push("/album/create?mode=join");
  }, [router]);

  const handleCreateFromEmpty = useCallback(() => {
    router.push("/album/create?mode=create");
  }, [router]);

  const handleOpenCreateStudio = useCallback(() => {
    Haptics.selectionAsync();
    router.push("/create");
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

  const handleSelectFilter = useCallback((next: AlbumsFilter) => {
    Haptics.selectionAsync();
    setFilter(next);
  }, []);

  const contentFadeStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - pageIndex);
    const opacity = interpolate(distance, [0, 1], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(
      distance,
      [0, 1],
      [0, -10],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY }] };
  });

  const filterTabs = useMemo(
    () =>
      [
        { key: "all" as const, label: "All", count: counts.all },
        { key: "shared" as const, label: "Shared", count: counts.shared },
        { key: "solo" as const, label: "Just you", count: counts.solo },
      ] satisfies { key: AlbumsFilter; label: string; count: number }[],
    [counts],
  );

  const listHeader = useMemo(
    () => (
      <View style={{ paddingTop: insets.top + TOP_BAR_HEIGHT + 16 }}>
        <Animated.View style={contentFadeStyle}>
          {/* Display title + bare search */}
          <View style={styles.titleRow}>
            <Text style={styles.pageTitle}>My albums</Text>
            <Pressable
              onPress={() => setSearchOpen(true)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.searchButton,
                pressed && styles.pressedDim,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Search albums"
            >
              <Ionicons name="search" size={18} color={color.textPrimary} />
            </Pressable>
          </View>

          {/* ALL MY PHOTOS — overline header + thumb strip + MORE cell */}
          <Pressable
            onPress={handleViewAll}
            style={({ pressed }) => [
              styles.photosHeader,
              pressed && styles.pressedDim,
            ]}
            accessibilityRole="button"
            accessibilityLabel="All my photos"
          >
            <Text style={styles.overline}>All my photos</Text>
            {totalPhotos > 0 && (
              <Text style={styles.overlineCount}>
                {formatCount(totalPhotos)}
              </Text>
            )}
            <View style={styles.headerSpacer} />
            <Ionicons
              name="chevron-forward"
              size={16}
              color={color.textTertiary}
            />
          </Pressable>
          {stripPhotos.length > 0 && (
            <Pressable
              onPress={handleViewAll}
              style={({ pressed }) => [
                styles.photoStrip,
                pressed && styles.pressedDim,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open all my photos"
            >
              {stripPhotos.map((photo) => (
                <View key={photo.photoId} style={styles.stripCell}>
                  {photo.thumbnailUrl || photo.url ? (
                    <CachedImage
                      uri={(photo.thumbnailUrl || photo.url)!}
                      style={styles.stripImage}
                      showPlaceholder={false}
                    />
                  ) : (
                    <View style={styles.stripEmpty} />
                  )}
                </View>
              ))}
              {moreCount > 0 && (
                <View style={[styles.stripCell, styles.stripMoreCell]}>
                  <Text style={styles.stripMoreCount}>
                    {formatCount(moreCount)}
                  </Text>
                  <Text style={styles.stripMoreLabel}>More</Text>
                </View>
              )}
            </Pressable>
          )}

          {/* Memo Create — black pill entry */}
          <Pressable
            onPress={handleOpenCreateStudio}
            style={({ pressed }) => [
              styles.createPill,
              pressed && styles.pressedDim,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Make a collage in Memo Create"
          >
            <Ionicons name="sparkles" size={16} color={color.textInverse} />
            <Text style={styles.createPillLabel}>
              Make a collage in Memo{" "}
              <Text style={styles.createPillScript}>Create</Text>
            </Text>
            <View style={styles.headerSpacer} />
            <Ionicons
              name="chevron-forward"
              size={16}
              color="rgba(255, 255, 255, 0.55)"
            />
          </Pressable>

          {/* ALBUMS — overline + sort + New */}
          <View style={styles.albumsHeader}>
            <Text style={styles.overline}>Albums</Text>
            <View style={styles.albumsHeaderActions}>
              <AlbumSortControl />
              <Pressable
                onPress={handleOpenAddSheet}
                style={({ pressed }) => [
                  styles.newPillButton,
                  pressed && styles.pressedDim,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Add an album"
              >
                <Ionicons name="add" size={16} color={color.textInverse} />
                <Text style={styles.newPillButtonLabel}>New</Text>
              </Pressable>
            </View>
          </View>

          {/* Underline filter tabs */}
          <View style={styles.filterRow}>
            {filterTabs.map((tab) => {
              const active = tab.key === filter;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => handleSelectFilter(tab.key)}
                  style={[styles.filterTab, active && styles.filterTabActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${tab.label}, ${tab.count} albums`}
                >
                  <Text
                    style={[
                      styles.filterLabel,
                      active && styles.filterLabelActive,
                    ]}
                  >
                    {tab.label}{" "}
                    <Text
                      style={[
                        styles.filterCount,
                        active && styles.filterCountActive,
                      ]}
                    >
                      {tab.count}
                    </Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    ),
    [
      insets.top,
      contentFadeStyle,
      handleViewAll,
      handleOpenCreateStudio,
      handleOpenAddSheet,
      handleSelectFilter,
      filterTabs,
      filter,
      stripPhotos,
      totalPhotos,
      moreCount,
    ],
  );

  const liveDropAlbumIds = useLiveDropAlbumIds();

  // Prefetch the first few album routes (capped + id-keyed, same as classic)
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

  const warmupItems = useMemo<WarmupItem[]>(() => {
    const items: WarmupItem[] = [];
    for (const album of (sortedAlbums ?? []).slice(0, 4)) {
      for (const photo of (album.recentPhotos ?? []).slice(0, 6)) {
        const uri =
          photo.thumbnailUrl ?? (photo.mediaType === "video" ? null : photo.url);
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
        <AlbumCardB
          album={item}
          onPress={openAlbum}
          hasLiveDrop={liveDropAlbumIds.has(item.albumId)}
        />
      </Animated.View>
    ),
    [openAlbum, contentFadeStyle, liveDropAlbumIds],
  );

  const keyExtractor = useCallback((item: Album) => item.albumId, []);

  // No albums at all → the shared loading/error/empty branches. A filter
  // that merely empties out gets a one-line nudge instead.
  const listEmpty = useMemo(() => {
    if (filter !== "all" && (sortedAlbums?.length ?? 0) > 0) {
      return (
        <Text style={styles.filterEmpty}>
          {filter === "shared"
            ? "No shared albums yet — invite someone."
            : "No solo albums yet."}
        </Text>
      );
    }
    return (
      <AlbumsGrid
        albums={sortedAlbums}
        isLoading={albumsLoading}
        isError={albumsError}
        onRetry={refetch}
        onCreateAlbum={handleCreateFromEmpty}
        onAlbumPress={openAlbum}
      />
    );
  }, [
    filter,
    sortedAlbums,
    albumsLoading,
    albumsError,
    refetch,
    handleCreateFromEmpty,
    openAlbum,
  ]);

  return (
    <View style={styles.container}>
      <AlbumsFlashList
        data={filteredAlbums ?? []}
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

      <AddAlbumSheetB
        visible={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        onCreate={handleSheetCreate}
        onJoin={handleSheetJoin}
      />

      {/* Background disk warmup for the albums the user opens most */}
      <ImageWarmup items={warmupItems} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.bg,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  pressedDim: {
    opacity: 0.7,
  },
  headerSpacer: {
    flex: 1,
  },
  // ---- Header ----
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  pageTitle: {
    ...type.display,
    fontSize: 28,
    color: color.textPrimary,
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  photosHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  overline: {
    ...type.overline,
    color: color.textSecondary,
  },
  overlineCount: {
    ...type.overline,
    color: color.textTertiary,
    fontVariant: ["tabular-nums"],
  },
  photoStrip: {
    flexDirection: "row",
    gap: STRIP_GAP,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  stripCell: {
    width: STRIP_CELL,
    // The app's universal portrait tile ratio (matches the full-view grids)
    height: STRIP_CELL * 1.4,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: color.surface1,
  },
  stripImage: {
    width: "100%",
    height: "100%",
  },
  stripEmpty: {
    flex: 1,
    backgroundColor: color.surface2,
  },
  stripMoreCell: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  stripMoreCount: {
    fontSize: 15,
    ...font.bold,
    color: color.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  stripMoreLabel: {
    fontSize: 9,
    ...font.semibold,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: color.textTertiary,
  },
  createPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 24,
    paddingHorizontal: 18,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: color.textPrimary,
  },
  createPillLabel: {
    fontSize: 15,
    ...font.semibold,
    color: color.textInverse,
  },
  createPillScript: {
    ...scriptType(15),
    color: color.textInverse,
  },
  albumsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  albumsHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  newPillButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 34,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: radius.full,
    backgroundColor: color.textPrimary,
  },
  newPillButtonLabel: {
    fontSize: 14,
    ...font.semibold,
    color: color.textInverse,
  },
  filterRow: {
    flexDirection: "row",
    gap: 22,
    paddingHorizontal: 20,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  filterTab: {
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -StyleSheet.hairlineWidth,
  },
  filterTabActive: {
    borderBottomColor: color.textPrimary,
  },
  filterLabel: {
    fontSize: 15,
    ...font.medium,
    color: color.textSecondary,
  },
  filterLabelActive: {
    ...font.semibold,
    color: color.textPrimary,
  },
  filterCount: {
    fontSize: 13,
    ...font.regular,
    color: color.textTertiary,
    fontVariant: ["tabular-nums"],
  },
  filterCountActive: {
    color: color.textSecondary,
  },
  filterEmpty: {
    ...type.bodySm,
    color: color.textSecondary,
    textAlign: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  // ---- Grid ----
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
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  newPill: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: color.bg,
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  newPillLabel: {
    fontSize: 10,
    ...font.bold,
    letterSpacing: 0.4,
    color: color.textPrimary,
  },
  livePill: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: color.bg,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countLabel: {
    position: "absolute",
    bottom: 10,
    right: 12,
    fontSize: 14,
    ...font.semibold,
    color: color.textInverse,
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0, 0, 0, 0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardCaption: {
    paddingTop: 8,
    paddingHorizontal: 2,
    gap: 1,
  },
  cardTitle: {
    fontSize: 15,
    ...font.semibold,
    color: color.textPrimary,
  },
  cardMeta: {
    fontSize: 13,
    ...font.regular,
    color: color.textTertiary,
  },
});
