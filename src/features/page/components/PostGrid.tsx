import React, { memo, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Pressable,
  Dimensions,
  FlatList,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AlbumPagePost } from "../types/post.types";
import { usePagePostsQuery } from "../api/pagePost.queries";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const GRID_SPACING = 2;
const ITEM_SIZE =
  (SCREEN_WIDTH - GRID_SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

interface PostGridProps {
  albumId: string;
  pageId: string;
  ListHeaderComponent?: React.ReactElement;
  contentContainerStyle?: object;
}

const PostGridItem = memo<{
  post: AlbumPagePost;
  albumId: string;
  pageId: string;
  index: number;
}>(({ post, albumId, pageId, index }) => {
  const router = useRouter();
  const firstMedia = post.media[0];
  const hasMultipleMedia = post.media.length > 1;

  const handlePress = useCallback(() => {
    router.push(
      `/album/${albumId}/page/${pageId}/post/${post.postId}?index=${index}`,
    );
  }, [router, albumId, pageId, post.postId, index]);

  if (!firstMedia) {
    return <View style={styles.gridItem} />;
  }

  return (
    <Pressable onPress={handlePress} style={styles.gridItem}>
      <Image
        source={{ uri: firstMedia.thumbnailUrl ?? firstMedia.url }}
        style={styles.gridImage}
        contentFit="cover"
        transition={200}
      />
      {hasMultipleMedia && (
        <View style={styles.multipleIndicator}>
          <Ionicons name="copy" size={16} color="#fff" />
        </View>
      )}
    </Pressable>
  );
});

const EmptyState = memo(() => (
  <View style={styles.emptyState}>
    <Ionicons name="images-outline" size={48} color="#ccc" />
    <Text style={styles.emptyTitle}>No posts yet</Text>
    <Text style={styles.emptySubtitle}>
      Be the first to share something on this page.
    </Text>
  </View>
));

const PostGrid = memo<PostGridProps>(
  ({ albumId, pageId, ListHeaderComponent, contentContainerStyle }) => {
    const { data, isLoading, isError, refetch, isRefetching } =
      usePagePostsQuery(albumId, pageId);

    const posts = useMemo(() => {
      if (!data?.pages) return [];
      return data.pages.flatMap((page) => page.posts);
    }, [data]);

    const renderItem = useCallback(
      ({ item, index }: { item: AlbumPagePost; index: number }) => (
        <PostGridItem
          post={item}
          albumId={albumId}
          pageId={pageId}
          index={index}
        />
      ),
      [albumId, pageId],
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
      <View style={styles.container}>
        <FlatList
          data={posts}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={NUM_COLUMNS}
          ListHeaderComponent={ListHeaderComponent}
          ListEmptyComponent={<EmptyState />}
          contentContainerStyle={[styles.gridContent, contentContainerStyle]}
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
  gridContent: {
    paddingHorizontal: GRID_SPACING,
    flexGrow: 1,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: GRID_SPACING / 2,
    backgroundColor: "#f0f0f0",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  multipleIndicator: {
    position: "absolute",
    top: 6,
    right: 6,
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
