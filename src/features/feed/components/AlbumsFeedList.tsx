/**
 * The Albums timeline: an infinite, pull-to-refresh list of cross-album
 * updates (photos added, members joined, moments started) from
 * GET /feed/albums.
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
import { FlashList } from "@shopify/flash-list";
import { useAlbumsFeedQuery } from "../api/feed.queries";
import type { AlbumFeedUpdate } from "../types/feed.types";
import AlbumUpdateCard from "./AlbumUpdateCard";

// Cast FlashList to bypass type definition mismatch with installed version
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const UpdatesFlashList = FlashList as any;

/** topInset: clears the blurred top bar + floating pill; content scrolls
 *  under both (the parent screen computes it from the safe-area inset). */
const AlbumsFeedList = memo<{ topInset: number }>(({ topInset }) => {
  const {
    data,
    refetch,
    isRefetching,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAlbumsFeedQuery();

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const renderItem = useCallback(
    ({ item }: { item: AlbumFeedUpdate }) => <AlbumUpdateCard update={item} />,
    [],
  );

  const keyExtractor = useCallback((item: AlbumFeedUpdate) => item.id, []);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
          <Ionicons name="albums-outline" size={28} color="#9a9aa0" />
        </View>
        <Text style={styles.emptyTitle}>All caught up</Text>
        <Text style={styles.emptySubtitle}>
          Updates from your albums show up here
        </Text>
      </View>
    );
  }, [isLoading]);

  const listFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color="#77777c" />
      </View>
    );
  }, [isFetchingNextPage]);

  const contentStyle = useMemo(
    () => ({ paddingTop: topInset, paddingBottom: 100 }),
    [topInset],
  );

  return (
    <UpdatesFlashList
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={contentStyle}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={listFooter}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          // isRefetching also flips during fetchNextPage; only show the
          // pull spinner for genuine top refreshes
          refreshing={isRefetching && !isFetchingNextPage}
          onRefresh={refetch}
          tintColor="#888"
        />
      }
    />
  );
});

const styles = StyleSheet.create({
  footer: {
    paddingVertical: 24,
    alignItems: "center",
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

export default AlbumsFeedList;
