import React, {
  memo,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react";
import { formatRelativeTime } from "../../components/photoSocial/socialUtils";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  InteractionManager,
  Pressable,
} from "react-native";
import { Text } from "react-native-paper";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGetAlbumActivitiesQuery } from "../../api/album.queries";
import { AlbumActivity, AlbumPhoto } from "../../types/album.types";
import ActivityFilterBar, {
  ActivityMediaFilter,
  ActivityPerson,
  ActivitySort,
} from "../../components/ActivityFilterBar";
import { PhotoViewer } from "@/features/photos/components";
import { MediaAsset } from "@/features/album/hooks";
import { useAlbumPhotoViewerExtras } from "../../hooks/useAlbumPhotoViewerExtras";

// Batches this small open straight in the fullscreen viewer (with the
// filmstrip carousel); bigger ones go to the filtered gallery grid.
const MAX_VIEWER_PHOTOS = 3;

// AlbumPhoto → viewer asset. Mirrors photoToMediaAsset, which needs the
// uploader-shaped photo the activity payload doesn't carry.
const activityPhotoToAsset = (p: AlbumPhoto): MediaAsset => ({
  id: p.photoId,
  uri: p.url,
  // Videos must never fall back to the video URL as a "thumbnail" —
  // expo-image can't render it (see photoToMediaAsset)
  thumbnailUrl:
    p.mediaType === "video"
      ? (p.thumbnailUrl ?? null)
      : (p.thumbnailUrl ?? p.url),
  mediaType: p.mediaType === "video" ? "video" : "photo",
  width: 0,
  height: 0,
  duration: 0,
  creationTime: new Date(p.createdAt).getTime(),
  modificationTime: new Date(p.createdAt).getTime(),
});

interface ActivityPageProps {
  contentTop: number;
  albumId?: string;
  isActive?: boolean;
}

// Pre-computed activity text based on type and count. The noun follows the
// active media filter ("added 2 videos" when only its videos are shown).
const getActivityText = (
  type: string,
  photoCount: number,
  noun: "photo" | "video" = "photo",
): string => {
  if (type === "photos_added") {
    return photoCount === 1 ? `added a ${noun}` : `added ${photoCount} ${noun}s`;
  }
  return "performed an action";
};

// Pre-computed activity icon based on type
const getActivityIcon = (type: string): keyof typeof Ionicons.glyphMap => {
  return type === "photos_added" ? "images" : "ellipsis-horizontal";
};


// Photo thumbnail - individually memoized
const Thumbnail = memo<{
  photo: AlbumPhoto;
  showOverlay: boolean;
  remainingCount: number;
}>(
  ({ photo, showOverlay, remainingCount }) => (
    <View style={showOverlay ? styles.thumbnailWithOverlay : undefined}>
      <Image
        source={{ uri: photo.thumbnailUrl }}
        style={styles.thumbnail}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={photo.photoId}
      />
      {showOverlay && (
        <View style={styles.thumbnailOverlay}>
          <Text style={styles.thumbnailOverlayText}>+{remainingCount}</Text>
        </View>
      )}
    </View>
  ),
  (prev, next) =>
    prev.photo.photoId === next.photo.photoId &&
    prev.showOverlay === next.showOverlay &&
    prev.remainingCount === next.remainingCount,
);

// Photo thumbnail grid - memoized with deep comparison
const PhotoThumbnails = memo<{ photos: AlbumPhoto[]; totalCount: number }>(
  ({ photos, totalCount }) => {
    const remainingCount = totalCount - 4;

    return (
      <View style={styles.thumbnailsContainer}>
        {photos.slice(0, 4).map((photo, index) => (
          <Thumbnail
            key={photo.photoId}
            photo={photo}
            showOverlay={index === 3 && remainingCount > 0}
            remainingCount={remainingCount}
          />
        ))}
      </View>
    );
  },
  (prev, next) =>
    prev.totalCount === next.totalCount &&
    prev.photos.length === next.photos.length &&
    prev.photos[0]?.photoId === next.photos[0]?.photoId,
);

// User avatar - memoized
const UserAvatar = memo<{ avatarUrl: string | null; activityType: string }>(
  ({ avatarUrl, activityType }) => (
    <View style={styles.avatarContainer}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={styles.avatar}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={20} color="#999" />
        </View>
      )}
      <View style={styles.activityIconBadge}>
        <Ionicons name={getActivityIcon(activityType)} size={10} color="#fff" />
      </View>
    </View>
  ),
  (prev, next) =>
    prev.avatarUrl === next.avatarUrl &&
    prev.activityType === next.activityType,
);

