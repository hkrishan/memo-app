/**
 * Gallery tab — sectioned overview (Apple-Photos style).
 *
 * The hero header still scrolls away under the nav bar (this scroll
 * keeps feeding galleryScrollY, which drives the nav bar's fade), but
 * instead of the whole grid the tab now shows one horizontal strip of
 * tiles per section — Recents, per-moment drops, per-member uploads,
 * Videos, Most loved, top tags, and Places. Every section header pushes
 * the fullscreen filtered gallery (/album/[albumId]/gallery); Places
 * opens the existing map route instead. Tiles open the PhotoViewer
 * scoped to their section, flying out of the pressed tile.
 *
 * Everything derives from queries the album already runs — photos
 * (uploader / social / gps), moments, and the album tag counts.
 */

import React, { memo, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  RefreshControl,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  SharedValue,
  useAnimatedScrollHandler,
} from "react-native-reanimated";
import { Text } from "react-native-paper";
import { useRouter } from "expo-router";

import { AlbumHeader } from "../../components";
import { GalleryFabs } from "../../components/GalleryFabs";
import {
  GallerySectionRow,
  GallerySectionRowProps,
} from "../../components/GallerySectionRow";
import { MediaAsset } from "../../hooks";
import { useAlbumPhotoViewerExtras } from "../../hooks/useAlbumPhotoViewerExtras";
import { ImageWarmup, type WarmupItem } from "@/components/ui/ImageWarmup";
import { useGetPhotosQuery, useAlbumPhotoTagsQuery } from "../../api/photo.queries";
import { PhotoWithUploader } from "../../types/album.types";
import { memberColor } from "../../memberColor";
import { useGetMomentsQuery } from "@/features/moments/api/moments.queries";
import { momentTypeRegistry } from "@/features/moments/registry/momentTypes";
import Avatar from "@/components/ui/Avatar";
import { MediaTile } from "@/components/ui/MediaTile";

const LIST_BOTTOM_PADDING = 100;
/** Moment sections shown (newest first). */
const MAX_MOMENT_SECTIONS = 3;
/** Person cards in the People row (most uploads first). */
const MAX_PEOPLE = 12;
/** Tag sections shown (highest count first). */
const MAX_TAG_SECTIONS = 3;
const PERSON_TILE_SIZE = 108;

interface GalleryPageProps {
  album: any;
  albumId?: string;
  assets: MediaAsset[];
  isLoading: boolean;
  galleryScrollY: SharedValue<number>;
  contentTop: number;
}

/** One overview strip, ready to render. */
type OverviewSection = Pick<
  GallerySectionRowProps,
  "title" | "count" | "assets" | "onOpenAll" | "leading" | "renderTileBadge"
> & { key: string };

