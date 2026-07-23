/**
 * Fullscreen filtered gallery — the album's complete grid experience
 * (formerly the Gallery tab itself), pushed from the tab's sectioned
 * overview. A light header names the active filter; below it the
 * PhotoBrowser grid keeps everything the tab had: viewer flights, the
 * like/comment/tag overlay, double-tap like, delete pop choreography,
 * the camera FAB and the add-photos entry.
 *
 * Route params (everything derives from the existing photo/moment
 * queries — no backend involvement):
 *   filter  "all" | "member" | "moment" | "videos" | "loved" | "tag" | "activity"
 *   memberId  required for filter=member (uploader userId)
 *   momentId  required for filter=moment (photos submitted to it)
 *   tag       required for filter=tag
 *   activityId  required for filter=activity (an upload batch from the
 *               album activity feed)
 *   title     header title (falls back to "Gallery")
 */

import React, { memo, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useGetPhotosQuery } from "../api/photo.queries";
import { useGetAlbumActivitiesQuery } from "../api/album.queries";
import { useGetMomentsQuery } from "@/features/moments/api/moments.queries";
import { useAlbumPhotoViewerExtras } from "../hooks/useAlbumPhotoViewerExtras";
import { photoToMediaAsset } from "../utils/mediaAsset";
import { PhotoWithUploader } from "../types/album.types";
import { PhotoBrowser } from "@/features/photos/components";

// Match the configuration the (previously tab-resident) grid always ran
// with — flat, 3 columns. The sectioned month/year mode measurably lagged
// here, so it stays off until profiled.
const NUM_COLUMNS = 3;
const LIST_BOTTOM_PADDING = 100;

export type GalleryFilter =
  | "all"
  | "member"
  | "moment"
  | "videos"
  | "loved"
  | "tag"
  | "activity";

const FullGalleryScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { albumId, filter, memberId, momentId, tag, activityId, title } =
    useLocalSearchParams<{
      albumId: string;
      filter?: GalleryFilter;
      memberId?: string;
      momentId?: string;
      tag?: string;
      activityId?: string;
      title?: string;
    }>();

  const { data: photos, isLoading } = useGetPhotosQuery(albumId!);
  // Moments are only needed to resolve a moment filter's photo set —
  // an empty id keeps the query (and its polling) disabled otherwise
  const { data: moments } = useGetMomentsQuery(
    filter === "moment" && albumId ? albumId : "",
  );
  // Activities resolve an activity filter's photo set — same disable
  // pattern as moments; usually already cached from the Activity tab
  const { data: activities } = useGetAlbumActivitiesQuery(
    filter === "activity" && albumId ? albumId : "",
  );

  const filteredPhotos = useMemo<PhotoWithUploader[]>(() => {
    if (!photos) return [];
    const sorted = [...photos].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    switch (filter) {
      case "member":
        return sorted.filter((p) => p.uploader.userId === memberId);
      case "moment": {
        const moment = moments?.find((m) => m.momentId === momentId);
        if (!moment) return [];
        const ids = new Set(
          moment.events.flatMap((e) => e.submissions.map((s) => s.photoId)),
        );
        return sorted.filter((p) => ids.has(p.photoId));
      }
      case "videos":
        return sorted.filter((p) => p.mediaType === "video");
      case "loved":
        // Stable sort over the recency-ordered list: likeCount desc,
        // ties stay newest-first
        return sorted
          .filter((p) => (p.social?.likeCount ?? 0) > 0)
          .sort(
            (a, b) => (b.social?.likeCount ?? 0) - (a.social?.likeCount ?? 0),
          );
      case "tag":
        return sorted.filter((p) =>
          p.social?.tags?.some((t) => t.tag === tag),
        );
      case "activity": {
        const activity = activities?.find((a) => a.activityId === activityId);
        if (!activity) return [];
        const ids = new Set(activity.photos.map((p) => p.photoId));
        return sorted.filter((p) => ids.has(p.photoId));
      }
      default:
        return sorted;
    }
  }, [photos, filter, memberId, momentId, tag, activityId, moments, activities]);

  const assets = useMemo(
    () => filteredPhotos.map(photoToMediaAsset),
    [filteredPhotos],
  );

  const { renderSocialOverlay, onDoubleTapAsset, poppingIds } =
    useAlbumPhotoViewerExtras(albumId, assets);

  const noun = filter === "videos" ? "video" : "photo";
  const countLabel = `${assets.length} ${noun}${assets.length === 1 ? "" : "s"}`;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color="#000" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title || "Gallery"}
          </Text>
          <Text style={styles.headerCount}>{countLabel}</Text>
        </View>
        {/* Symmetric spacer keeps the title optically centered */}
        <View style={styles.backButton} />
      </View>

      <PhotoBrowser
        assets={assets}
        numColumns={NUM_COLUMNS}
        ListEmptyComponent={isLoading ? null : EmptyFilteredGallery}
        contentBottomPadding={LIST_BOTTOM_PADDING}
        renderSocialOverlay={renderSocialOverlay}
        onDoubleTapAsset={onDoubleTapAsset}
        poppingIds={poppingIds}
      />
      {/* No camera/add-photos FABs here — capture entry points live on
          the Gallery tab only; these filtered views are for browsing */}
    </View>
  );
};

const EmptyFilteredGallery = memo(() => (
  <View style={styles.emptyContainer}>
    <Ionicons name="images-outline" size={48} color="#ccc" />
    <Text style={styles.emptyText}>No photos here yet</Text>
  </View>
));
EmptyFilteredGallery.displayName = "EmptyFilteredGallery";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingBottom: 8,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  headerCount: {
    fontSize: 12,
    color: "#8E8E93",
    fontVariant: ["tabular-nums"],
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    color: "#888",
  },
});

export default FullGalleryScreen;
