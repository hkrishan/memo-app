import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Modal,
  Dimensions,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Share,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Button } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useGetPageQuery } from "@/features/page/api/page.queries";
import { usePagePostsQuery } from "@/features/page/api/pagePost.queries";
import { Page } from "@/features/page/types/page.types";
import { AlbumPagePost } from "@/features/page/types/post.types";
import { stableCacheKey } from "@/lib/imageCache";
import { color, font, radius, screenH, size } from "@/lib/tokens";

/** Cover frame geometry — the preview scales this exact shape up. */
const COVER_SIZE = 72;
const COVER_RADIUS = 20;
const PREVIEW_SIZE = Math.min(
  Dimensions.get("window").width * 0.78,
  320,
);
/** Same corner-to-size ratio as the small frame, so the shape reads identical */
const PREVIEW_RADIUS = PREVIEW_SIZE * (COVER_RADIUS / COVER_SIZE);

/** "On your page" grid: two portrait tiles per row. */
const GRID_GAP = 14;
const TILE_WIDTH =
  (Dimensions.get("window").width - screenH * 2 - GRID_GAP) / 2;
const TILE_HEIGHT = TILE_WIDTH * (4 / 3);
const TILE_RADIUS = 18;

const formatCount = (count: number): string => {
  if (count < 1000) return `${count}`;
  if (count < 10_000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
};

interface PagePageProps {
  contentTop: number;
  /** Mirrors the scroll offset — drives the nav bar's fade */
  pageScrollY?: SharedValue<number>;
}

const PagePage: React.FC<PagePageProps> = ({ contentTop, pageScrollY }) => {
  const { albumId }: { albumId: string } = useLocalSearchParams();
  const { data: page, isLoading, isError, refetch } = useGetPageQuery(albumId);

  // Only a RESOLVED "no page" may show the create hero — while the query
  // is loading or failed, "make a page!" would be a lie about an album
  // that might have one
  if (page == null && isLoading) {
    return (
      <View style={[styles.gridStateContainer, { paddingTop: contentTop + 40 }]}>
        <ActivityIndicator size="small" color={color.textTertiary} />
      </View>
    );
  }
  if (page == null && isError) {
    return (
      <Pressable
        style={[styles.gridStateContainer, { paddingTop: contentTop + 40 }]}
        onPress={() => refetch()}
        accessibilityRole="button"
      >
        <Ionicons
          name="cloud-offline-outline"
          size={40}
          color={color.textTertiary}
        />
        <Text style={styles.errorText}>
          Couldn't load this page — tap to retry
        </Text>
      </Pressable>
    );
  }
  if (page == null) {
    return <NoPage albumId={albumId} />;
  }

  return (
    <PageContent
      albumId={albumId}
      pageId={page.pageId}
      page={page}
      contentTop={contentTop}
      pageScrollY={pageScrollY}
    />
  );
};

const PageContent = ({
  contentTop,
  albumId,
  pageId,
  page,
  pageScrollY,
}: {
  contentTop: number;
  albumId: string;
  pageId: string;
  page: Page;
  pageScrollY?: SharedValue<number>;
}) => {
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (pageScrollY) pageScrollY.value = event.contentOffset.y;
    },
  });

  const {
    data: postsData,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = usePagePostsQuery(albumId, pageId);
  const posts = useMemo(
    () => postsData?.pages.flatMap((batch) => batch.posts) ?? [],
    [postsData],
  );

  // ----- Link actions -----
  const [linkCopied, setLinkCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  const handleCopyLink = useCallback(async () => {
    if (!page.webUrl) return;
    try {
      await Clipboard.setStringAsync(page.webUrl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLinkCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      // Clipboard unavailable — nothing to do
    }
  }, [page.webUrl]);

  const handleShareLink = useCallback(() => {
    if (!page.webUrl) return;
    Share.share(
      Platform.OS === "ios"
        ? { url: page.webUrl }
        : { message: page.webUrl },
    ).catch(() => {});
  }, [page.webUrl]);

  const handlePreview = useCallback(() => {
    if (!page.webUrl) return;
    WebBrowser.openBrowserAsync(page.webUrl).catch(() => {});
  }, [page.webUrl]);

  const handleCreatePost = useCallback(() => {
    router.push(`/album/${albumId}/page/${pageId}/create-post`);
  }, [albumId, pageId]);

  const handleOpenSettings = useCallback(() => {
    router.push(`/album/${albumId}/page/${pageId}/settings`);
  }, [albumId, pageId]);

  const handleOpenPost = useCallback(
    (postId: string, flatIndex: number) => {
      router.push(
        `/album/${albumId}/page/${pageId}/post/${postId}?index=${flatIndex}`,
      );
    },
    [albumId, pageId],
  );

  /** "memo.app/@handle" — the address as people read it, no scheme. */
  const linkLabel = page.webUrl?.replace(/^https?:\/\//, "") ?? null;
  const hasLink = !!page.webUrl;

  return (
    <View style={styles.pagePlain}>
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={color.textPrimary}
            progressViewOffset={contentTop}
          />
        }
      >
        {/* ----- Header ----- */}
        <View style={[styles.headerSection, { paddingTop: contentTop + 24 }]}>
          <View style={styles.profileRow}>
            <PageCoverPhoto page={page} />
            <View style={styles.profileInfo}>
              <Text style={styles.pageTitle} numberOfLines={2}>
                {page.pageTitle ?? `@${page.pageHandle}`}
              </Text>
              <View style={styles.linkLine}>
                {linkLabel != null && (
                  <Text style={styles.linkLabel} numberOfLines={1}>
                    {linkLabel}
                  </Text>
                )}
                <View style={styles.statusPill}>
                  <Ionicons
                    name={page.isPublic ? "globe-outline" : "lock-closed"}
                    size={11}
                    color={color.textPrimary}
                  />
                  <Text style={styles.statusPillText}>
                    {page.isPublic ? "LIVE" : "PRIVATE"}
                  </Text>
                </View>
              </View>
            </View>
            <Pressable
              onPress={handleOpenSettings}
              style={({ pressed }) => [
                styles.settingsButton,
                pressed && styles.pressedDim,
              ]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Page settings"
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={22}
                color={color.textPrimary}
              />
            </Pressable>
          </View>

          {!!page.bio && <Text style={styles.pageBio}>{page.bio}</Text>}

          {/* Copy link + share + preview */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={handleCopyLink}
              disabled={!hasLink}
              style={({ pressed }) => [
                styles.copyLinkButton,
                !hasLink && styles.actionDisabled,
                pressed && styles.pressedDim,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Copy page link"
            >
              <Ionicons
                name={linkCopied ? "checkmark" : "link"}
                size={17}
                color={color.textInverse}
              />
              <Text style={styles.copyLinkText}>
                {linkCopied ? "Copied" : "Copy link"}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleShareLink}
              disabled={!hasLink}
              style={({ pressed }) => [
                styles.circleButton,
                !hasLink && styles.actionDisabled,
                pressed && styles.pressedDim,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Share page link"
            >
              <Ionicons
                name="share-outline"
                size={19}
                color={color.textPrimary}
              />
            </Pressable>
            <Pressable
              onPress={handlePreview}
              disabled={!hasLink}
              style={({ pressed }) => [
                styles.circleButton,
                !hasLink && styles.actionDisabled,
                pressed && styles.pressedDim,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Preview public page"
            >
              <Ionicons name="eye-outline" size={19} color={color.textPrimary} />
            </Pressable>
          </View>
        </View>

        {/* ----- Stats ----- */}
        <View style={styles.rule} />
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            {isLoading ? (
              <ActivityIndicator
                size="small"
                color={color.textTertiary}
                style={styles.statSpinner}
              />
            ) : (
              <Text style={styles.statNumber}>{formatCount(posts.length)}</Text>
            )}
            <Text style={styles.statLabel}>Public</Text>
          </View>
          <View style={styles.statRule} />
          <View style={styles.statCell}>
            <Text style={styles.statNumber}>
              {formatCount(page.viewCount ?? 0)}
            </Text>
            <Text style={styles.statLabel}>Views</Text>
          </View>
          <View style={styles.statRule} />
          <View style={styles.statCell}>
            <Text style={styles.statNumber}>
              {formatCount(page.saveCount ?? 0)}
            </Text>
            <Text style={styles.statLabel}>Saves</Text>
          </View>
        </View>
        <View style={styles.rule} />

        {/* ----- On your page ----- */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>On your page</Text>
        </View>

        {isLoading ? (
          <View style={styles.gridStateContainer}>
            <ActivityIndicator size="large" color={color.textPrimary} />
          </View>
        ) : isError && posts.length === 0 ? (
          // Cached posts beat an error wall — only a truly empty failure
          // gets the message (pull-to-refresh above is the retry)
          <View style={styles.gridStateContainer}>
            <Ionicons
              name="cloud-offline-outline"
              size={40}
              color={color.textTertiary}
            />
            <Text style={styles.errorText}>
              Couldn't load your page — check your connection
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {posts.map((post, flatIndex) => (
              <PageTile
                key={post.postId}
                post={post}
                flatIndex={flatIndex}
                onOpen={handleOpenPost}
              />
            ))}
            <Pressable
              onPress={handleCreatePost}
              style={({ pressed }) => [
                styles.addTile,
                pressed && styles.pressedDim,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add photos to your page"
            >
              <Ionicons name="add" size={24} color={color.textTertiary} />
              <Text style={styles.addTileText}>Add from album</Text>
            </Pressable>
          </View>
        )}
      </Animated.ScrollView>

      <Pressable
        onPress={handleCreatePost}
        style={({ pressed }) => [styles.actionPill, pressed && styles.pressedDim]}
        accessibilityRole="button"
        accessibilityLabel="Add to page"
      >
        <Ionicons name="add" size={20} color={color.textInverse} />
        <Text style={styles.actionPillText}>Add to page</Text>
      </Pressable>
    </View>
  );
};

/** One post on the page: fixed portrait crop. */
const PageTile = React.memo<{
  post: AlbumPagePost;
  flatIndex: number;
  onOpen: (postId: string, flatIndex: number) => void;
}>(({ post, flatIndex, onOpen }) => {
  const firstMedia = post.media[0];

  const handlePress = useCallback(() => {
    onOpen(post.postId, flatIndex);
  }, [onOpen, post.postId, flatIndex]);

  if (!firstMedia) return null;
  const uri = firstMedia.thumbnailUrl ?? firstMedia.url;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressedDim]}
      accessibilityRole="imagebutton"
    >
      <ExpoImage
        source={{ uri, cacheKey: stableCacheKey(uri) }}
        style={styles.tileImage}
        contentFit="cover"
        transition={180}
        cachePolicy="memory-disk"
      />
      {post.media.length > 1 && (
        <View style={styles.multipleIndicator}>
          <Ionicons name="copy" size={14} color="#fff" />
        </View>
      )}
    </Pressable>
  );
});
PageTile.displayName = "PageTile";

const NoPage = ({ albumId }: { albumId: string }) => {
  const handleCreatePage = () => {
    router.push(`/album/${albumId}/page/create`);
  };
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      {/* Static backdrop. This page sits pre-mounted in the album's
          PagerView — the old looping video + live fullscreen blur decoded
          and re-composited every frame while the user was on the Gallery
          tab next door. */}
      <LinearGradient
        colors={["#f5f3ef", "#e8e4f3", "#f0eef7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={{
          paddingHorizontal: 40,
          gap: 10,
        }}
      >
        <Text
          style={{
            fontSize: 22,
            ...font.semibold,
            textAlign: "center",
          }}
        >
          Create a public page for your album
        </Text>
        <Text
          style={{
            textAlign: "center",
          }}
        >
          Choose what photos to include on your page and share it with others
        </Text>
        <Button
          mode="contained"
          style={{ marginTop: 10 }}
          onPress={handleCreatePage}
        >
          Create Page
        </Button>
      </View>
    </View>
  );
};

// Rounded square matching the gallery's album cover (AlbumHeader/tiles) —
// same shape language, hairline edge, quiet placeholder; no gradient ring.
// Tapping it opens an enlarged preview in the exact same shape.
type OriginFrame = { x: number; y: number; width: number; height: number };

const PageCoverPhoto = ({ page }: { page: Page }) => {
  const thumbUri = page?.coverPhoto?.thumbnailUrl ?? page?.coverPhoto?.url;
  const fullUri = page?.coverPhoto?.url ?? thumbUri;
  const [previewOrigin, setPreviewOrigin] = useState<OriginFrame | null>(null);
  const frameRef = React.useRef<View>(null);

  // Measure the small frame at press time — the preview flies out of (and
  // back into) this exact rect
  const handlePress = useCallback(() => {
    if (!fullUri) return;
    Haptics.selectionAsync();
    const node = frameRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) => {
      setPreviewOrigin(
        width > 0 && height > 0
          ? { x, y, width, height }
          : { x: 0, y: 0, width: 0, height: 0 },
      );
    });
  }, [fullUri]);

  return (
    <>
      <Pressable
        ref={frameRef}
        onPress={handlePress}
        disabled={!fullUri}
        style={({ pressed }) => [
          styles.coverPhotoFrame,
          pressed && styles.coverPhotoPressed,
        ]}
        accessibilityRole="imagebutton"
        accessibilityLabel="View page picture"
      >
        {thumbUri ? (
          <ExpoImage
            source={{ uri: thumbUri, cacheKey: stableCacheKey(thumbUri) }}
            style={styles.coverPhotoImage}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.coverPhotoFallback}>
            <Ionicons name="images-outline" size={24} color="#C7C7CC" />
          </View>
        )}
        <View style={styles.coverPhotoEdge} pointerEvents="none" />
      </Pressable>
      {fullUri != null && previewOrigin != null && (
        <CoverPreviewModal
          uri={fullUri}
          thumbUri={thumbUri ?? undefined}
          origin={previewOrigin}
          onClose={() => setPreviewOrigin(null)}
        />
      )}
    </>
  );
};

/**
 * Enlarged cover preview that FLIES out of the small frame: position, size
 * and corner radius all interpolate from the measured origin rect to the
 * centered preview rect (the same shape at both ends), and fly back home on
 * dismiss. The backdrop blur/dim fades with the flight.
 */
const CoverPreviewModal = ({
  uri,
  thumbUri,
  origin,
  onClose,
}: {
  uri: string;
  thumbUri?: string;
  origin: OriginFrame;
  onClose: () => void;
}) => {
  const progress = useSharedValue(0);

  const window = Dimensions.get("window");
  const finalX = (window.width - PREVIEW_SIZE) / 2;
  const finalY = (window.height - PREVIEW_SIZE) / 2;

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  const handleDismiss = useCallback(() => {
    progress.value = withTiming(
      0,
      { duration: 210, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(onClose)();
        }
      },
    );
  }, [progress, onClose]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const cardStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      left: origin.x + (finalX - origin.x) * p,
      top: origin.y + (finalY - origin.y) * p,
      width: origin.width + (PREVIEW_SIZE - origin.width) * p,
      height: origin.height + (PREVIEW_SIZE - origin.height) * p,
      borderRadius: COVER_RADIUS + (PREVIEW_RADIUS - COVER_RADIUS) * p,
    };
  });

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={40}
          tint="dark"
        />
        <View style={styles.previewDim} />
      </Animated.View>
      {/* Tap anywhere — backdrop or the flying card itself — to dismiss */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss}>
        <Animated.View style={[styles.previewCard, cardStyle]}>
          <ExpoImage
            source={{ uri, cacheKey: stableCacheKey(uri) }}
            placeholder={thumbUri ? { uri: thumbUri } : undefined}
            style={styles.coverPhotoImage}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
          />
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  pagePlain: {
    flex: 1,
    width: "100%",
    backgroundColor: color.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 180,
  },
  headerSection: {
    paddingHorizontal: screenH,
    paddingBottom: 20,
  },
  profileRow: {
    flexDirection: "row",
    gap: 16,
  },
  profileInfo: {
    flex: 1,
    justifyContent: "center",
  },
  settingsButton: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  pageTitle: {
    fontSize: 24,
    ...font.bold,
    letterSpacing: -0.4,
    color: color.textPrimary,
    marginBottom: 5,
  },
  linkLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  linkLabel: {
    flexShrink: 1,
    fontSize: 15,
    ...font.medium,
    color: color.textTertiary,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: color.surface1,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 11,
    ...font.semibold,
    letterSpacing: 0.8,
    color: color.textPrimary,
  },
  pageBio: {
    fontSize: 14,
    lineHeight: 20,
    ...font.regular,
    color: color.textSecondary,
    marginTop: 12,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  copyLinkButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: size.btnLg,
    borderRadius: radius.full,
    backgroundColor: color.bgDark,
  },
  copyLinkText: {
    fontSize: 16,
    ...font.semibold,
    color: color.textInverse,
  },
  circleButton: {
    width: size.btnLg,
    height: size.btnLg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: color.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  actionDisabled: {
    opacity: 0.35,
  },
  pressedDim: {
    opacity: 0.7,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
    marginHorizontal: screenH,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: screenH,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
  },
  statRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: color.separator,
  },
  statNumber: {
    fontSize: 20,
    ...font.bold,
    letterSpacing: -0.4,
    color: color.textPrimary,
  },
  statSpinner: {
    height: 24,
  },
  statLabel: {
    fontSize: 10,
    ...font.semibold,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: color.textTertiary,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: screenH,
    paddingTop: 24,
    paddingBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    ...font.semibold,
    color: color.textPrimary,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
    paddingHorizontal: screenH,
  },
  gridStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    ...font.regular,
    color: color.danger,
  },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: TILE_RADIUS,
    overflow: "hidden",
    backgroundColor: color.surface1,
  },
  tileImage: {
    width: "100%",
    height: "100%",
  },
  multipleIndicator: {
    position: "absolute",
    top: 10,
    right: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
  },
  addTile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: TILE_RADIUS,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#C9C9C6",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addTileText: {
    fontSize: 13,
    ...font.medium,
    color: color.textSecondary,
  },
  coverPhotoFrame: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: COVER_RADIUS,
    overflow: "hidden",
    backgroundColor: "#F1F1F3",
  },
  coverPhotoPressed: {
    opacity: 0.75,
  },
  coverPhotoImage: {
    width: "100%",
    height: "100%",
  },
  coverPhotoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  coverPhotoEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: COVER_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.08)",
  },
  previewDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  previewCard: {
    position: "absolute",
    overflow: "hidden",
    backgroundColor: "#1c1c1e",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.28)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 16,
  },
  actionPill: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 52,
    paddingHorizontal: 24,
    borderRadius: radius.full,
    backgroundColor: color.bgDark,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  actionPillText: {
    fontSize: 16,
    ...font.semibold,
    color: color.textInverse,
  },
});

export default PagePage;