const GalleryPage: React.FC<GalleryPageProps> = ({
  album,
  albumId: albumIdProp,
  assets,
  isLoading,
  galleryScrollY,
  contentTop,
}) => {
  const router = useRouter();
  const albumId: string | undefined = albumIdProp ?? album?.albumId;

  // Same query keys the album screen already holds — cache hits, no new
  // backend surface. Photos carry uploader/social/gps for the sections.
  const {
    data: photos,
    refetch: refetchPhotos,
    isRefetching: isRefetchingPhotos,
  } = useGetPhotosQuery(albumId ?? "");
  const { data: moments, refetch: refetchMoments } = useGetMomentsQuery(
    albumId ?? "",
  );
  const { data: tagCounts, refetch: refetchTags } = useAlbumPhotoTagsQuery(
    albumId ?? "",
  );

  // Pull-to-refresh on the most-visited screen in the app — every sibling
  // list already had one
  const handleRefresh = useCallback(() => {
    void refetchPhotos();
    void refetchMoments();
    void refetchTags();
  }, [refetchPhotos, refetchMoments, refetchTags]);

  // The viewer's album layer (like/comment/tag overlay, double-tap like,
  // delete pop choreography) — shared with the full-gallery screen
  const {
    renderSocialOverlay,
    renderPageAttribution,
    onDoubleTapAsset,
    poppingIds,
  } = useAlbumPhotoViewerExtras(albumId, assets);

  // The nav bar fades in as the hero scrolls under it — same contract
  // the old grid honored via CameraRollGrid's animatedScrollY mirror
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      galleryScrollY.value = event.contentOffset.y;
    },
  });

  const openGallery = useCallback(
    (params: Record<string, string>) => {
      if (!albumId) return;
      router.push({
        pathname: "/album/[albumId]/gallery",
        params: { albumId, ...params },
      });
    },
    [router, albumId],
  );

  // Snapchat-style prefetch: warm the viewer-size derivatives of the
  // newest few photos onto disk, so the FIRST fullscreen open paints
  // sharp instantly instead of blur-upping from the thumbnail
  const viewerWarmupItems = useMemo<WarmupItem[]>(
    () =>
      (photos ?? [])
        .slice(0, 6)
        .map((photo) => photo.displayUrl ?? photo.url)
        .filter((uri): uri is string => !!uri)
        .map((uri) => ({ uri, bucket: "full" as const })),
    [photos],
  );

  // Newest-first ONCE for the whole page — the sections and the People
  // strip both derive from this. Timestamps are precomputed: a
  // `new Date()` pair inside the comparator allocated per comparison,
  // and the sort used to run twice per render pass.
  const sortedPhotos = useMemo<PhotoWithUploader[]>(() => {
    if (!photos || photos.length === 0) return [];
    return photos
      .map((photo) => ({ photo, ts: new Date(photo.createdAt).getTime() }))
      .sort((a, b) => b.ts - a.ts)
      .map((entry) => entry.photo);
  }, [photos]);

  const sections = useMemo<OverviewSection[]>(() => {
    if (!albumId || assets.length === 0) return [];

    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    const toAssets = (list: PhotoWithUploader[]) =>
      list
        .map((photo) => assetById.get(photo.photoId))
        .filter((asset): asset is MediaAsset => asset != null);

    const out: OverviewSection[] = [];

    // Recents — the whole album, newest first
    out.push({
      key: "recents",
      title: "Recents",
      count: assets.length,
      assets,
      onOpenAll: () => openGallery({ filter: "all", title: "Gallery" }),
    });

    // From moments — newest moments that collected at least one photo
    const momentSections = (moments ?? [])
      .filter((m) => m.events.some((e) => e.submissions.length > 0))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, MAX_MOMENT_SECTIONS);
    for (const moment of momentSections) {
      const ids = new Set(
        moment.events.flatMap((e) => e.submissions.map((s) => s.photoId)),
      );
      const momentAssets = toAssets(
        sortedPhotos.filter((p) => ids.has(p.photoId)),
      );
      if (momentAssets.length === 0) continue;
      const def = momentTypeRegistry[moment.type];
      out.push({
        key: `moment-${moment.momentId}`,
        title: moment.title,
        count: momentAssets.length,
        assets: momentAssets,
        leading: (
          <Ionicons name={def.icon} size={13} color={def.accentColor} />
        ),
        // Daily drops open the drop-sectioned posts view (front+back pairs,
        // BeReal swap) instead of a flat photo grid; other moment types keep
        // the grid.
        onOpenAll: () =>
          moment.type === "daily_drop"
            ? router.push(`/album/${albumId}/moment/${moment.momentId}`)
            : openGallery({
                filter: "moment",
                momentId: moment.momentId,
                title: moment.title,
              }),
      });
    }

    // Videos
    const videoAssets = assets.filter((a) => a.mediaType === "video");
    if (videoAssets.length > 0) {
      out.push({
        key: "videos",
        title: "Videos",
        count: videoAssets.length,
        assets: videoAssets,
        onOpenAll: () => openGallery({ filter: "videos", title: "Videos" }),
      });
    }

    // Most loved — liked photos, most-liked first (ties stay newest)
    const lovedPhotos = sortedPhotos
      .filter((p) => (p.social?.likeCount ?? 0) > 0)
      .sort((a, b) => (b.social?.likeCount ?? 0) - (a.social?.likeCount ?? 0));
    if (lovedPhotos.length > 0) {
      // Tiles show their like badge by default now — no custom badge needed
      out.push({
        key: "loved",
        title: "Most loved",
        count: lovedPhotos.length,
        assets: toAssets(lovedPhotos),
        onOpenAll: () => openGallery({ filter: "loved", title: "Most loved" }),
      });
    }

    // Tags — the album's top three
    const topTags = [...(tagCounts ?? [])]
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_TAG_SECTIONS);
    for (const { tag } of topTags) {
      const tagAssets = toAssets(
        sortedPhotos.filter((p) => p.social?.tags?.some((t) => t.tag === tag)),
      );
      if (tagAssets.length === 0) continue;
      out.push({
        key: `tag-${tag}`,
        title: `#${tag}`,
        count: tagAssets.length,
        assets: tagAssets,
        onOpenAll: () =>
          openGallery({ filter: "tag", tag, title: `#${tag}` }),
      });
    }

    // Places — geotagged photos; the header opens the existing map
    const placeAssets = toAssets(
      sortedPhotos.filter((p) => p.latitude != null && p.longitude != null),
    );
    if (placeAssets.length > 0) {
      out.push({
        key: "places",
        title: "Places",
        count: placeAssets.length,
        assets: placeAssets,
        onOpenAll: () => router.push(`/album/${albumId}/map`),
      });
    }

    return out;
  }, [albumId, assets, sortedPhotos, moments, tagCounts, openGallery, router]);

  // People — one CARD per contributor (their latest photo), heaviest
  // uploaders first. Tapping a card opens that person's full grid.
  const people = useMemo<PersonEntry[]>(() => {
    if (!albumId || sortedPhotos.length === 0) return [];
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    // One pass: per-uploader counts AND each uploader's newest photo
    // (sortedPhotos is newest-first) — the old shape re-sorted the whole
    // album and ran a linear .find per member (O(members × photos))
    const countByUploader = new Map<string, number>();
    const latestByUploader = new Map<string, PhotoWithUploader>();
    for (const photo of sortedPhotos) {
      const uploaderId = photo.uploader.userId;
      countByUploader.set(uploaderId, (countByUploader.get(uploaderId) ?? 0) + 1);
      if (!latestByUploader.has(uploaderId)) {
        latestByUploader.set(uploaderId, photo);
      }
    }
    return (album?.members ?? [])
      .filter((m: any) => (countByUploader.get(m.userId) ?? 0) > 0)
      .sort(
        (a: any, b: any) =>
          (countByUploader.get(b.userId) ?? 0) -
          (countByUploader.get(a.userId) ?? 0),
      )
      .slice(0, MAX_PEOPLE)
      .map((member: any): PersonEntry | null => {
        const latestPhoto = latestByUploader.get(member.userId);
        const latest = latestPhoto
          ? assetById.get(latestPhoto.photoId)
          : undefined;
        if (!latest) return null;
        return {
          member,
          count: countByUploader.get(member.userId) ?? 0,
          latest,
        };
      })
      .filter((entry: PersonEntry | null): entry is PersonEntry => entry != null);
  }, [albumId, assets, sortedPhotos, album?.members]);

  const handlePressPerson = useCallback(
    (entry: PersonEntry) => {
      openGallery({
        filter: "member",
        memberId: entry.member.userId,
        title: entry.member.name,
      });
    },
    [openGallery],
  );

  // The People row slots in right after the moment sections
  const peopleInsertIndex = useMemo(
    () =>
      1 + sections.filter((section) => section.key.startsWith("moment-")).length,
    [sections],
  );

  return (
    <View style={styles.pageGallery}>
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingPhotos}
            onRefresh={handleRefresh}
            tintColor="#888"
          />
        }
      >
        {/* Profile-style header scrolls away with the sections; topInset
            keeps its content clear of the absolutely-positioned nav bar
            while its blurred backdrop runs behind it */}
        <AlbumHeader album={album} assets={assets} topInset={contentTop} />

        {!isLoading && assets.length === 0 && <EmptyGallery />}

        {sections.slice(0, peopleInsertIndex).map(({ key, ...section }) => (
          <GallerySectionRow
            key={key}
            {...section}
            renderSocialOverlay={renderSocialOverlay}
            renderPageAttribution={renderPageAttribution}
            onDoubleTapAsset={onDoubleTapAsset}
            poppingIds={poppingIds}
          />
        ))}

        {people.length > 0 && (
          <PeopleRow people={people} onPressPerson={handlePressPerson} />
        )}

        {sections.slice(peopleInsertIndex).map(({ key, ...section }) => (
          <GallerySectionRow
            key={key}
            {...section}
            renderSocialOverlay={renderSocialOverlay}
            renderPageAttribution={renderPageAttribution}
            onDoubleTapAsset={onDoubleTapAsset}
            poppingIds={poppingIds}
          />
        ))}
      </Animated.ScrollView>

      <GalleryFabs albumId={albumId} />

      {/* Background disk warmup for the first fullscreen opens */}
      <ImageWarmup items={viewerWarmupItems} concurrency={2} />
    </View>
  );
};