// Single activity item - deeply memoized. Tapping a photos_added row
// opens the batch fullscreen: small batches straight in the viewer
// (filmstrip carousel), bigger ones as a filtered gallery grid.
const ActivityItem = memo<{
  activity: AlbumActivity;
  albumId?: string;
  noun?: "photo" | "video";
  onOpenViewer: (photos: AlbumPhoto[]) => void;
}>(
  ({ activity, albumId, noun, onOpenViewer }) => {
    const router = useRouter();
    const { activityId, user, photos, photoCount, createdAt, type } = activity;
    const activityText = getActivityText(type, photoCount, noun);
    const timestamp = formatRelativeTime(createdAt);

    const canOpen = type === "photos_added" && !!albumId;
    const openBatch = () => {
      if (!canOpen) return;
      if (photoCount <= MAX_VIEWER_PHOTOS && photos.length > 0) {
        onOpenViewer(photos);
        return;
      }
      router.push({
        pathname: `/album/${albumId}/gallery`,
        params: {
          filter: "activity",
          activityId,
          title: `Added by ${user.name}`,
        },
      });
    };

    return (
      <Pressable
        style={({ pressed }) => [
          styles.activityItem,
          pressed && canOpen && styles.activityItemPressed,
        ]}
        onPress={openBatch}
        disabled={!canOpen}
        accessibilityRole="button"
        accessibilityLabel={`${user.name} ${activityText}. View photos`}
      >
        <UserAvatar avatarUrl={user.avatarUrl} activityType={type} />
        <View style={styles.activityContent}>
          <View style={styles.activityHeader}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.activityText}> {activityText}</Text>
          </View>
          <Text style={styles.timestamp}>{timestamp}</Text>
          {photos && photos.length > 0 && (
            <PhotoThumbnails photos={photos} totalCount={photoCount} />
          )}
        </View>
      </Pressable>
    );
  },
  (prev, next) =>
    prev.activity.activityId === next.activity.activityId &&
    // Media-filtered copies shrink the photo set under a stable activityId
    prev.activity.photos === next.activity.photos &&
    prev.albumId === next.albumId &&
    prev.noun === next.noun &&
    prev.onOpenViewer === next.onOpenViewer,
);

// Static components - no props, never re-render
const EmptyState = memo(() => (
  <View style={styles.emptyState}>
    <Ionicons name="pulse-outline" size={48} color="#ccc" />
    <Text style={styles.emptyTitle}>No activity yet</Text>
    <Text style={styles.emptySubtitle}>
      Activity will appear here when members add photos or make changes.
    </Text>
  </View>
));

const LoadingState = memo(() => (
  <View style={styles.loadingState}>
    <ActivityIndicator size="small" color="#666" />
    <Text style={styles.loadingText}>Loading activity...</Text>
  </View>
));

const ErrorState = memo<{ onRetry: () => void }>(({ onRetry }) => (
  <View style={styles.emptyState}>
    <Ionicons name="cloud-offline-outline" size={48} color="#ccc" />
    <Text style={styles.emptyTitle}>Couldn't load activity</Text>
    <Text style={styles.emptySubtitle}>
      Check your connection and try again.
    </Text>
    <Pressable
      onPress={onRetry}
      style={({ pressed }) => [
        styles.resetButton,
        pressed && styles.activityItemPressed,
      ]}
      accessibilityRole="button"
    >
      <Text style={styles.resetButtonLabel}>Try again</Text>
    </Pressable>
  </View>
));

const SectionHeader = memo(() => (
  <Text style={styles.sectionTitle}>Recent Activity</Text>
));

// Every filter combination can come up empty without the album being empty
const FilteredEmptyState = memo<{ onReset: () => void }>(({ onReset }) => (
  <View style={styles.emptyState}>
    <Ionicons name="funnel-outline" size={40} color="#ccc" />
    <Text style={styles.emptyTitle}>Nothing matches</Text>
    <Text style={styles.emptySubtitle}>
      No activity matches these filters.
    </Text>
    <Pressable
      onPress={onReset}
      style={({ pressed }) => [
        styles.resetButton,
        pressed && styles.activityItemPressed,
      ]}
      accessibilityRole="button"
    >
      <Text style={styles.resetButtonLabel}>Reset filters</Text>
    </Pressable>
  </View>
));

