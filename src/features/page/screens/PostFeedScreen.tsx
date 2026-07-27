/**
 * PostFeedScreen — TikTok-style fullscreen post pager.
 *
 * One post per screen on pure black, vertically paged: each flick snaps
 * the next post into place. Media renders at its true aspect (contain)
 * within the page; multi-media posts page horizontally with dots and a
 * counter. Caption/time sit bottom-left over a scrim, like/comment live
 * in a right-hand rail, and the only chrome is a liquid-glass back
 * button — there is no navigation bar.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Text,
  FlatList,
  StatusBar,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";

import { GlassCircleButton } from "@/components/ui/GlassCircleButton";
import { stableCacheKey } from "@/lib/imageCache";
import { useAuthStore } from "@/features/auth/store/authStore";
import { AlbumPagePost, AlbumPagePostMedia } from "../types/post.types";
import {
  usePagePostsQuery,
  useTogglePostLikeMutation,
} from "../api/pagePost.queries";
import PostCommentsSheet from "../components/PostCommentsSheet";

const formatCount = (count: number): string => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

const formatTimeAgo = (date: Date | string): string => {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

// Double-tap heart burst (mirrors AlbumPhotoSocialOverlay): spring up
// ~420ms, then fade + drift out — ~700ms total
const BURST_HEART_SIZE = 96;
const BURST_EXIT_DELAY = 420;
const BURST_EXIT_DURATION = 280;
const BURST_TOTAL_MS = BURST_EXIT_DELAY + BURST_EXIT_DURATION;

/** mediaId -> natural width/height; module-level so revisits are instant. */
const mediaAspectCache = new Map<string, number>();

/** Fit a media box (by w/h ratio) inside the inset stage. */
const fitBox = (
  ratio: number | undefined,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } => {
  if (!ratio || ratio <= 0) return { width: maxWidth, height: maxHeight };
  const width = Math.min(maxWidth, maxHeight * ratio);
  return { width, height: width / ratio };
};

