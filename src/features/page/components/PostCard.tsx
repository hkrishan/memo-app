import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { formatRelativeTime } from "@/features/album/components/photoSocial/socialUtils";
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  Text,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import { stableCacheKey } from "@/lib/imageCache";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS } from "react-native-reanimated";
import { AlbumPagePost, AlbumPagePostMedia } from "../types/post.types";
import {
  useDeletePostMutation,
  useTogglePostLikeMutation,
} from "../api/pagePost.queries";
import { confirmDeletePost } from "./confirmDeletePost";

const AnimatedScrollView = Animated.ScrollView;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MEDIA_SIZE = SCREEN_WIDTH;

interface PostCardProps {
  post: AlbumPagePost;
  albumId: string;
  pageId: string;
  onCommentsPress?: (postId: string) => void;
}

const formatCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
};


const MediaItem = memo<{
  media: AlbumPagePostMedia;
}>(({ media }) => {
  if (media.mediaType === "video") {
    return (
      <View style={styles.mediaContainer}>
        <Video
          source={{ uri: media.url }}
          style={styles.media}
          resizeMode={ResizeMode.COVER}
          useNativeControls
          isLooping={false}
          posterSource={
            media.thumbnailUrl ? { uri: media.thumbnailUrl } : undefined
          }
          usePoster={!!media.thumbnailUrl}
        />
        <View style={styles.videoIndicator}>
          <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.9)" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.mediaContainer}>
      <Image
        source={{ uri: media.url, cacheKey: stableCacheKey(media.url) }}
        style={styles.media}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />
    </View>
  );
});

const MediaCarousel = memo<{
  media: AlbumPagePostMedia[];
  onDoubleTap: () => void;
}>(({ media, onDoubleTap }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);

  const sortedMedia = useMemo(
    () => [...media].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [media]
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / MEDIA_SIZE);
      // Commit only on page change — this fired per scroll frame
      if (index === currentIndexRef.current) return;
      currentIndexRef.current = index;
      setCurrentIndex(index);
    },
    []
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          // One JS hop at recognition — .runOnJS(true) forced the whole
          // recognizer through the JS thread for every touch on the cell
          runOnJS(onDoubleTap)();
        }),
    [onDoubleTap]
  );

  if (sortedMedia.length === 1) {
    return (
      <GestureDetector gesture={doubleTapGesture}>
        <Animated.View>
          <MediaItem media={sortedMedia[0]} />
        </Animated.View>
      </GestureDetector>
    );
  }

  return (
    <View style={styles.carouselWrapper}>
      <GestureDetector gesture={doubleTapGesture}>
        <AnimatedScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          snapToInterval={MEDIA_SIZE}
          snapToAlignment="start"
        >
          {sortedMedia.map((item) => (
            <MediaItem key={item.mediaId} media={item} />
          ))}
        </AnimatedScrollView>
      </GestureDetector>

      {/* Page indicator dots */}
      <View style={styles.dotsContainer}>
        {sortedMedia.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index === currentIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Counter badge */}
      <View style={styles.counterBadge}>
        <Text style={styles.counterText}>
          {currentIndex + 1}/{sortedMedia.length}
        </Text>
      </View>
    </View>
  );
});

const PostCard = memo<PostCardProps>(
  ({ post, albumId, pageId, onCommentsPress }) => {
    const likeMutation = useTogglePostLikeMutation(albumId, pageId, post.postId);

    const isLiked = post.likedByCurrentUser ?? false;

    // Rapid toggles are safe: the mutation's scope serializes them per post
    const handleLikePress = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      likeMutation.mutate({ like: !isLiked });
    }, [isLiked, likeMutation]);

    const handleCommentsPress = useCallback(() => {
      onCommentsPress?.(post.postId);
    }, [post.postId, onCommentsPress]);

    // Delete (author or page owner — the server sets canDelete accordingly)
    const deleteMutation = useDeletePostMutation(albumId, pageId);
    const handleDeletePress = useCallback(() => {
      confirmDeletePost(() => deleteMutation.mutate({ postId: post.postId }));
    }, [deleteMutation, post.postId]);

    const handleDoubleTap = useCallback(() => {
      if (!isLiked) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        likeMutation.mutate({ like: true });
      }
    }, [isLiked, likeMutation]);

    return (
      <View style={styles.container}>
        {/* Media carousel */}
        <MediaCarousel media={post.media} onDoubleTap={handleDoubleTap} />

        {/* Actions */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={handleLikePress}
            style={styles.actionButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isLiked ? "heart" : "heart-outline"}
              size={26}
              color={isLiked ? "#e53935" : "#000"}
            />
          </Pressable>

          <Pressable
            onPress={handleCommentsPress}
            style={styles.actionButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chatbubble-outline" size={24} color="#000" />
          </Pressable>

          <Pressable
            style={styles.actionButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="paper-plane-outline" size={24} color="#000" />
          </Pressable>

          {post.canDelete && (
            <Pressable
              onPress={handleDeletePress}
              style={[styles.actionButton, styles.moreButton]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Delete post"
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#000" />
            </Pressable>
          )}
        </View>

        {/* Like count */}
        {post.likeCount > 0 && (
          <Text style={styles.likeCount}>
            {formatCount(post.likeCount)} {post.likeCount === 1 ? "like" : "likes"}
          </Text>
        )}

        {/* Caption */}
        {post.caption && (
          <Text style={styles.caption} numberOfLines={3}>
            {post.caption}
          </Text>
        )}

        {/* Comments preview */}
        {post.commentCount > 0 && (
          <Pressable onPress={handleCommentsPress}>
            <Text style={styles.commentsLink}>
              View {post.commentCount === 1 ? "1 comment" : `all ${post.commentCount} comments`}
            </Text>
          </Pressable>
        )}

        {/* Timestamp */}
        <Text style={styles.timestamp}>{formatRelativeTime(post.createdAt)}</Text>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    marginBottom: 24,
  },
  mediaContainer: {
    width: MEDIA_SIZE,
    height: MEDIA_SIZE,
    backgroundColor: "#f0f0f0",
    position: "relative",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  videoIndicator: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -24 }, { translateY: -24 }],
  },
  carouselWrapper: {
    position: "relative",
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#d0d0d0",
  },
  dotActive: {
    backgroundColor: "#007AFF",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  counterBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  counterText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 16,
  },
  actionButton: {
    padding: 4,
  },
  moreButton: {
    marginLeft: "auto",
  },
  likeCount: {
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  caption: {
    fontSize: 14,
    color: "#000",
    lineHeight: 20,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  commentsLink: {
    fontSize: 14,
    color: "#666",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    color: "#999",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
});

export default PostCard;