// Main component - memoized
const ActivityPage = memo<ActivityPageProps>(
  ({ contentTop, albumId, isActive = true }) => {
    // Track if we've ever been active - once true, always render content
    const hasBeenActive = useRef(false);
    const [readyToRender, setReadyToRender] = useState(false);

    // Once active, mark as has been active and defer rendering until after animations
    useEffect(() => {
      if (isActive && !hasBeenActive.current) {
        hasBeenActive.current = true;
        const task = InteractionManager.runAfterInteractions(() => {
          setReadyToRender(true);
        });
        return () => task.cancel();
      }
    }, [isActive]);

    const {
      data: activities,
      isLoading,
      isError,
      refetch,
    } = useGetAlbumActivitiesQuery(albumId ?? "");

    // Filters + sort — per-visit state, applied client-side (the activity
    // payload already carries the actor and each photo's mediaType)
    const [sort, setSort] = useState<ActivitySort>("newest");
    const [personId, setPersonId] = useState<string | null>(null);
    const [media, setMedia] = useState<ActivityMediaFilter>("all");
    const resetFilters = useCallback(() => {
      setSort("newest");
      setPersonId(null);
      setMedia("all");
    }, []);

    // Distinct actors, in order of first appearance
    const people = useMemo<ActivityPerson[]>(() => {
      const seen = new Map<string, ActivityPerson>();
      for (const activity of activities ?? []) {
        if (!seen.has(activity.user.userId)) {
          seen.set(activity.user.userId, {
            userId: activity.user.userId,
            name: activity.user.name,
          });
        }
      }
      return [...seen.values()];
    }, [activities]);

    const displayActivities = useMemo<AlbumActivity[]>(() => {
      let list = activities ?? [];
      if (personId) {
        list = list.filter((a) => a.user.userId === personId);
      }
      if (media !== "all") {
        const wantVideo = media === "videos";
        list = list
          .map((a) => {
            const photos = a.photos.filter(
              (p) => (p.mediaType === "video") === wantVideo,
            );
            // photoCount follows the filtered set so row text and the "+n"
            // overlay describe what's actually shown
            return { ...a, photos, photoCount: photos.length };
          })
          .filter((a) => a.photos.length > 0);
      }
      const byCreatedAt = (a: AlbumActivity, b: AlbumActivity) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return [...list].sort(
        sort === "oldest" ? byCreatedAt : (a, b) => byCreatedAt(b, a),
      );
    }, [activities, personId, media, sort]);

    const noun = media === "videos" ? ("video" as const) : ("photo" as const);

    // Small-batch rows open their photos right here in the viewer
    const [viewerPhotos, setViewerPhotos] = useState<AlbumPhoto[] | null>(
      null,
    );
    const openViewer = useCallback(
      (photos: AlbumPhoto[]) => setViewerPhotos(photos),
      [],
    );
    const closeViewer = useCallback(() => setViewerPhotos(null), []);
    const viewerAssets = useMemo(
      () => (viewerPhotos ?? []).map(activityPhotoToAsset),
      [viewerPhotos],
    );
    // Same album-aware viewer layer as the gallery: like/comment/tag
    // overlay and double-tap like
    const { renderSocialOverlay, renderPageAttribution, onDoubleTapAsset } =
      useAlbumPhotoViewerExtras(albumId, viewerAssets);

    // Memoize content container style
    const contentContainerStyle = useMemo(
      () => ({
        paddingTop: contentTop,
        paddingBottom: 100,
        paddingHorizontal: 16,
        flexGrow: 1,
      }),
      [contentTop],
    );

    // Show placeholder until first interaction completes
    if (!readyToRender) {
      return <View style={styles.container} />;
    }

    if (isLoading) {
      return (
        <View style={styles.container}>
          <View style={[styles.centerContent, { paddingTop: contentTop }]}>
            <LoadingState />
          </View>
        </View>
      );
    }

    // Only an error with NOTHING to show gets the error screen — a failed
    // background refetch must never replace loaded activity with a wall
    if (isError && (!activities || activities.length === 0)) {
      return (
        <View style={styles.container}>
          <View style={[styles.centerContent, { paddingTop: contentTop }]}>
            <ErrorState onRetry={refetch} />
          </View>
        </View>
      );
    }

    if (!activities || activities.length === 0) {
      return (
        <View style={styles.container}>
          <View style={[styles.centerContent, { paddingTop: contentTop }]}>
            <EmptyState />
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
        >
          <SectionHeader />
          <ActivityFilterBar
            sort={sort}
            onSortChange={setSort}
            people={people}
            personId={personId}
            onPersonChange={setPersonId}
            media={media}
            onMediaChange={setMedia}
          />
          {displayActivities.length === 0 ? (
            <FilteredEmptyState onReset={resetFilters} />
          ) : (
            displayActivities.map((activity) => (
              <ActivityItem
                key={activity.activityId}
                activity={activity}
                albumId={albumId}
                noun={media === "all" ? undefined : noun}
                onOpenViewer={openViewer}
              />
            ))
          )}
        </ScrollView>

        {/* Mounted only while open — the viewer's hook tree is too heavy
            to run per render while closed (onClose fires post-animation) */}
        {viewerPhotos != null && (
          <PhotoViewer
            visible
            assets={viewerAssets}
            initialIndex={0}
            onClose={closeViewer}
            renderSocialOverlay={renderSocialOverlay}
            renderPageAttribution={renderPageAttribution}
            onDoubleTapAsset={onDoubleTapAsset}
          />
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  activityItem: {
    flexDirection: "row",
    marginBottom: 20,
  },
  activityItemPressed: {
    opacity: 0.6,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  activityIconBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  activityContent: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
  },
  userName: {
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  activityText: {
    fontSize: 15,
    color: "#444",
  },
  timestamp: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  thumbnailsContainer: {
    flexDirection: "row",
    marginTop: 10,
    gap: 4,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  thumbnailWithOverlay: {
    position: "relative",
    overflow: "hidden",
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailOverlayText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    maxWidth: 280,
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: 12,
  },
  resetButton: {
    marginTop: 8,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: "#F1F1F3",
  },
  resetButtonLabel: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#111",
  },
  loadingText: {
    fontSize: 14,
    color: "#666",
  },
});

export default ActivityPage;
