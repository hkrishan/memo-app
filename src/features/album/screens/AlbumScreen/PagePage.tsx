import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  Image,
  Pressable,
  Modal,
  Dimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Button } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useGetPageQuery } from "@/features/page/api/page.queries";
import { Page } from "@/features/page/types/page.types";
import PostGrid from "@/features/page/components/PostGrid";
import { stableCacheKey } from "@/lib/imageCache";

/** Cover frame geometry — the preview scales this exact shape up. */
const COVER_SIZE = 72;
const COVER_RADIUS = 20;
const PREVIEW_SIZE = Math.min(
  Dimensions.get("window").width * 0.78,
  320,
);
/** Same corner-to-size ratio as the small frame, so the shape reads identical */
const PREVIEW_RADIUS = PREVIEW_SIZE * (COVER_RADIUS / COVER_SIZE);

interface PagePageProps {
  contentTop: number;
  /** Mirrors the post grid's scroll offset — drives the nav bar's fade */
  pageScrollY?: SharedValue<number>;
}

const PagePage: React.FC<PagePageProps> = ({ contentTop, pageScrollY }) => {
  const { albumId }: { albumId: string } = useLocalSearchParams();
  const { data: page } = useGetPageQuery(albumId);

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
  const handleCreatePost = useCallback(() => {
    router.push(`/album/${albumId}/page/${pageId}/create-post`);
  }, [albumId, pageId]);

  const handleOpenSettings = useCallback(() => {
    router.push(`/album/${albumId}/page/${pageId}/settings`);
  }, [albumId, pageId]);

  const coverUri =
    page?.coverPhoto?.thumbnailUrl ?? page?.coverPhoto?.url ?? null;

  const headerComponent = useMemo(
    () => (
      // The header owns the top inset so its blurred-cover backdrop reaches
      // the very top of the screen and slides under the frosted nav bar
      <View style={[styles.headerSection, { paddingTop: contentTop + 20 }]}>
        {coverUri != null && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* The page's own cover, blown up and heavily blurred, as the
                header's hero backdrop; a light frost keeps text legible */}
            <ExpoImage
              source={{ uri: coverUri, cacheKey: stableCacheKey(coverUri) }}
              style={styles.headerBackdropImage}
              contentFit="cover"
              blurRadius={45}
              transition={200}
              cachePolicy="memory-disk"
            />
            <View style={styles.headerBackdropFrost} />
          </View>
        )}
        <View style={styles.profileRow}>
          <PageCoverPhoto page={page} />
          <View style={styles.profileInfo}>
            <Text style={styles.pageTitle}>{page?.pageTitle}</Text>
            <Text style={styles.pageHandle}>@{page?.pageHandle}</Text>
          </View>
          <Pressable
            onPress={handleOpenSettings}
            style={styles.settingsButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color="#000" />
          </Pressable>
        </View>
        {!!page?.bio && <Text style={styles.pageBio}>{page.bio}</Text>}
      </View>
    ),
    [page, coverUri, contentTop, handleOpenSettings]
  );

  return (
    <View style={styles.pagePlain}>
      <PostGrid
        albumId={albumId}
        pageId={pageId}
        ListHeaderComponent={headerComponent}
        contentContainerStyle={{ paddingBottom: 100 }}
        scrollY={pageScrollY}
      />

      {/* FAB for creating posts */}
      <Pressable
        onPress={handleCreatePost}
        style={styles.fab}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
};

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
            fontWeight: "600",
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
    backgroundColor: "#fff",
  },
  headerSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
    marginBottom: 2,
    overflow: "hidden",
  },
  headerBackdropImage: {
    ...StyleSheet.absoluteFillObject,
    // Overscale so the blur never shows hard edges at the borders
    transform: [{ scale: 1.25 }],
  },
  headerBackdropFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.62)",
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
    marginBottom: 4,
  },
  pageHandle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  pageBio: {
    fontSize: 14,
    lineHeight: 20,
    color: "#333",
    marginTop: 12,
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
  fab: {
    position: "absolute",
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default PagePage;
