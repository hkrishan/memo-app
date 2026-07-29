import React, {
  memo,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CachedImage } from "@/components/ui/CachedImage";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useTogglePostLikeMutation } from "@/features/page/api/pagePost.queries";
import PostCommentsSheet from "@/features/page/components/PostCommentsSheet";
import type { PagePostFeedItem, PostMedia } from "../types/feed.types";
import { FeedCard, FeedCardHeader, MEDIA_WIDTH, H_PADDING } from "./FeedCard";
import { PhotoViewer } from "@/features/photos/components/PhotoViewer";
import type { Frame } from "@/features/photos/components/types";
import type { MediaAsset } from "@/features/album/hooks";

// ---------------------------------------------------------------------------
// Media carousel page (tap to open the fullscreen viewer)
// ---------------------------------------------------------------------------

// Natural aspect (width/height) per media uri, learned from image loads.
// Module-level so revisited posts render at their real height immediately.
const mediaAspectCache = new Map<string, number>();
/** Container bounds: tall portraits cap here (whole photo still fits via
 *  contain), wide panoramas don't collapse into a sliver. */
const MIN_RATIO = 0.68;
const MAX_RATIO = 1.91;
const clampRatio = (ratio: number) =>
  Math.min(Math.max(ratio, MIN_RATIO), MAX_RATIO);

/** Hard ceiling scaled to the phone: a post's media never exceeds 55% of
 *  the window height, so even tall portraits leave the header + actions of
 *  neighboring posts visible while scrolling (the photo letterboxes onto
 *  the blurred backdrop via contain). */
const MAX_MEDIA_HEIGHT = Math.round(
  Dimensions.get("window").height * 0.55,
);

/** Videos render via their poster frame; photos via the image itself. */
const displayUriFor = (media: PostMedia): string =>
  media.mediaType === "video" ? (media.thumbnailUrl ?? media.url) : media.url;

