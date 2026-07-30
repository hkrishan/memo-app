/**
 * The Feed tab: two switchable views under one top bar — Pages (posts from
 * public pages you follow) and Albums (a cross-album updates timeline).
 * The segmented control drives a shared progress value; both lists stay
 * mounted (queries cached, scroll positions kept) and cross-fade/slide.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Pressable,
} from "react-native";
import { BlurView } from "expo-blur";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import {
  TOP_BAR_HEIGHT,
  usePageFadeStyle,
} from "../../../contexts/SwipeableTabsContext";
import { useAlbumsFeedQuery, useGetFeedQuery } from "../api/feed.queries";
import { groupAlbumsFeed } from "../utils/albumGroups";
import { color } from "@/lib/tokens";
import FeedPost from "../components/FeedPost";
import AlbumsFeedList from "../components/AlbumsFeedList";
import FeedModeSwitch, {
  SWITCH_ROW_HEIGHT,
} from "../components/FeedModeSwitch";
import { useFeedModeStore } from "../store/feedModeStore";
import type { PagePostFeedItem } from "../types/feed.types";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

// Cast FlashList to bypass type definition mismatch with installed version
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FeedFlashList = FlashList as any;

// Header (~46) + media capped at 0.55×screen (~460) + actions + caption +
// 56 section margin — underestimating made FlashList blank on fast scroll
const ESTIMATED_ITEM_HEIGHT = 640;

/** How far the inactive view slides while cross-fading (px) */
const VIEW_SLIDE = 24;


// ---------------------------------------------------------------------------
// Pages view — the original posts feed, data logic untouched
// ---------------------------------------------------------------------------

const PagesFeedList = memo<{ topInset: number }>(({ topInset }) => {
  const router = useRouter();
  const { data, refetch, isLoading, isError } = useGetFeedQuery();

  // Pull-to-refresh only. Binding the RefreshControl to isRefetching made
  // the whole list shift down with a spinner whenever a like/comment
  // mutation revalidated the feed in the background.
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setPullRefreshing(true);
    refetch().finally(() => setPullRefreshing(false));
  }, [refetch]);
  // The /feed response still mixes in album_activity items; those belong to
  // the Albums view now — Pages shows page posts only
  const items = useMemo(
    () =>
      (data?.items ?? []).filter(
        (item): item is PagePostFeedItem => item.type === "page_post",
      ),
    [data?.items],
  );

  const renderItem = useCallback(
    ({ item }: { item: PagePostFeedItem }) => <FeedPost item={item} />,
    [],
  );

  const keyExtractor = useCallback(
    (item: PagePostFeedItem) => `post-${item.post.postId}`,
    [],
  );

  const listEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color="#77777c" />
        </View>
      );
    }
    if (isError) {
      // A failed fetch must never read as "you follow nothing"
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cloud-offline-outline" size={28} color="#8e8e93" />
          </View>
          <Text style={styles.emptyTitle}>Couldn't load the feed</Text>
          <Text style={styles.emptySubtitle}>
            Check your connection and try again
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={({ pressed }) => [
              styles.emptyCta,
              pressed && styles.emptyCtaPressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.emptyCtaLabel}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="sparkles-outline" size={28} color="#9a9aa0" />
        </View>
        <Text style={styles.emptyTitle}>Nothing here yet</Text>
        <Text style={styles.emptySubtitle}>
          Posts from pages you follow show up here
        </Text>
        <Pressable
          onPress={() => router.push("/search")}
          style={({ pressed }) => [
            styles.emptyCta,
            pressed && styles.emptyCtaPressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.emptyCtaLabel}>Find pages</Text>
        </Pressable>
      </View>
    );
  }, [isLoading, isError, refetch, router]);

  const contentStyle = useMemo(
    () => ({ paddingTop: topInset, paddingBottom: 100 }),
    [topInset],
  );

  return (
    <FeedFlashList
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      estimatedItemSize={ESTIMATED_ITEM_HEIGHT}
      contentContainerStyle={contentStyle}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={listEmpty}
      refreshControl={
        <RefreshControl
          refreshing={pullRefreshing}
          onRefresh={handleRefresh}
          tintColor="#888"
        />
      }
    />
  );
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const contentFadeStyle = usePageFadeStyle();
  const router = useRouter();
  const handleOpenSearch = useCallback(() => router.push("/search"), [router]);

  const mode = useFeedModeStore((s) => s.mode);
  const setMode = useFeedModeStore((s) => s.setMode);

  // Albums-with-new-photos count for the tab badge. AlbumsFeedList (always
  // mounted below) owns this query; subscribing here shares its cache — no
  // extra fetch.
  const { data: albumsData } = useAlbumsFeedQuery();
  const albumsBadge = useMemo(() => {
    const items = albumsData?.pages.flatMap((page) => page.items) ?? [];
    return groupAlbumsFeed(items).groups.length;
  }, [albumsData]);

  // 0 = pages, 1 = albums; animated by the segmented control
  const modeProgress = useSharedValue(mode === "albums" ? 1 : 0);

  const pagesViewStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      modeProgress.value,
      [0, 1],
      [1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [{ translateX: -VIEW_SLIDE * modeProgress.value }],
  }));

  const albumsViewStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      modeProgress.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [{ translateX: VIEW_SLIDE * (1 - modeProgress.value) }],
  }));

  // Content scrolls under the blurred top bar (like the Albums tab) and
  // under the frosted tabs row just below it; the extra 16 keeps the
  // first post from resting flush against the tabs
  const barBottom = insets.top + TOP_BAR_HEIGHT;
  const listTopInset = barBottom + SWITCH_ROW_HEIGHT + 16;

  return (
    <View style={styles.container}>
      <Animated.View style={[contentFadeStyle, styles.content]}>
        {/* Both views stay mounted: queries keep their cache and each list
            keeps its scroll position across switches */}
        <View style={styles.views}>
          <Animated.View
            style={[StyleSheet.absoluteFill, pagesViewStyle]}
            pointerEvents={mode === "pages" ? "auto" : "none"}
          >
            <PagesFeedList topInset={listTopInset} />
          </Animated.View>
          <Animated.View
            style={[StyleSheet.absoluteFill, albumsViewStyle]}
            pointerEvents={mode === "albums" ? "auto" : "none"}
          >
            <AlbumsFeedList topInset={listTopInset} />
          </Animated.View>
        </View>

        {/* Tabs row — same frosted recipe as the top bar above it (iOS
            blur + white tint; Android is tint-only, like the bar); the
            lists scroll underneath it */}
        <View style={[styles.switchRow, { top: barBottom }]}>
          {Platform.OS === "ios" && (
            <BlurView
              intensity={20}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={styles.switchRowTint} pointerEvents="none" />
          <FeedModeSwitch
            mode={mode}
            onChange={setMode}
            progress={modeProgress}
            albumsBadge={albumsBadge}
          />
          <Pressable
            onPress={handleOpenSearch}
            hitSlop={8}
            style={({ pressed }) => [
              styles.searchButton,
              pressed && styles.searchButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Search pages"
          >
            <Ionicons name="search" size={21} color={color.textPrimary} />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
  },
  switchRow: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  // Matches the top bar's white tint over its blur layer
  switchRowTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
  },
  searchButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButtonPressed: {
    opacity: 0.5,
  },
  views: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 140,
    paddingHorizontal: 48,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F1F1F3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#111",
    fontSize: 17,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    marginBottom: 6,
  },
  emptySubtitle: {
    color: "#8e8e93",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  emptyCta: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#111",
  },
  emptyCtaPressed: {
    opacity: 0.7,
  },
  emptyCtaLabel: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
});
