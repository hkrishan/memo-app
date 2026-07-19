import React, { useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Text,
} from "react-native";
import { FlashList as FlashListBase } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { AlbumPagePost } from "../types/post.types";
import { usePagePostsQuery } from "../api/pagePost.queries";
import PostCard from "../components/PostCard";

// Cast to any to bypass FlashList type definition mismatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FlashList = FlashListBase as any;

const PostFeedScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<any>(null);
  const { albumId, pageId, postId, index } = useLocalSearchParams<{
    albumId: string;
    pageId: string;
    postId: string;
    index: string;
  }>();

  const initialIndex = parseInt(index ?? "0", 10);

  const { data, isLoading, isError } = usePagePostsQuery(
    albumId ?? "",
    pageId ?? ""
  );

  const posts = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.posts);
  }, [data]);

  // Scroll to the tapped post when data loads
  useEffect(() => {
    if (posts.length > 0 && initialIndex > 0 && listRef.current) {
      // Small delay to ensure list is rendered
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: initialIndex,
          animated: false,
        });
      }, 100);
    }
  }, [posts.length, initialIndex]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleCommentsPress = useCallback((postId: string) => {
    // TODO: Navigate to comments screen
    console.log("Comments pressed for post:", postId);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: AlbumPagePost }) => (
      <PostCard
        post={item}
        albumId={albumId ?? ""}
        pageId={pageId ?? ""}
        onCommentsPress={handleCommentsPress}
      />
    ),
    [albumId, pageId, handleCommentsPress]
  );

  const keyExtractor = useCallback((item: AlbumPagePost) => item.postId, []);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </Pressable>
          <Text style={styles.headerTitle}>Posts</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </Pressable>
          <Text style={styles.headerTitle}>Posts</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#e53935" />
          <Text style={styles.errorText}>Failed to load posts</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </Pressable>
        <Text style={styles.headerTitle}>Posts</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Post feed */}
      <View style={styles.listContainer}>
        <FlashList
          ref={listRef}
          data={posts}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={500}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  headerSpacer: {
    width: 40,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#e53935",
    marginTop: 12,
  },
});

export default PostFeedScreen;
