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
  Pressable,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import {
  TOP_BAR_HEIGHT,
  usePageFadeStyle,
} from "../../../contexts/SwipeableTabsContext";
import { useGetFeedQuery } from "../api/feed.queries";
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

const ESTIMATED_ITEM_HEIGHT = 420;

/** How far the inactive view slides while cross-fading (px) */
const VIEW_SLIDE = 24;


// ---------------------------------------------------------------------------
// Pages view — the original posts feed, data logic untouched
// ---------------------------------------------------------------------------

const PagesFeedList = memo<{ topInset: number }>(({ topInset }) => {
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
          refreshing={isRefetching}
          onRefresh={refetch}
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
  // under the floating pill row that sits just below it
  const barBottom = insets.top + TOP_BAR_HEIGHT;
  const listTopInset = barBottom + SWITCH_ROW_HEIGHT + 8;

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

        {/* Floating mode switch + search — overlays the lists, which
            scroll underneath (they reserve SWITCH_ROW_HEIGHT at the top) */}
        <View
          style={[styles.switchRow, { top: barBottom }]}
          pointerEvents="box-none"
        >
          <View style={styles.switchSpacer} pointerEvents="none" />
          <FeedModeSwitch
            mode={mode}
            onChange={setMode}
            progress={modeProgress}
          />
          <View style={styles.switchSpacer} pointerEvents="box-none">
            <Pressable
              onPress={handleOpenSearch}
              hitSlop={8}
              style={styles.searchButton}
              accessibilityRole="button"
              accessibilityLabel="Search pages"
            >
              <BlurView
                intensity={25}
                tint="light"
                style={styles.frostedFill}
              />
              <Ionicons name="search" size={20} color="#111" />
            </Pressable>
          </View>
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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  switchSpacer: {
    flex: 1,
    justifyContent: "center",
  },
  searchButton: {
    alignSelf: "flex-end",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.06)",
  },
  frostedFill: {
    ...StyleSheet.absoluteFillObject,
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
    fontWeight: "600",
    marginBottom: 6,
  },
  emptySubtitle: {
    color: "#8e8e93",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