const FullScreenMedia = memo<{
  media: AlbumPagePostMedia;
  width: number;
  height: number;
}>(({ media, width, height }) => {
  const [ratio, setRatio] = useState<number | undefined>(() =>
    mediaAspectCache.get(media.mediaId),
  );

  const rememberRatio = useCallback(
    (naturalWidth: number, naturalHeight: number) => {
      if (naturalWidth > 0 && naturalHeight > 0) {
        const value = naturalWidth / naturalHeight;
        mediaAspectCache.set(media.mediaId, value);
        setRatio(value);
      }
    },
    [media.mediaId],
  );

  // The picture floats a little inside the screen; the SAME image fills
  // the whole page behind it, darkly blurred
  const stage = fitBox(ratio, width - 40, height * 0.8);
  const backdropUri = media.thumbnailUrl ?? media.url;

  return (
    <View style={[styles.mediaPage, { width, height }]}>
      <Image
        source={{ uri: backdropUri, cacheKey: stableCacheKey(backdropUri) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={45}
        transition={200}
        cachePolicy="memory-disk"
      />
      <View style={styles.backdropDim} pointerEvents="none" />

      {media.mediaType === "video" ? (
        <View
          style={[
            styles.mediaCard,
            { width: stage.width, height: stage.height },
          ]}
        >
          <Video
            source={{ uri: media.url }}
            style={styles.mediaFill}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            isLooping={false}
            posterSource={
              media.thumbnailUrl ? { uri: media.thumbnailUrl } : undefined
            }
            usePoster={!!media.thumbnailUrl}
            onReadyForDisplay={(event) => {
              const size = event.naturalSize;
              if (size) rememberRatio(size.width, size.height);
            }}
          />
        </View>
      ) : (
        <View
          style={[
            styles.mediaCard,
            { width: stage.width, height: stage.height },
          ]}
        >
          <Image
            source={{ uri: media.url, cacheKey: stableCacheKey(media.url) }}
            style={styles.mediaFill}
            contentFit={ratio ? "cover" : "contain"}
            transition={200}
            cachePolicy="memory-disk"
            onLoad={(event) =>
              rememberRatio(event.source.width, event.source.height)
            }
          />
        </View>
      )}
    </View>
  );
});
FullScreenMedia.displayName = "FullScreenMedia";

const FullScreenPost = memo<{
  post: AlbumPagePost;
  albumId: string;
  pageId: string;
  pageWidth: number;
  pageHeight: number;
  bottomInset: number;
  onOpenComments: (postId: string) => void;
}>(({ post, albumId, pageId, pageWidth, pageHeight, bottomInset, onOpenComments }) => {
  const toggleLike = useTogglePostLikeMutation(albumId, pageId, post.postId);
  const [mediaIndex, setMediaIndex] = useState(0);

  const sortedMedia = useMemo(
    () =>
      [...post.media].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [post.media],
  );

  const isLiked = post.likedByCurrentUser ?? false;

  // Rail heart spring pop on toggle
  const heartScale = useSharedValue(1);
  const popHeart = useCallback(() => {
    cancelAnimation(heartScale);
    heartScale.value = withSequence(
      withSpring(1.3, { damping: 12, stiffness: 420 }),
      withSpring(1, { damping: 15, stiffness: 320 }),
    );
  }, [heartScale]);
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  // Center-screen heart burst on double-tap (mirrors the album photo viewer)
  const [burstVisible, setBurstVisible] = useState(false);
  const burstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstScale = useSharedValue(0);
  const burstOpacity = useSharedValue(0);
  const burstTranslateY = useSharedValue(0);

  useEffect(
    () => () => {
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
    },
    [],
  );

  const playHeartBurst = useCallback(() => {
    // Re-triggering mid-animation restarts the burst from the top
    if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
    cancelAnimation(burstScale);
    cancelAnimation(burstOpacity);
    cancelAnimation(burstTranslateY);
    setBurstVisible(true);

    burstScale.value = 0;
    burstOpacity.value = 1;
    burstTranslateY.value = 0;
    burstScale.value = withSequence(
      withSpring(1.15, { damping: 12, stiffness: 420 }),
      withSpring(1, { damping: 15, stiffness: 320 }),
    );
    burstOpacity.value = withDelay(
      BURST_EXIT_DELAY,
      withTiming(0, { duration: BURST_EXIT_DURATION }),
    );
    burstTranslateY.value = withDelay(
      BURST_EXIT_DELAY,
      withTiming(-36, { duration: BURST_EXIT_DURATION }),
    );

    burstTimeoutRef.current = setTimeout(() => {
      setBurstVisible(false);
      burstTimeoutRef.current = null;
    }, BURST_TOTAL_MS + 40);
  }, [burstScale, burstOpacity, burstTranslateY]);

  const burstStyle = useAnimatedStyle(() => ({
    opacity: burstOpacity.value,
    transform: [
      { translateY: burstTranslateY.value },
      { scale: burstScale.value },
    ],
  }));

  // Rapid toggles are safe: the mutation's scope serializes them per post
  const handleLikePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    popHeart();
    toggleLike.mutate({ like: !isLiked });
  }, [isLiked, toggleLike, popHeart]);

  const handleCommentsPress = useCallback(() => {
    onOpenComments(post.postId);
  }, [onOpenComments, post.postId]);

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (!isLiked) {
            popHeart();
            toggleLike.mutate({ like: true });
          }
          // The burst plays whether or not the post was already liked
          playHeartBurst();
        })
        .runOnJS(true),
    [isLiked, toggleLike, popHeart, playHeartBurst],
  );

  const handleMediaScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(
        event.nativeEvent.contentOffset.x / pageWidth,
      );
      setMediaIndex(index);
    },
    [pageWidth],
  );

  return (
    <View style={[styles.postPage, { width: pageWidth, height: pageHeight }]}>
      <GestureDetector gesture={doubleTapGesture}>
        <Animated.View style={StyleSheet.absoluteFill}>
          {sortedMedia.length === 1 ? (
            <FullScreenMedia
              media={sortedMedia[0]}
              width={pageWidth}
              height={pageHeight}
            />
          ) : (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleMediaScroll}
              scrollEventThrottle={16}
            >
              {sortedMedia.map((item) => (
                <FullScreenMedia
                  key={item.mediaId}
                  media={item}
                  width={pageWidth}
                  height={pageHeight}
                />
              ))}
            </ScrollView>
          )}
        </Animated.View>
      </GestureDetector>

      {/* Double-tap heart burst, centered over the media */}
      {burstVisible && (
        <View style={styles.burstLayer} pointerEvents="none">
          <Animated.View style={burstStyle}>
            <Ionicons
              name="heart"
              size={BURST_HEART_SIZE}
              color="#fff"
              style={styles.burstHeart}
            />
          </Animated.View>
        </View>
      )}

      {/* Bottom scrim keeps caption/actions legible over bright media */}
      <LinearGradient
        colors={["transparent", "rgba(0, 0, 0, 0.7)"]}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* Media position (multi-media only) */}
      {sortedMedia.length > 1 && (
        <>
          <View style={styles.counterBadge} pointerEvents="none">
            <Text style={styles.counterText}>
              {mediaIndex + 1}/{sortedMedia.length}
            </Text>
          </View>
          <View
            style={[styles.dotsRow, { bottom: bottomInset + 22 }]}
            pointerEvents="none"
          >
            {sortedMedia.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === mediaIndex && styles.dotActive,
                ]}
              />
            ))}
          </View>
        </>
      )}

      {/* Right rail: like + comments */}
      <View style={[styles.rail, { bottom: bottomInset + 84 }]}>
        <Pressable
          onPress={handleLikePress}
          style={styles.railButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isLiked ? "Unlike" : "Like"}
        >
          <Animated.View style={heartStyle}>
            <Ionicons
              name={isLiked ? "heart" : "heart-outline"}
              size={32}
              color={isLiked ? "#FF3B5C" : "#fff"}
              style={styles.railIcon}
            />
          </Animated.View>
          {post.likeCount > 0 && (
            <Text style={styles.railCount}>
              {formatCount(post.likeCount)}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={handleCommentsPress}
          style={styles.railButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Comments"
        >
          <Ionicons
            name="chatbubble-outline"
            size={28}
            color="#fff"
            style={styles.railIcon}
          />
          {post.commentCount > 0 && (
            <Text style={styles.railCount}>
              {formatCount(post.commentCount)}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Caption + time, bottom-left */}
      <View
        style={[styles.infoBlock, { bottom: bottomInset + 40 }]}
        pointerEvents="none"
      >
        {!!post.caption && (
          <Text style={styles.caption} numberOfLines={4}>
            {post.caption}
          </Text>
        )}
        <Text style={styles.timestamp}>{formatTimeAgo(post.createdAt)}</Text>
      </View>
    </View>
  );
});
FullScreenPost.displayName = "FullScreenPost";

const PostFeedScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: pageWidth, height: pageHeight } = useWindowDimensions();
  const listRef = useRef<FlatList<AlbumPagePost>>(null);
  const { albumId, pageId, index } = useLocalSearchParams<{
    albumId: string;
    pageId: string;
    postId: string;
    index: string;
  }>();

  const initialIndex = Math.max(parseInt(index ?? "0", 10) || 0, 0);
  const currentUserId = useAuthStore((state) => state.user?.id);

  const { data, isLoading, isError } = usePagePostsQuery(
    albumId ?? "",
    pageId ?? "",
  );

  // Which post the comments sheet shows. Set at open and RETAINED through
  // close — nulling it at close would blank the sheet mid-animation.
  const [sheetPostId, setSheetPostId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const openComments = useCallback((postId: string) => {
    setSheetPostId(postId);
    setCommentsOpen(true);
  }, []);
  const closeComments = useCallback(() => setCommentsOpen(false), []);

  const posts = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.posts);
  }, [data]);

  // Jump to the tapped post once, when the data first arrives. Layout is
  // deterministic (full pages), so no measurement delay is needed.
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (didInitialScrollRef.current || posts.length === 0) return;
    didInitialScrollRef.current = true;
    if (initialIndex > 0) {
      listRef.current?.scrollToOffset({
        offset: Math.min(initialIndex, posts.length - 1) * pageHeight,
        animated: false,
      });
    }
  }, [posts.length, initialIndex, pageHeight]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: AlbumPagePost }) => (
      <FullScreenPost
        post={item}
        albumId={albumId ?? ""}
        pageId={pageId ?? ""}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        bottomInset={insets.bottom}
        onOpenComments={openComments}
      />
    ),
    [albumId, pageId, pageWidth, pageHeight, insets.bottom, openComments],
  );

  const keyExtractor = useCallback((item: AlbumPagePost) => item.postId, []);

  const getItemLayout = useCallback(
    (_: ArrayLike<AlbumPagePost> | null | undefined, itemIndex: number) => ({
      length: pageHeight,
      offset: pageHeight * itemIndex,
      index: itemIndex,
    }),
    [pageHeight],
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : isError ? (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#FF6B6B" />
          <Text style={styles.errorText}>Failed to load posts</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={posts}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          windowSize={5}
          initialNumToRender={2}
          maxToRenderPerBatch={3}
        />
      )}

      {/* The only chrome: a liquid-glass back button */}
      <View style={[styles.backWrap, { top: insets.top + 8 }]}>
        <GlassCircleButton
          onPress={handleBack}
          label="Back"
          size={40}
          tint="dark"
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </GlassCircleButton>
      </View>

      <PostCommentsSheet
        albumId={albumId ?? ""}
        pageId={pageId ?? ""}
        postId={sheetPostId}
        visible={commentsOpen}
        onClose={closeComments}
        currentUserId={currentUserId}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: "rgba(255, 255, 255, 0.8)",
  },
  postPage: {
    backgroundColor: "#000",
  },
  mediaPage: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  backdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  // The floating picture: rounded, softly lifted off the blurred backdrop
  mediaCard: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#111",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 8,
  },
  mediaFill: {
    width: "100%",
    height: "100%",
  },
  bottomScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
  },
  counterBadge: {
    position: "absolute",
    top: 60,
    right: 16,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  counterText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  dotsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 14,
    borderRadius: 3,
  },
  rail: {
    position: "absolute",
    right: 12,
    alignItems: "center",
    gap: 18,
  },
  railButton: {
    alignItems: "center",
    gap: 3,
  },
  railIcon: {
    textShadowColor: "rgba(0, 0, 0, 0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  railCount: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    textShadowColor: "rgba(0, 0, 0, 0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  infoBlock: {
    position: "absolute",
    left: 16,
    right: 76,
    gap: 6,
  },
  caption: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  timestamp: {
    color: "rgba(255, 255, 255, 0.65)",
    fontSize: 12,
  },
  backWrap: {
    position: "absolute",
    left: 16,
  },
  burstLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  burstHeart: {
    textShadowColor: "rgba(0, 0, 0, 0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
});

export default PostFeedScreen;
