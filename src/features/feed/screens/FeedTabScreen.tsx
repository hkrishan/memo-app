import React, { useCallback } from "react";
import { View, StyleSheet, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import {
  TOP_BAR_HEIGHT,
  useSwipeableTabs,
} from "../../../contexts/SwipeableTabsContext";
import { useGetFeedQuery } from "../api/feed.queries";
import FeedPost from "../components/FeedPost";
import AlbumActivityCard from "../components/AlbumActivityCard";
import type { FeedItem } from "../types/feed.types";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";

// Cast FlashList to bypass type definition mismatch with installed version
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FeedFlashList = FlashList as any;

const ESTIMATED_ITEM_HEIGHT = 400;

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { scrollPosition, pageIndex } = useSwipeableTabs();

  const contentFadeStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - pageIndex);
    const opacity = interpolate(distance, [0, 1], [1, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  const { data, refetch, isRefetching } = useGetFeedQuery();
  const items = data?.items ?? [];

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      if (item.type === "page_post") {
        return <FeedPost item={item} />;
      }
      return <AlbumActivityCard item={item} />;
    },
    [],
  );

  const keyExtractor = useCallback((item: FeedItem) => {
    if (item.type === "page_post") return `post-${item.post.postId}`;
    return `activity-${item.activity.activityId}`;
  }, []);

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + TOP_BAR_HEIGHT }]}
    >
      <Animated.View style={[contentFadeStyle, styles.listContainer]}>
        <FeedFlashList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={ESTIMATED_ITEM_HEIGHT}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#fff"
            />
          }
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
});
