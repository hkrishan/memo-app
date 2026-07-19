import React, { memo, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  FlatList,
  Pressable,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { CachedImage } from "@/components/ui/CachedImage";
import type { PagePostFeedItem, PostMedia } from "../types/feed.types";

const { width: SW } = Dimensions.get("window");
const IMAGE_WIDTH = SW - 40; // 20px padding each side

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const t = new Date(dateStr).getTime();
  const diffMs = now - t;
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Media carousel page
// ---------------------------------------------------------------------------

const MediaPage = memo<{ item: PostMedia }>(({ item }) => (
  <View style={styles.mediaPage}>
    <CachedImage uri={item.url} style={styles.mediaImage} contentFit="cover" />
  </View>
));

// ---------------------------------------------------------------------------
// Dot indicator
// ---------------------------------------------------------------------------

const Dots = memo<{ count: number; active: number }>(({ count, active }) => {
  if (count <= 1) return null;
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dot, i === active && styles.dotActive]} />
      ))}
    </View>
  );
});

// ---------------------------------------------------------------------------
// FeedPost (page_post)
// ---------------------------------------------------------------------------

interface FeedPostProps {
  item: PagePostFeedItem;
}

const FeedPost = memo<FeedPostProps>(({ item }) => {
  const { post, page, author } = item;
  const [activeIdx, setActiveIdx] = useState(0);
  const mediaCount = post.media.length;

  const onScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / IMAGE_WIDTH);
      setActiveIdx(idx);
    },
    [],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<PostMedia> | null | undefined, index: number) => ({
      length: IMAGE_WIDTH,
      offset: IMAGE_WIDTH * index,
      index,
    }),
    [],
  );

  const renderMedia = useCallback(
    ({ item: media }: { item: PostMedia }) => <MediaPage item={media} />,
    [],
  );

  const keyExtractor = useCallback((m: PostMedia) => m.mediaId, []);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          {author.avatarUrl ? (
            <CachedImage
              uri={author.avatarUrl}
              style={styles.avatar}
              showPlaceholder={false}
            />
          ) : null}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.authorName}>{author.name}</Text>
          <Text style={styles.pageName}>{page.pageTitle}</Text>
        </View>
        <Text style={styles.timestamp}>
          {formatRelativeTime(post.createdAt)}
        </Text>
      </View>

      {/* Media carousel */}
      <View style={styles.mediaContainer}>
        <FlatList
          data={post.media}
          renderItem={renderMedia}
          keyExtractor={keyExtractor}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          getItemLayout={getItemLayout}
        />
        <Dots count={mediaCount} active={activeIdx} />
      </View>

      {/* Caption + actions */}
      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} hitSlop={8}>
          <Ionicons
            name={post.likedByCurrentUser ? "heart" : "heart-outline"}
            size={20}
            color={post.likedByCurrentUser ? "#e74c3c" : "#aaa"}
          />
          {post.likeCount > 0 && (
            <Text style={styles.actionCount}>{post.likeCount}</Text>
          )}
        </Pressable>
        <Pressable style={styles.actionBtn} hitSlop={8}>
          <Ionicons name="chatbubble-outline" size={18} color="#aaa" />
          {post.commentCount > 0 && (
            <Text style={styles.actionCount}>{post.commentCount}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    marginBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#333",
  },
  avatar: {
    width: 36,
    height: 36,
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
  },
  authorName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  pageName: {
    color: "#888",
    fontSize: 12,
    marginTop: 1,
  },
  timestamp: {
    color: "#666",
    fontSize: 12,
  },
  mediaContainer: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#222",
  },
  mediaPage: {
    width: IMAGE_WIDTH,
    aspectRatio: 1,
  },
  mediaImage: {
    width: "100%",
    height: "100%",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#555",
  },
  dotActive: {
    backgroundColor: "#fff",
  },
  caption: {
    color: "#ddd",
    fontSize: 14,
    marginTop: 10,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    marginTop: 10,
    gap: 16,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionCount: {
    color: "#aaa",
    fontSize: 13,
  },
});

export default FeedPost;
