/**
 * PostGrid — two-column masonry of a page's posts, every photo at its
 * TRUE aspect ratio (no square crops).
 *
 * The server sends no media dimensions, so each tile reports its image's
 * natural size on load into a module-level cache (persists across visits
 * — revisit layouts are stable instantly) and the tile's height updates
 * in place. Column assignment is STICKY: decided once per post when it
 * first appears (using the shorter column at that moment) and never
 * changed, so late-arriving measurements can grow a column but never
 * shuffle photos across columns. Extreme panoramas/towers are clamped to
 * a sane shape and cover-crop only the overflow.
 *
 * Post indices passed to the post route stay FLAT indices — the masonry
 * is purely presentational.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Pressable,
  Dimensions,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Image, type ImageLoadEventData } from "expo-image";
import { stableCacheKey } from "@/lib/imageCache";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, {
  type SharedValue,
  useAnimatedScrollHandler,
} from "react-native-reanimated";
import { AlbumPagePost } from "../types/post.types";
import { usePagePostsQuery } from "../api/pagePost.queries";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLUMN_COUNT = 3;
const GAP = 6;
const TILE_RADIUS = 12;
const COLUMN_WIDTH =
  (SCREEN_WIDTH - GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT;
/** Height guess (as width/height) until the image reports its real size. */
const DEFAULT_RATIO = 0.8;
/** True-aspect within reason: beyond these the tile cover-crops. */
const MIN_RATIO = 0.58;
const MAX_RATIO = 1.85;

/** mediaId -> natural width/height. Module-level: survives remounts. */
const aspectRatioCache = new Map<string, number>();

const clampRatio = (ratio: number): number =>
  Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));

const tileHeightFor = (post: AlbumPagePost): number => {
  const media = post.media[0];
  const known = media ? aspectRatioCache.get(media.mediaId) : undefined;
  return COLUMN_WIDTH / clampRatio(known ?? DEFAULT_RATIO);
};

interface PostGridProps {
  albumId: string;
  pageId: string;
  ListHeaderComponent?: React.ReactElement;
  contentContainerStyle?: object;
  /** Mirrors the grid's scroll offset (drives the album nav bar's fade) */
  scrollY?: SharedValue<number>;
}

const PostTile = memo<{
  post: AlbumPagePost;
  albumId: string;
  pageId: string;
  flatIndex: number;
  height: number;
  onNaturalSize: (mediaId: string, ratio: number) => void;
}>(({ post, albumId, pageId, flatIndex, height, onNaturalSize }) => {
  const router = useRouter();
  const firstMedia = post.media[0];
  const hasMultipleMedia = post.media.length > 1;

  const handlePress = useCallback(() => {
    router.push(
      `/album/${albumId}/page/${pageId}/post/${post.postId}?index=${flatIndex}`,
    );
  }, [router, albumId, pageId, post.postId, flatIndex]);

  const handleLoad = useCallback(
    (event: ImageLoadEventData) => {
      const { width, height: naturalHeight } = event.source;
      if (firstMedia && width > 0 && naturalHeight > 0) {
        onNaturalSize(firstMedia.mediaId, width / naturalHeight);
      }
    },
    [firstMedia, onNaturalSize],
  );

  if (!firstMedia) {
    return null;
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.tile,
        { height },
        pressed && styles.tilePressed,
      ]}
      accessibilityRole="imagebutton"
    >
      <Image
        source={{
          uri: firstMedia.thumbnailUrl ?? firstMedia.url,
          cacheKey: stableCacheKey(firstMedia.thumbnailUrl ?? firstMedia.url),
        }}
        style={styles.tileImage}
        contentFit="cover"
        transition={180}
        cachePolicy="memory-disk"
        onLoad={handleLoad}
      />
      {hasMultipleMedia && (
        <View style={styles.multipleIndicator}>
          <Ionicons name="copy" size={14} color="#fff" />
        </View>
      )}
    </Pressable>
  );
});
PostTile.displayName = "PostTile";

const EmptyState = memo(() => (
  <View style={styles.emptyState}>
    <Ionicons name="images-outline" size={48} color="#ccc" />
    <Text style={styles.emptyTitle}>No posts yet</Text>
    <Text style={styles.emptySubtitle}>
      Be the first to share something on this page.
    </Text>
  </View>
));
EmptyState.displayName = "EmptyState";

