/**
 * The Albums view: an editorial digest of cross-album updates from
 * GET /feed/albums. Photo activity is grouped per album — an "N albums
 * have new photos" headline (serif-italic accent), the freshest album as
 * a hero section, the rest as compact strips — followed by the remaining
 * updates (members joined, moments started) as quiet hairline rows.
 * Infinite scroll and pull-to-refresh as before.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { color, font, scriptType } from "@/lib/tokens";
import { useAlbumsFeedQuery } from "../api/feed.queries";
import type { AlbumFeedUpdate } from "../types/feed.types";
import {
  groupAlbumsFeed,
  type AlbumPhotoGroup,
  type OtherAlbumUpdate,
} from "../utils/albumGroups";
import { AlbumGroupCompact, AlbumGroupHero } from "./AlbumGroupSection";
import AlbumUpdateCard from "./AlbumUpdateCard";
import { H_PADDING } from "./FeedCard";

// Cast FlashList to bypass type definition mismatch with installed version
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const UpdatesFlashList = FlashList as any;

type Row =
  | { kind: "headline"; count: number }
  | { kind: "hero"; group: AlbumPhotoGroup }
  | { kind: "compact"; group: AlbumPhotoGroup }
  | { kind: "update"; update: OtherAlbumUpdate };

const Headline = memo<{ count: number }>(({ count }) => (
  <Text style={styles.headline}>
    <Text style={styles.headlineStrong}>
      {count} {count === 1 ? "album" : "albums"}
    </Text>
    <Text style={styles.headlineAccent}>
      {" "}
      {count === 1 ? "has" : "have"} new photos
    </Text>
  </Text>
));

/** topInset: clears the blurred top bar + tabs row; content scrolls
 *  under both (the parent screen computes it from the safe-area inset). */
const AlbumsFeedList = memo<{ topInset: number }>(({ topInset }) => {
  const {
    data,
    refetch,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAlbumsFeedQuery();

  // Pull-to-refresh only — background revalidations (mutations elsewhere
  // invalidating this query) must not inset the list with a spinner
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setPullRefreshing(true);
    refetch().finally(() => setPullRefreshing(false));
  }, [refetch]);

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const rows = useMemo<Row[]>(() => {
    const { groups, others } = groupAlbumsFeed(items);
    const built: Row[] = [];
    if (groups.length > 0) {
      built.push({ kind: "headline", count: groups.length });
      built.push({ kind: "hero", group: groups[0] });
      for (const group of groups.slice(1)) {
        built.push({ kind: "compact", group });
      }
    }
    for (const update of others) {
      built.push({ kind: "update", update });
    }
    return built;
  }, [items]);

  const renderItem = useCallback(({ item }: { item: Row }) => {
    switch (item.kind) {
      case "headline":
        return <Headline count={item.count} />;
      case "hero":
        return <AlbumGroupHero group={item.group} />;
      case "compact":
        return <AlbumGroupCompact group={item.group} />;
      case "update":
        return <AlbumUpdateCard update={item.update} />;
    }
  }, []);

  const keyExtractor = useCallback((item: Row) => {
    switch (item.kind) {
      case "headline":
        return "headline";
      case "hero":
      case "compact":
        return `album-${item.group.albumId}`;
      case "update":
        return item.update.id;
    }
  }, []);

  const getItemType = useCallback((item: Row) => item.kind, []);

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
    if (isError) {
      // A failed fetch must never read as "all caught up"
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cloud-offline-outline" size={28} color="#8e8e93" />
          </View>
          <Text style={styles.emptyTitle}>Couldn't load updates</Text>
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
          <Ionicons name="albums-outline" size={28} color="#9a9aa0" />
        </View>
        <Text style={styles.emptyTitle}>All caught up</Text>
        <Text style={styles.emptySubtitle}>
          Updates from your albums show up here
        </Text>
      </View>
    );
  }, [isLoading, isError, refetch]);

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
      data={rows}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      // Four very differently-sized row shapes must not share one
      // recycling pool (hero collages vs one-line member rows)
      getItemType={getItemType}
      estimatedItemSize={220}
      contentContainerStyle={contentStyle}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={listFooter}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
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

const styles = StyleSheet.create({
  headline: {
    paddingHorizontal: H_PADDING,
    paddingTop: 20,
    paddingBottom: 18,
  },
  headlineStrong: {
    color: color.textPrimary,
    fontSize: 24,
    ...font.bold,
  },
  headlineAccent: {
    color: color.textPrimary,
    ...scriptType(24),
  },
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
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    marginBottom: 6,
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
  emptySubtitle: {
    color: "#8e8e93",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});

export default AlbumsFeedList;
