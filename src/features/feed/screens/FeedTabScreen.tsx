/**
 * The Feed tab: two switchable views under one top bar — Pages (posts from
 * public pages you follow) and Albums (a cross-album updates timeline).
 * The segmented control drives a shared progress value; both lists stay
 * mounted (queries cached, scroll positions kept) and cross-fade/slide.
 */

import React, { memo, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import {
  TOP_BAR_HEIGHT,
  usePageFadeStyle,
} from "../../../contexts/SwipeableTabsContext";
import { useGetFeedQuery } from "../api/feed.queries";
import FeedPost from "../components/FeedPost";
import AlbumsFeedList from "../components/AlbumsFeedList";
import FeedModeSwitch from "../components/FeedModeSwitch";
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

const ESTIMATED_ITEM_HEIGHT = 420;

/** How far the inactive view slides while cross-fading (px) */
const VIEW_SLIDE = 24;

// ---------------------------------------------------------------------------
// Pages view — the original posts feed, data logic untouched
// ---------------------------------------------------------------------------

const PagesFeedList = memo(() => {
  const { data, refetch, isRefetching, isLoading } = useGetFeedQuery();
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
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="sparkles-outline" size={28} color="#9a9aa0" />
        </View>
        <Text style={styles.emptyTitle}>Nothing here yet</Text>
        <Text style={styles.emptySubtitle}>
          Posts from pages you follow show up here
        </Text>
      </View>
    );
  }, [isLoading]);

  return (
    <FeedFlashList
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      estimatedItemSize={ESTIMATED_ITEM_HEIGHT}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={listEmpty}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor="#fff"
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

  const mode = useFeedModeStore((s) => s.mode);
  const setMode = useFeedModeStore((s) => s.setMode);

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

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + TOP_BAR_HEIGHT }]}
    >
      <Animated.View style={[contentFadeStyle, styles.content]}>
        <View style={styles.switchRow}>
          <FeedModeSwitch
            mode={mode}
            onChange={setMode}
            progress={modeProgress}
          />
        </View>

        {/* Both views stay mounted: queries keep their cache and each list
            keeps its scroll position across switches */}
        <View style={styles.views}>
          <Animated.View
            style={[StyleSheet.absoluteFill, pagesViewStyle]}
            pointerEvents={mode === "pages" ? "auto" : "none"}
          >
            <PagesFeedList />
          </Animated.View>
          <Animated.View
            style={[StyleSheet.absoluteFill, albumsViewStyle]}
            pointerEvents={mode === "albums" ? "auto" : "none"}
          >
            <AlbumsFeedList />
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  content: {
    flex: 1,
  },
  switchRow: {
    paddingTop: 10,
    paddingBottom: 4,
  },
  views: {
    flex: 1,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 100,
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
    backgroundColor: "#232325",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 6,
  },
  emptySubtitle: {
    color: "#9a9aa0",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