const PostGrid = memo<PostGridProps>(
  ({ albumId, pageId, ListHeaderComponent, contentContainerStyle, scrollY }) => {
    const scrollHandler = useAnimatedScrollHandler({
      onScroll: (event) => {
        if (scrollY) scrollY.value = event.contentOffset.y;
      },
    });
    const { data, isLoading, isError, refetch, isRefetching } =
      usePagePostsQuery(albumId, pageId);

    const posts = useMemo(() => {
      if (!data?.pages) return [];
      return data.pages.flatMap((page) => page.posts);
    }, [data]);

    // Bumped (coalesced to once per batch of loads) when natural sizes
    // arrive, so tile heights refresh in place
    const [sizeVersion, setSizeVersion] = useState(0);
    const bumpScheduledRef = useRef(false);
    const handleNaturalSize = useCallback((mediaId: string, ratio: number) => {
      if (aspectRatioCache.has(mediaId)) return;
      aspectRatioCache.set(mediaId, ratio);
      if (bumpScheduledRef.current) return;
      bumpScheduledRef.current = true;
      queueMicrotask(() => {
        bumpScheduledRef.current = false;
        setSizeVersion((version) => version + 1);
      });
    }, []);

    // Column assignment is a PURE function of posts + known ratios:
    // each post drops into the currently-shortest column, in order. No
    // sticky memory — stale assignments outlive layout changes (column
    // count, hot reloads, reordered refetches) and leave holes. The one
    // cost is a single settle shortly after first paint while natural
    // sizes land (coalesced into one recompute); once the session cache
    // is warm the layout is identical on every render.
    const columns = useMemo(() => {
      void sizeVersion; // heights recompute as measurements land
      const heights = new Array(COLUMN_COUNT).fill(0);
      const cols: { post: AlbumPagePost; flatIndex: number; height: number }[][] =
        Array.from({ length: COLUMN_COUNT }, () => []);
      posts.forEach((post, flatIndex) => {
        const height = tileHeightFor(post);
        // Shortest column (ties go left)
        const column = heights.indexOf(Math.min(...heights));
        cols[column].push({ post, flatIndex, height });
        heights[column] += height + GAP;
      });
      return cols;
    }, [posts, sizeVersion]);

    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          {ListHeaderComponent}
          <ActivityIndicator size="large" color="#000" />
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.centerContainer}>
          {ListHeaderComponent}
          <Ionicons name="alert-circle-outline" size={48} color="#e53935" />
          <Text style={styles.errorText}>Failed to load posts</Text>
        </View>
      );
    }

    return (
      <Animated.ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#000"
          />
        }
      >
        {ListHeaderComponent}
        {posts.length === 0 ? (
          <EmptyState />
        ) : (
          <View style={styles.masonry}>
            {columns.map((column, columnIndex) => (
              <View key={`column-${columnIndex}`} style={styles.column}>
                {column.map(({ post, flatIndex, height }) => (
                  <PostTile
                    key={post.postId}
                    post={post}
                    albumId={albumId}
                    pageId={pageId}
                    flatIndex={flatIndex}
                    height={height}
                    onNaturalSize={handleNaturalSize}
                  />
                ))}
              </View>
            ))}
          </View>
        )}
      </Animated.ScrollView>
    );
  },
);
PostGrid.displayName = "PostGrid";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  content: {
    flexGrow: 1,
    paddingBottom: GAP,
  },
  masonry: {
    flexDirection: "row",
    gap: GAP,
    paddingHorizontal: GAP,
    paddingTop: GAP,
    alignItems: "flex-start",
  },
  column: {
    flex: 1,
    gap: GAP,
  },
  tile: {
    width: "100%",
    borderRadius: TILE_RADIUS,
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
  },
  tilePressed: {
    opacity: 0.85,
  },
  tileImage: {
    width: "100%",
    height: "100%",
  },
  multipleIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    maxWidth: 280,
  },
  errorText: {
    fontSize: 16,
    color: "#e53935",
    marginTop: 12,
  },
});

export default PostGrid;
