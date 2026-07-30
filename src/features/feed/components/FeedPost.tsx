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
import {
  useDeletePostMutation,
  useTogglePostLikeMutation,
} from "@/features/page/api/pagePost.queries";
import PostCommentsSheet from "@/features/page/components/PostCommentsSheet";
import PageMembersSheet from "@/features/page/components/PageMembersSheet";
import { confirmDeletePost } from "@/features/page/components/confirmDeletePost";
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
  // Whether the full-res image has painted — gates the thumbnail underlay
  const [loaded, setLoaded] = useState(false);

  const handleLoad = useCallback(
    (event: { source?: { width?: number; height?: number } }) => {
      const w = event.source?.width ?? 0;
      const h = event.source?.height ?? 0;
      if (w > 0 && h > 0) {
        const ratio = w / h;
        mediaAspectCache.set(uri, ratio);
        onAspect?.(ratio);
      }
      setLoaded(true);
    },
    [uri, onAspect],
  );

  // Full-res load failed (expired signed URL, network blip). Without this
  // the slide sits on the gray blurhash placeholder forever — and never
  // learns its aspect, which the viewer's dismiss return flight needs.
  // Same remount-with-backoff as PhotoPage; a query refetch (fresh
  // signature) changes the uri and resets the budget.
  const [fullResRetry, setFullResRetry] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleError = useCallback(() => {
    if (retryCountRef.current >= 3) return;
    retryCountRef.current += 1;
    const attempt = retryCountRef.current;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(
      () => setFullResRetry((n) => n + 1),
      400 * attempt,
    );
  }, []);
  useEffect(() => {
    setLoaded(false);
    retryCountRef.current = 0;
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [uri]);

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
      {/* Sharp thumbnail underlay until the full-res paints, so a slow or
          failing full-res load never shows a flat gray slide (videos skip
          this — their display uri IS the thumbnail) */}
      {!loaded && item.thumbnailUrl && item.thumbnailUrl !== uri && (
        <CachedImage
          uri={item.thumbnailUrl}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          showPlaceholder={false}
        />
      )}
      <CachedImage
        key={`${uri}#${fullResRetry}`}
        uri={uri}
        style={styles.mediaImage}
        contentFit="contain"
        onLoad={handleLoad}
        onError={handleError}
      />
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Carousel indicators: segmented progress bars along the photo's bottom
// edge (one segment per slide, the active one solid) + "1/3" counter pill
// ---------------------------------------------------------------------------

const ProgressBars = memo<{ count: number; active: number }>(
  ({ count, active }) => {
    if (count <= 1) return null;
    return (
      <View style={styles.barsRow} pointerEvents="none">
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={[styles.bar, i === active && styles.barActive]} />
        ))}
      </View>
    );
  },
);

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
  // the window frame the flight departs from and returns to. Assets are
  // snapshotted at open (see buildViewerAssets)
  const [viewerSession, setViewerSession] = useState<{
    index: number;
    originFrame: Frame | null;
    assets: MediaAsset[];
  } | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Set at first open and retained: the comments query keys off this, so
  // merely scrolling the feed (sheet never opened) fetches nothing, and
  // nulling it at close would blank the sheet mid-dismiss
  const [sheetPostId, setSheetPostId] = useState<string | null>(null);
  // Members sheet — same mount-at-first-open pattern as the comments sheet
  // (visible drives open/close so the dismiss animation isn't cut short)
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersMounted, setMembersMounted] = useState(false);
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
    // Same haptic as every other like surface (PhotoSocialBar, PostCard)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const openMembers = useCallback(() => {
    setMembersMounted(true);
    setMembersOpen(true);
  }, []);
  const closeMembers = useCallback(() => setMembersOpen(false), []);

  // FlashList recycles this component across posts — a recycled row must
  // not inherit the previous post's open/mounted sheet
  useEffect(() => {
    setMembersOpen(false);
    setMembersMounted(false);
  }, [post.postId]);

  // Delete (author or page owner — the server sets canDelete accordingly)
  const deleteMutation = useDeletePostMutation(post.albumId, post.pageId);
  const handleDeletePress = useCallback(() => {
    confirmDeletePost(() => deleteMutation.mutate({ postId: post.postId }));
  }, [deleteMutation, post.postId]);

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
  // needs only the ratio); unknown dims fall back to the viewer's fades.
  // Built at TAP time, not memoized — aspects are learned as each slide's
  // image loads, and a memo (previously keyed on firstRatio) froze slides
  // 2+ at 0×0 dims, which made the viewer skip getReturnFrame and dismiss
  // off-screen instead of flying back to the carousel.
  const buildViewerAssets = useCallback((): MediaAsset[] => {
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
  }, [post.media, post.createdAt]);

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
      const assets = buildViewerAssets();
      const node = mediaContainerRef.current;
      if (!node) {
        setViewerSession({ index, originFrame: null, assets });
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        setViewerSession({
          index,
          originFrame:
            width > 0 && height > 0
              ? fittedFrame({ x, y, width, height }, index)
              : null,
          assets,
        });
      });
    },
    [buildViewerAssets, fittedFrame],
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

  // The carousel follows the viewer's swipes (settled index) so the
  // dismiss flight always lands on the visible slide — without this,
  // dismissing after swiping inside the viewer found a stale carousel
  // page (getReturnFrame bailed) and fell back to a plain fade.
  const handleViewerIndexChange = useCallback((index: number) => {
    if (index === activeIdxRef.current) return;
    activeIdxRef.current = index;
    setActiveIdx(index);
    // Keep the slide-1 gesture contract intact after the viewer closes
    setCarouselLocked(index === 0);
    mediaListRef.current?.scrollToOffset({
      offset: index * MEDIA_WIDTH,
      animated: false,
    });
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
        avatarUrl={page.coverPhotoUrl ?? null}
        title={page.pageTitle || `@${page.pageHandle}`}
        subtitle={`@${page.pageHandle}`}
        createdAt={post.createdAt}
        onPress={openPage}
        page
        rightAccessory={
          post.canDelete ? (
            <Pressable
              onPress={handleDeletePress}
              hitSlop={10}
              style={({ pressed }) => [
                styles.moreBtn,
                pressed && styles.actionBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Delete post"
            >
              <Ionicons name="ellipsis-horizontal" size={18} color="#8e8e93" />
            </Pressable>
          ) : null
        }
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
        <ProgressBars count={mediaCount} active={activeIdx} />
      </View>

      {/* Caption above the actions row (editorial order, per the feed
          mockups) — plain ink text, no author prefix (the header already
          carries the identity) */}
      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}

      {post.locationName ? (
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={13} color="#8e8e93" />
          <Text style={styles.locationText} numberOfLines={1}>
            {post.locationName}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.actionBtn,
            pressed && styles.actionBtnPressed,
          ]}
          hitSlop={8}
          onPress={toggleLike}
          accessibilityRole="button"
          accessibilityLabel={liked ? "Unlike" : "Like"}
        >
          {/* Liked = solid ink, not red — the feed stays monochrome */}
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={24}
            color="#111111"
          />
          {likeCount > 0 && <Text style={styles.actionCount}>{likeCount}</Text>}
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.actionBtn,
            pressed && styles.actionBtnPressed,
          ]}
          hitSlop={8}
          onPress={openComments}
          accessibilityRole="button"
          accessibilityLabel="Comments"
        >
          <Ionicons name="chatbubble-outline" size={21} color="#111111" />
          {post.commentCount > 0 && (
            <Text style={styles.actionCount}>{post.commentCount}</Text>
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.actionBtn,
            styles.membersBtn,
            pressed && styles.actionBtnPressed,
          ]}
          hitSlop={8}
          onPress={openMembers}
          accessibilityRole="button"
          accessibilityLabel="See who's in this album"
        >
          <Ionicons name="people-outline" size={23} color="#111111" />
        </Pressable>
      </View>

      {/* Fullscreen viewer — mounted only while a session is open (the
          2000-line viewer's hook tree is far too heavy to run per feed
          row while closed). onClose fires AFTER the return flight lands,
          so unmounting on null never cuts the animation. */}
      {viewerSession !== null && (
        <PhotoViewer
          visible
          assets={viewerSession.assets}
          initialIndex={viewerSession.index}
          originFrame={viewerSession.originFrame}
          getReturnFrame={getReturnFrame}
          onActiveIndexChange={handleViewerIndexChange}
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
          postAuthorId={post.authorId}
        />
      )}

      {/* Album members — mounted from first open, never before */}
      {membersMounted && (
        <PageMembersSheet
          albumId={post.albumId}
          pageId={post.pageId}
          visible={membersOpen}
          onClose={closeMembers}
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
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  barsRow: {
    position: "absolute",
    bottom: 10,
    left: 12,
    right: 12,
    flexDirection: "row",
    gap: 6,
  },
  bar: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    // Keeps the inactive segments legible over near-white photos
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 1,
  },
  barActive: {
    backgroundColor: "#fff",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingHorizontal: H_PADDING,
    gap: 20,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionBtnPressed: {
    opacity: 0.5,
    transform: [{ scale: 0.94 }],
  },
  // Pinned to the right edge of the actions row, across from like/comment
  membersBtn: {
    marginLeft: "auto",
  },
  moreBtn: {
    marginLeft: 8,
    padding: 4,
  },
  actionCount: {
    color: "#111111",
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  caption: {
    color: "#111111",
    fontSize: 15,
    marginTop: 14,
    paddingHorizontal: H_PADDING,
    lineHeight: 21,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 6,
    paddingHorizontal: H_PADDING,
  },
  locationText: {
    flexShrink: 1,
    fontSize: 13,
    color: "#8e8e93",
  },
});

export default FeedPost;