interface PersonEntry {
  member: {
    userId: string;
    name: string;
    avatarUrl: string | null;
    /** Album identity color — tints the card's avatar ring + name. */
    color?: string | null;
  };
  count: number;
  /** The person's latest photo — the card's image. */
  latest: MediaAsset;
}

/**
 * People — one card per contributor: their latest photo with an
 * avatar + name scrim. Tapping a card opens that person's full grid.
 */
const PeopleRow = memo<{
  people: PersonEntry[];
  onPressPerson: (entry: PersonEntry) => void;
}>(({ people, onPressPerson }) => (
  <View style={styles.peopleSection}>
    <View style={styles.peopleHeader}>
      <Text style={styles.peopleTitle}>People</Text>
      <Text style={styles.peopleCount}>{people.length}</Text>
    </View>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.peopleStrip}
    >
      {people.map((entry) => {
        return (
          <Pressable
            key={entry.member.userId}
            style={({ pressed }) => [
              styles.personCard,
              pressed && styles.personCardPressed,
            ]}
            onPress={() => onPressPerson(entry)}
            accessibilityRole="button"
            accessibilityLabel={`${entry.member.name}, ${entry.count} photos`}
          >
            <View style={styles.personTile}>
              <MediaTile
                asset={entry.latest}
                recyclingKeySuffix={`person-${entry.member.userId}`}
                fallbackGlyphSize={20}
                transition={100}
              />
              <View style={styles.personCountBadge} pointerEvents="none">
                <Text style={styles.personCountText}>{entry.count}</Text>
              </View>
            </View>
            {/* Identity sits under the photo, Apple-Photos-People style */}
            <View style={styles.personLabel}>
              <Avatar
                user={entry.member}
                size={16}
                ringColor={memberColor(entry.member)}
              />
              <Text style={styles.personName} numberOfLines={1}>
                {entry.member.name}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  </View>
));
PeopleRow.displayName = "PeopleRow";

const EmptyGallery = memo(() => (
  <View style={styles.emptyContainer}>
    <Ionicons name="images-outline" size={48} color="#ccc" />
    <Text style={styles.emptyText}>No photos yet</Text>
  </View>
));
EmptyGallery.displayName = "EmptyGallery";

const styles = StyleSheet.create({
  pageGallery: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    paddingBottom: LIST_BOTTOM_PADDING,
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
  peopleSection: {
    marginTop: 24,
  },
  peopleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  // Same section-header voice as GallerySectionRow
  peopleTitle: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  peopleCount: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#C7C7CC",
    fontVariant: ["tabular-nums"],
  },
  peopleStrip: {
    paddingHorizontal: 16,
    gap: 8,
  },
  personCard: {
    width: PERSON_TILE_SIZE,
  },
  personCardPressed: {
    opacity: 0.8,
  },
  personTile: {
    width: PERSON_TILE_SIZE,
    height: PERSON_TILE_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F2F2F7",
  },
  personImage: {
    width: "100%",
    height: "100%",
  },
  personLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  personName: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#3C3C43",
  },
  personCountBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  personCountText: {
    fontSize: 10,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#fff",
    fontVariant: ["tabular-nums"],
  },
});

export default GalleryPage;