const MediaPage = memo<{
  item: PostMedia;
  height: number;
  onPress: () => void;
  onAspect?: (ratio: number) => void;
}>(({ item, height, onPress, onAspect }) => {
  const uri = displayUriFor(item);

  const handleLoad = useCallback(
    (event: { source?: { width?: number; height?: number } }) => {
      const w = event.source?.width ?? 0;
      const h = event.source?.height ?? 0;
      if (w > 0 && h > 0) {
        const ratio = w / h;
        mediaAspectCache.set(uri, ratio);
        onAspect?.(ratio);
      }
    },
    [uri, onAspect],
  );

  return (
    <Pressable style={[styles.mediaPage, { height }]} onPress={onPress}>
      {/* Blurred cover-filled backdrop behind the fitted image. The
          THUMBNAIL is plenty here (it's blurred anyway) — blurring the
          full-res source decoded every post twice, and a 200px radius
          made the blur pass itself expensive */}
      <CachedImage
        uri={item.thumbnailUrl ?? uri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={40}
        showPlaceholder={false}
      />
      <View style={styles.mediaBackdropDim} pointerEvents="none" />
      <CachedImage
        uri={uri}
        style={styles.mediaImage}
        contentFit="contain"
        onLoad={handleLoad}
      />
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Carousel indicators: dots overlaid on the photo + "1/3" counter pill
// ---------------------------------------------------------------------------

const Dots = memo<{ count: number; active: number }>(({ count, active }) => {
  if (count <= 1) return null;
  return (
    <View style={styles.dotsPill} pointerEvents="none">
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
  const activeIdxRef = useRef(0);
  // Same open/dismiss system as the album photo grid: tapped index plus
  // the window frame the flight departs from and returns to
  const [viewerSession, setViewerSession] = useState<{
    index: number;
    originFrame: Frame | null;
  } | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Set at first open and retained: the comments query keys off this, so
  // merely scrolling the feed (sheet never opened) fetches nothing, and
  // nulling it at close would blank the sheet mid-dismiss
  const [sheetPostId, setSheetPostId] = useState<string | null>(null);
  const mediaCount = post.media.length;
  const currentUserId = useAuthStore((state) => state.user?.id);

  // The carousel needs one uniform height — sized to the FIRST media's
  // natural aspect (clamped), like Instagram. Cache hit renders correctly
  // on first paint; otherwise square until the image reports its size.
  const firstMediaUri = post.media[0] ? displayUriFor(post.media[0]) : null;
  const [firstRatio, setFirstRatio] = useState<number | null>(() =>
    firstMediaUri ? (mediaAspectCache.get(firstMediaUri) ?? null) : null,
  );
  const handleFirstAspect = useCallback((ratio: number) => {
    setFirstRatio((prev) => prev ?? ratio);
  }, []);
  const mediaHeight = Math.min(
    Math.round(MEDIA_WIDTH / clampRatio(firstRatio ?? 1)),
    MAX_MEDIA_HEIGHT,
  );

  // Like state comes straight from the feed cache — the toggle mutation
  // patches it (and the page-posts cache) optimistically, so both surfaces
  // stay in sync
  const liked = post.likedByCurrentUser;
  const likeCount = post.likeCount;
  const likeMutation = useTogglePostLikeMutation(
    post.albumId,
    post.pageId,
    post.postId,
  );

  const toggleLike = useCallback(() => {
    Haptics.selectionAsync();
    likeMutation.mutate({ like: !liked });
  }, [liked, likeMutation]);

  const openPage = useCallback(() => {
    router.push(`/page/${page.albumId}/${page.pageId}`);
  }, [page.albumId, page.pageId]);

  const openComments = useCallback(() => {
    setSheetPostId(post.postId);
    setCommentsOpen(true);
  }, [post.postId]);
  const closeComments = useCallback(() => setCommentsOpen(false), []);

  const onScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / MEDIA_WIDTH);
      // Only commit on an actual page change — unguarded, this re-rendered
      // the whole post (viewer, sheet, list) on every scroll frame
      if (idx === activeIdxRef.current) return;
      activeIdxRef.current = idx;
      setActiveIdx(idx);
    },
    [],
  );

  // ------------------------------------------------------------------
  // Album-grid-style viewer session (flight open + return flight)
  // ------------------------------------------------------------------

  const mediaContainerRef = useRef<View>(null);

  // Viewer assets: dims come from the learned aspect (the viewer's flight
  // needs only the ratio); unknown dims fall back to the viewer's fades
  const viewerAssets = useMemo<MediaAsset[]>(() => {
    const createdMs = new Date(post.createdAt).getTime();
    return post.media.map((media) => {
      const ratio = mediaAspectCache.get(displayUriFor(media));
      return {
        id: media.mediaId,
        uri: media.url,
        thumbnailUrl: media.thumbnailUrl ?? media.url,
        mediaType: media.mediaType === "video" ? "video" : "photo",
        width: ratio ? Math.round(ratio * 1000) : 0,
        height: ratio ? 1000 : 0,
        duration: 0,
        creationTime: createdMs,
        modificationTime: createdMs,
      };
    });
    // firstRatio makes this recompute once real aspects are learned
  }, [post.media, post.createdAt, firstRatio]);

  // The visible photo is contain-fitted inside the media container — the
  // flight should depart from/land on the FITTED rect, not the letterboxed
  // container, so the animation grabs exactly the pixels on screen
  const fittedFrame = useCallback(
    (frame: Frame, index: number): Frame => {
      const media = post.media[index];
      const ratio = media ? mediaAspectCache.get(displayUriFor(media)) : null;
      if (!ratio || frame.width <= 0 || frame.height <= 0) return frame;
      const scale = Math.min(
        frame.width / ratio,
        frame.height,
      );
      const width = scale * ratio;
      const height = scale;
      return {
        x: frame.x + (frame.width - width) / 2,
        y: frame.y + (frame.height - height) / 2,
        width,
        height,
      };
    },
    [post.media],
  );

  const openViewer = useCallback(
    (index: number) => {
      const node = mediaContainerRef.current;
      if (!node) {
        setViewerSession({ index, originFrame: null });
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        setViewerSession({
          index,
          originFrame:
            width > 0 && height > 0
              ? fittedFrame({ x, y, width, height }, index)
              : null,
        });
      });
    },
    [fittedFrame],
  );

  // Dismiss flight returns to the carousel — but only when the carousel
  // still shows the dismissed media; otherwise the viewer's fade fallback
  const getReturnFrame = useCallback(
    (index: number) =>
      new Promise<Frame | null>((resolve) => {
        if (index !== activeIdxRef.current) {
          resolve(null);
          return;
        }
        const node = mediaContainerRef.current;
        if (!node) {
          resolve(null);
          return;
        }
        node.measureInWindow((x, y, width, height) => {
          resolve(
            width > 0 && height > 0
              ? fittedFrame({ x, y, width, height }, index)
              : null,
          );
        });
      }),
    [fittedFrame],
  );

  // Double-tap in the viewer likes the post (never un-likes), matching
  // the album photo grid's double-tap behavior
  const handleViewerDoubleTap = useCallback(() => {
    if (!liked) {
      toggleLike();
    }
  }, [liked, toggleLike]);

  // Carousel ↔ tab-pager gesture ownership. A native horizontal scroll
  // claims edge swipes even when it can't move, which blocked swiping back
  // to the camera from a post's FIRST slide. So while resting on slide 1
  // the carousel's own scrolling is DISABLED (the tab pager owns every
  // horizontal swipe) and a leftward-only pan advances into the photos;
  // from slide 2 onward the carousel scrolls natively in both directions.
  const mediaListRef = useRef<FlatList<PostMedia>>(null);
  const [carouselLocked, setCarouselLocked] = useState(true);

  // FlashList recycles this component across posts — reset per post
  useEffect(() => {
    setActiveIdx(0);
    setCarouselLocked(true);
    mediaListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [post.postId]);

  const handleMomentumEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      setCarouselLocked(e.nativeEvent.contentOffset.x < MEDIA_WIDTH / 2);
    },
    [],
  );

  const advanceCarousel = useCallback(() => {
    setCarouselLocked(false);
    mediaListRef.current?.scrollToIndex({ index: 1, animated: true });
  }, []);

  const firstSlideAdvanceGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(carouselLocked && mediaCount > 1)
        // Leftward-only: activates before the tab pan's ±10 threshold.
        // Rightward and vertical movement fail fast so the tab pager and
        // the feed's vertical scroll keep those.
        .activeOffsetX(-8)
        .failOffsetX(12)
        .failOffsetY([-12, 12])
        .onStart(() => {
          runOnJS(advanceCarousel)();
        }),
    [carouselLocked, mediaCount, advanceCarousel],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<PostMedia> | null | undefined, index: number) => ({
      length: MEDIA_WIDTH,
      offset: MEDIA_WIDTH * index,
      index,
    }),
    [],
  );

  const renderMedia = useCallback(
    ({ item: media, index }: { item: PostMedia; index: number }) => (
      <MediaPage
        item={media}
        height={mediaHeight}
        onPress={() => openViewer(index)}
        onAspect={index === 0 ? handleFirstAspect : undefined}
      />
    ),
    [mediaHeight, handleFirstAspect, openViewer],
  );

  const keyExtractor = useCallback((m: PostMedia) => m.mediaId, []);

  return (
    <FeedCard>
      <FeedCardHeader
        avatarName={page.pageTitle || page.pageHandle}
        avatarUrl={author.avatarUrl}
        title={page.pageTitle || `@${page.pageHandle}`}
        subtitle={`@${page.pageHandle}`}
        createdAt={post.createdAt}
        onPress={openPage}
        ring
      />

      {/* Full-bleed media carousel */}
      <View style={styles.mediaContainer} ref={mediaContainerRef}>
        <GestureDetector gesture={firstSlideAdvanceGesture}>
          <FlatList
            ref={mediaListRef}
            data={post.media}
            renderItem={renderMedia}
            keyExtractor={keyExtractor}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            onMomentumScrollEnd={handleMomentumEnd}
            scrollEventThrottle={16}
            getItemLayout={getItemLayout}
            // Disabled while resting on slide 1 — the tab pager owns
            // horizontal swipes there; the leftward pan above unlocks and
            // advances into the carousel.
            scrollEnabled={!carouselLocked && mediaCount > 1}
            bounces={false}
            overScrollMode="never"
          />
        </GestureDetector>
        {mediaCount > 1 && (
          <View style={styles.counterPill} pointerEvents="none">
            <Text style={styles.counterText}>
              {activeIdx + 1}/{mediaCount}
            </Text>
          </View>
        )}
        <Dots count={mediaCount} active={activeIdx} />
      </View>

      {/* Caption + actions */}
      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} hitSlop={8} onPress={toggleLike}>
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={24}
            color={liked ? "#FF3B30" : "#1c1c1e"}
          />
          {likeCount > 0 && <Text style={styles.actionCount}>{likeCount}</Text>}
        </Pressable>
        <Pressable style={styles.actionBtn} hitSlop={8} onPress={openComments}>
          <Ionicons name="chatbubble-outline" size={21} color="#1c1c1e" />
          {post.commentCount > 0 && (
            <Text style={styles.actionCount}>{post.commentCount}</Text>
          )}
        </Pressable>
      </View>

      {post.caption ? (
        <Text style={styles.caption}>
          <Text style={styles.captionAuthor}>{author.name} </Text>
          {post.caption}
        </Text>
      ) : null}

      {/* Fullscreen viewer — mounted only while a session is open (the
          2000-line viewer's hook tree is far too heavy to run per feed
          row while closed). onClose fires AFTER the return flight lands,
          so unmounting on null never cuts the animation. */}
      {viewerSession !== null && (
        <PhotoViewer
          visible
          assets={viewerAssets}
          initialIndex={viewerSession.index}
          originFrame={viewerSession.originFrame}
          getReturnFrame={getReturnFrame}
          onClose={() => setViewerSession(null)}
          gridCornerRadius={0}
          onDoubleTapAsset={handleViewerDoubleTap}
        />
      )}

      {/* Comments — mounted from first open (sheetPostId is retained so
          the closing sheet never blanks), never before */}
      {sheetPostId !== null && (
        <PostCommentsSheet
          albumId={post.albumId}
          pageId={post.pageId}
          postId={sheetPostId}
          visible={commentsOpen}
          onClose={closeComments}
          currentUserId={currentUserId}
        />
      )}
    </FeedCard>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  mediaContainer: {
    backgroundColor: "#ececee",
  },
  mediaPage: {
    width: MEDIA_WIDTH,
    overflow: "hidden",
  },
  mediaBackdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.68)",
  },
  mediaImage: {
    width: "100%",
    height: "100%",
  },
  counterPill: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  counterText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  dotsPill: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    gap: 5,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },
  dotActive: {
    backgroundColor: "#fff",
  },
  actions: {
    flexDirection: "row",
    marginTop: 10,
    paddingHorizontal: H_PADDING,
    gap: 18,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionCount: {
    color: "#1c1c1e",
    fontSize: 13.5,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  caption: {
    color: "#1c1c1e",
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: H_PADDING,
    lineHeight: 20,
  },
  captionAuthor: {
    fontWeight: "600",
    color: "#000",
  },
});

export default FeedPost;
