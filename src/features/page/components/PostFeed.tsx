import React, { memo, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Text,
} from "react-native";
import { FlashList as FlashListBase } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";

// Cast to any to bypass FlashList type definition mismatch with installed version
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FlashList = FlashListBase as any;
import { AlbumPagePost } from "../types/post.types";
import { usePagePostsQuery } from "../api/pagePost.queries";
import PostCard from "./PostCard";

interface PostFeedProps {
  albumId: string;
  pageId: string;
  ListHeaderComponent?: React.ReactElement;
  contentContainerStyle?: object;
  onCommentsPress?: (postId: string) => void;
}

const EmptyState = memo(() => (
  <View style={styles.emptyState}>
    <Ionicons name="images-outline" size={48} color="#ccc" />
    <Text style={styles.emptyTitle}>No posts yet</Text>
    <Text style={styles.emptySubtitle}>
      Be the first to share something on this page.
    </Text>
  </View>
));

const LoadingFooter = memo(() => (
  <View style={styles.loadingFooter}>
    <ActivityIndicator size="small" color="#666" />
  </View>
));

const PostFeed = memo<PostFeedProps>(
  ({
    albumId,
    pageId,
    ListHeaderComponent,
    contentContainerStyle,
    onCommentsPress,
  }) => {
    const {
      data,
      isLoading,
      isError,
      isFetchingNextPage,
      hasNextPage,
      fetchNextPage,
      refetch,
      isRefetching,
    } = usePagePostsQuery(albumId, pageId);

    const posts = useMemo(() => {
      if (!data?.pages) return [];
      return data.pages.flatMap((page) => page.posts);
    }, [data]);

    const handleEndReached = useCallback(() => {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const renderItem = useCallback(
      ({ item }: { item: AlbumPagePost }) => (
        <PostCard
          post={item}
          albumId={albumId}
          pageId={pageId}
          onCommentsPress={onCommentsPress}
        />
      ),
      [albumId, pageId, onCommentsPress],
    );

    const keyExtractor = useCallback((item: AlbumPagePost) => item.postId, []);

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
      <View style={styles.listContainer}>
        <FlashList
          data={posts}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={450}
          ListHeaderComponent={ListHeaderComponent}
          ListEmptyComponent={<EmptyState />}
          ListFooterComponent={isFetchingNextPage ? <LoadingFooter /> : null}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#000"
            />
          }
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
    width: "100%",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
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
  loadingFooter: {
    paddingVertical: 20,
    alignItems: "center",
  },
});

export default PostFeed;
