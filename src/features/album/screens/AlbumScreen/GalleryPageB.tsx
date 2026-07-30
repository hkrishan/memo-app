/**
 * Gallery tab — "editorial" A/B variant (galleryVariantStore).
 *
 * Where the classic GalleryPage is a sectioned overview of horizontal
 * strips, this variant is a magazine cover over a chronological archive:
 * a full-bleed cover hero (SHARED ALBUM overline, title, facepile,
 * counts), the activity / chat / map actions as a hairline cell row in
 * the content (the nav bar keeps only back / share / settings — see
 * AlbumNavBar's editorial mode), filter chips, and the whole album as a
 * day-grouped edge-to-edge grid — Today / Yesterday / weekday / date
 * sections, FlashList-virtualized. A floating "Add photos" pill replaces
 * the FAB pair.
 *
 * The scroll contract is unchanged: this feeds galleryScrollY, which
 * drives the nav bar fade (with the editorial hero's deeper thresholds).
 * Tiles open the PhotoViewer scoped to the current filter, flying out of
 * the pressed cell (GallerySectionRow's measure pattern).
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { FlashList } from "@shopify/flash-list";
import dayjs from "dayjs";
import { useRouter } from "expo-router";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { MediaAsset } from "../../hooks";
import { useAlbumPhotoViewerExtras } from "../../hooks/useAlbumPhotoViewerExtras";
import { useGetPhotosQuery } from "../../api/photo.queries";
import { AlbumMember } from "../../types/album.types";
import { memberColor } from "../../memberColor";
import { EDITORIAL_HERO_HEIGHT } from "../../store/galleryVariantStore";
import {
  PreparingPhotosModal,
  useAddPhotosPicker,
} from "../../components/GalleryFabs";
import { GallerySectionRow } from "../../components/GallerySectionRow";
import { useAlbumChatUnread } from "./chat/unread/useAlbumChatUnread";
import { PhotoViewer } from "@/features/photos/components";
import type { Frame } from "@/features/photos/components";
import { flightUriFor } from "@/features/photos/components/photoViewer/geometry";
import {
  retryAllFailedUploads,
  showWaitingForConnectionNotice,
} from "@/features/photos/uploadRetry";
import { MediaTile, VideoPlayBadge } from "@/components/ui/MediaTile";
import UploadingBadge from "@/components/ui/UploadingBadge";
import { CachedImage } from "@/components/ui/CachedImage";
import Avatar from "@/components/ui/Avatar";
import { ImageWarmup, type WarmupItem } from "@/components/ui/ImageWarmup";
import { hasRenderableStill } from "@/lib/mediaStill";
import { color, font, screenH, type } from "@/lib/tokens";
// PERF-PROBE (temporary)
import { useGalleryPerfProbe } from "@/dev/useGalleryPerfProbe";

// Same cast as CameraRollGrid — FlashList/createAnimatedComponent type
// mismatch with the installed versions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as any,
) as any;

const GRID_GAP = 2;
const GRID_COLUMNS = 4;
const TILE_WIDTH =
  (Dimensions.get("window").width - (GRID_COLUMNS - 1) * GRID_GAP) /
  GRID_COLUMNS;
// Portrait rectangles — same 1.4 ratio as the app's horizontal strip tiles
const TILE_HEIGHT = TILE_WIDTH * 1.4;
/** Clears the absolute AlbumTabs plus the Add photos pill. */
const LIST_BOTTOM_PADDING = 170;
const HERO_FACEPILE_MAX = 3;
/** Latest photos shown in each person's strip on the People filter. */
const PERSON_STRIP_TILES = 20;

type GalleryChipFilter = "all" | "photos" | "videos" | "people";

interface GalleryPageBProps {
  album: any;
  albumId?: string;
  assets: MediaAsset[];
  isLoading: boolean;
  galleryScrollY: SharedValue<number>;
  contentTop: number;
}

interface Contributor {
  member: AlbumMember;
  count: number;
  /** This member's uploads, newest first (album order). */
  assets: MediaAsset[];
}

type ListItem =
  | { type: "day"; key: string; label: string; count: number }
  | { type: "row"; key: string; assets: MediaAsset[] }
  | { type: "person"; key: string; contributor: Contributor }
  | {
      type: "empty";
      key: string;
      filter: GalleryChipFilter;
      /** The photo fetch failed — "no photos yet" would be a lie. */
      failed?: boolean;
    };

/** m:ss, or h:mm:ss at an hour and above (CameraRollGrid's format). */
const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

/** Today / Yesterday / weekday within the last week / "12 July" / +year. */
const dayLabel = (ts: number, now: dayjs.Dayjs): string => {
  const day = dayjs(ts);
  if (day.isSame(now, "day")) return "Today";
  if (day.isSame(now.subtract(1, "day"), "day")) return "Yesterday";
  if (day.isAfter(now.subtract(6, "day").startOf("day"))) {
    return day.format("dddd");
  }
  if (day.isSame(now, "year")) return day.format("D MMMM");
  return day.format("D MMMM YYYY");
};

const EMPTY_COPY: Record<GalleryChipFilter, string> = {
  all: "No photos yet",
  photos: "No photos yet",
  videos: "No videos yet",
  people: "No uploads yet",
};

// Natural sizes learned from tile loads — the viewer's flight math needs
// real aspect ratios (server assets can arrive with width/height 0)
const tileSizeCache = new Map<string, { width: number; height: number }>();

const EMPTY_VIEWER_ASSETS: MediaAsset[] = [];

// ---------------------------------------------------------------------------
// Grid tile
// ---------------------------------------------------------------------------

interface GridTileProps {
  asset: MediaAsset;
  popping: boolean;
  /** Gray slot while this photo is open in the viewer. */
  dimmed: boolean;
  onPress: (assetId: string) => void;
  /** Touch-down — used to warm the viewer-size image before the tap lands. */
  onPressIn: (assetId: string) => void;
  registerRef: (assetId: string, node: View | null) => void;
  onImageLoad: (assetId: string, width: number, height: number) => void;
}

const GridTile = memo<GridTileProps>(
  ({ asset, popping, dimmed, onPress, onPressIn, registerRef, onImageLoad }) => {
    // Delete choreography: grow slightly, then shrink away (grid pattern).
    // asset.id is a dep so a cell recycled mid-pop snaps back for the new
    // asset instead of staying collapsed (tiles keep stable position keys).
    const pop = useSharedValue(popping ? 0 : 1);
    // JS-side shadow of "this instance ever popped" — reading pop.value
    // here would be a SYNCHRONOUS hop into the UI runtime per recycled
    // tile, which measurably dropped UI frames during fast scrolls
    const everPoppedRef = useRef(popping);
    useEffect(() => {
      if (popping) {
        everPoppedRef.current = true;
        pop.value = withSequence(
          withTiming(1.06, { duration: 90, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) }),
        );
      } else if (everPoppedRef.current) {
        // Only a cell recycled mid-pop needs the snap-back — for the 99%
        // path (recycling a resting cell) scheduling a no-op 160ms timing
        // per recycle was pure churn during fast scrolls
        everPoppedRef.current = false;
        pop.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) });
      }
    }, [popping, pop, asset.id]);
    const popStyle = useAnimatedStyle(() => ({
      opacity: Math.min(pop.value, 1),
      transform: [{ scale: Math.max(pop.value, 0.001) }],
    }));

    const handlePress = useCallback(
      () => onPress(asset.id),
      [onPress, asset.id],
    );
    const handlePressIn = useCallback(
      () => onPressIn(asset.id),
      [onPressIn, asset.id],
    );
    const handleRef = useCallback(
      (node: View | null) => registerRef(asset.id, node),
      [registerRef, asset.id],
    );
    const handleLoad = useCallback(
      (event: { source?: { width?: number; height?: number } }) => {
        const w = event.source?.width ?? 0;
        const h = event.source?.height ?? 0;
        if (w > 0 && h > 0) onImageLoad(asset.id, w, h);
      },
      [onImageLoad, asset.id],
    );

    const isVideo = asset.mediaType === "video";
    const posterlessVideo = isVideo && !hasRenderableStill(asset);

    return (
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        accessibilityRole="imagebutton"
        accessibilityLabel={isVideo ? "Video" : "Photo"}
      >
        <View ref={handleRef} collapsable={false} style={styles.tile}>
          <Animated.View style={[styles.tileFill, popStyle]}>
            <MediaTile
              asset={asset}
              recyclingKeySuffix="editorial-grid"
              fallbackGlyphSize={20}
              onLoad={handleLoad}
            />
            {isVideo && !posterlessVideo && <VideoPlayBadge />}
            {isVideo && asset.duration > 0 && (
              <View style={styles.durationBadge} pointerEvents="none">
                <Text style={styles.durationText}>
                  {formatDuration(asset.duration)}
                </Text>
              </View>
            )}
            {(asset.pending || asset.uploadFailed || asset.uploadOffline) && (
              <UploadingBadge
                failed={asset.uploadFailed}
                offline={asset.uploadOffline}
              />
            )}
            {dimmed && <View style={styles.tileDimmed} pointerEvents="none" />}
          </Animated.View>
        </View>
      </Pressable>
    );
  },
);
GridTile.displayName = "GridTile";

// ---------------------------------------------------------------------------
// Header: cover hero + action cells + filter chips
// ---------------------------------------------------------------------------

const HeroHeader = memo<{
  album: any;
  coverUri: string | undefined;
  photoCount: number;
  videoCount: number;
  members: AlbumMember[];
  scrollY: SharedValue<number>;
}>(({ album, coverUri, photoCount, videoCount, members, scrollY }) => {
  const shown = members.slice(0, HERO_FACEPILE_MAX);
  const overflow = members.length - shown.length;

  const H = EDITORIAL_HERO_HEIGHT;

  // Pull-down: the cover stretches to fill the bounce gap — scaling from
  // center while translating by half the overscroll keeps the BOTTOM edge
  // pinned to the hero, so the image grows upward only. Scroll-up: the
  // cover slides at a third of the content's speed (parallax). The 0.33
  // factor is a ceiling, not taste: the bleed past the hero's bottom
  // (max H * 0.33 ≈ 140pt) must stay behind the header's OWN opaque rows
  // (actions + chips ≈ 145pt) — FlashList doesn't guarantee header/cell
  // z-order, so the bleed may draw over grid cells.
  const imageStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      transform: [
        {
          translateY: interpolate(
            scrollY.value,
            [-H, 0, H],
            [-H / 2, 0, H * 0.33],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(
            scrollY.value,
            [-H, 0],
            [2, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  // The title block sits on a nearer plane: a slight drift, fully faded
  // BEFORE its downward travel (max H * 0.1 ≈ 42pt at the end of the
  // fade ≈ 21pt) can carry the facepile past the hero's bottom padding —
  // it must never ghost over the actions row. The fade also completes
  // before the nav bar's frosted background starts (AlbumNavBar fades in
  // from H - 180), so the two hand off in sequence.
  const contentStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      opacity: interpolate(
        scrollY.value,
        [H * 0.25, H * 0.5],
        [1, 0],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateY: interpolate(
            scrollY.value,
            [-H, 0, H],
            [-H * 0.22, 0, H * 0.1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  // The heavy bottom scrim exists for the title's legibility — once the
  // title has dissolved it would just paint the remaining hero band
  // near-black (the parallax keeps the photo under it, but 72% black on
  // top reads as "the header is just black"). Dissolve it in step with
  // the title so the photo itself shows through to the end.
  const bottomScrimStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      opacity: interpolate(
        scrollY.value,
        [0, H * 0.55],
        [1, 0.2],
        Extrapolation.CLAMP,
      ),
    };
  });

  const meta = [
    `${photoCount} ${photoCount === 1 ? "photo" : "photos"}`,
    videoCount > 0 && `${videoCount} ${videoCount === 1 ? "video" : "videos"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.hero}>
      {!!coverUri && (
        <Animated.View style={[styles.heroImage, imageStyle]}>
          <CachedImage
            uri={coverUri}
            style={styles.heroImageFill}
            showPlaceholder={false}
          />
          {/* Legibility scrims live INSIDE the transformed wrapper so the
              pull-down stretch and the scroll parallax carry them with the
              photo — a static scrim leaves the stretched region unshaded.
              The bottom one still dissolves with the title on scroll-up
              (bottomScrimStyle) so the hero band never reads as black. */}
          <LinearGradient
            colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)"]}
            style={styles.heroTopScrim}
            pointerEvents="none"
          />
          <Animated.View
            style={[styles.heroBottomScrim, bottomScrimStyle]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.72)"]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </Animated.View>
      )}

      <Animated.View style={[styles.heroContent, contentStyle]}>
        <Text style={styles.heroOverline}>Shared album</Text>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {album?.title ?? "Album"}
        </Text>
        <View style={styles.heroMetaRow}>
          {shown.length > 0 && (
            <View style={styles.facepile}>
              {shown.map((member, index) => (
                <View
                  key={member.userId}
                  style={[
                    styles.facepileAvatar,
                    index > 0 && styles.facepileOverlap,
                  ]}
                >
                  <Avatar user={member as any} size={30} />
                </View>
              ))}
              {overflow > 0 && (
                <View
                  style={[
                    styles.facepileAvatar,
                    styles.facepileOverlap,
                    styles.facepileOverflow,
                  ]}
                >
                  <Text style={styles.facepileOverflowText}>+{overflow}</Text>
                </View>
              )}
            </View>
          )}
          <Text style={styles.heroMeta}>{meta}</Text>
        </View>
      </Animated.View>
    </View>
  );
});
HeroHeader.displayName = "HeroHeader";

const ActionsRow = memo<{ albumId: string | undefined }>(({ albumId }) => {
  const router = useRouter();
  const chatUnreadCount = useAlbumChatUnread(albumId);

  const cells: {
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    route: string;
    dot?: boolean;
  }[] = [
    { key: "activity", label: "Activity", icon: "pulse-outline", route: "activity" },
    {
      key: "chat",
      label: "Chat",
      icon: "chatbubble-outline",
      route: "chat",
      dot: chatUnreadCount > 0,
    },
    { key: "map", label: "Map", icon: "map-outline", route: "map" },
  ];

  return (
    <View style={styles.actionsRow}>
      {cells.map((cell, index) => (
        <Pressable
          key={cell.key}
          style={({ pressed }) => [
            styles.actionCell,
            index > 0 && styles.actionCellDivider,
            pressed && styles.actionCellPressed,
          ]}
          onPress={() => {
            if (albumId) router.push(`/album/${albumId}/${cell.route}`);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Album ${cell.label.toLowerCase()}`}
        >
          <View>
            <Ionicons name={cell.icon} size={20} color={color.textPrimary} />
            {cell.dot && <View style={styles.actionDot} />}
          </View>
          <Text style={styles.actionLabel}>{cell.label}</Text>
        </Pressable>
      ))}
    </View>
  );
});
ActionsRow.displayName = "ActionsRow";

const FilterChips = memo<{
  filter: GalleryChipFilter;
  onChange: (filter: GalleryChipFilter) => void;
  videoCount: number;
  peopleCount: number;
}>(({ filter, onChange, videoCount, peopleCount }) => {
  const chips: { key: GalleryChipFilter; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    { key: "photos", label: "Photos" },
    { key: "videos", label: "Videos", count: videoCount },
    { key: "people", label: "People", count: peopleCount },
  ];

  return (
    <View style={styles.chipsRow}>
      {chips.map((chip) => {
        const active = chip.key === filter;
        return (
          <Pressable
            key={chip.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(chip.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={
              chip.count != null
                ? `${chip.label}, ${chip.count}`
                : chip.label
            }
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
              {chip.label}
            </Text>
            {chip.count != null && chip.count > 0 && (
              <Text
                style={[styles.chipCount, active && styles.chipLabelActive]}
              >
                {chip.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
});
FilterChips.displayName = "FilterChips";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const GalleryPageB: React.FC<GalleryPageBProps> = ({
  album,
  albumId: albumIdProp,
  assets,
  isLoading,
  galleryScrollY,
  contentTop,
}) => {
  void contentTop; // the hero runs full-bleed under the transparent nav bar
  const router = useRouter();
  const albumId: string | undefined = albumIdProp ?? album?.albumId;

  const [filter, setFilter] = useState<GalleryChipFilter>("all");

  // Cache hit on the key the album screen already holds — uploader data
  // for the People list rides on the photos the grid already shows
  const {
    data: photos,
    refetch: refetchPhotos,
    isRefetching: isRefetchingPhotos,
    isError: isPhotosError,
  } = useGetPhotosQuery(albumId ?? "");

  const {
    renderSocialOverlay,
    renderPageAttribution,
    onDoubleTapAsset,
    poppingIds,
  } = useAlbumPhotoViewerExtras(albumId, assets);

  const { handleAddPhoto, preparing } = useAddPhotosPicker(albumId);

  // The app's own camera scoped to this album — its save sheet asks
  // before anything is uploaded (same flow as GalleryFabs)
  const handleTakePhoto = useCallback(() => {
    if (albumId) router.push(`/album/${albumId}/camera`);
  }, [router, albumId]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      galleryScrollY.value = event.contentOffset.y;
    },
  });

  const videoCount = useMemo(
    () => assets.reduce((n, a) => n + (a.mediaType === "video" ? 1 : 0), 0),
    [assets],
  );
  const photoCount = assets.length - videoCount;

  const coverUri =
    album?.coverPhoto?.thumbnailUrl ??
    album?.coverPhoto?.url ??
    assets[0]?.thumbnailUrl ??
    assets[0]?.uri;

  const members: AlbumMember[] = useMemo(
    () => album?.members ?? [],
    [album?.members],
  );

  // Contributors, heaviest uploaders first — one section per person on
  // the People filter. Assets are collected in album order (newest first)
  // by walking `assets`, mapped to uploaders via the photos query; pending
  // uploads aren't in the server list yet and simply don't attribute.
  const contributors = useMemo<Contributor[]>(() => {
    if (!photos || photos.length === 0) return [];
    const uploaderByPhotoId = new Map<string, string>();
    for (const photo of photos) {
      uploaderByPhotoId.set(photo.photoId, photo.uploader.userId);
    }
    const assetsByUploader = new Map<string, MediaAsset[]>();
    for (const asset of assets) {
      const uploaderId = uploaderByPhotoId.get(asset.id);
      if (!uploaderId) continue;
      const list = assetsByUploader.get(uploaderId);
      if (list) list.push(asset);
      else assetsByUploader.set(uploaderId, [asset]);
    }
    return members
      .filter((m) => (assetsByUploader.get(m.userId)?.length ?? 0) > 0)
      .sort(
        (a, b) =>
          (assetsByUploader.get(b.userId)?.length ?? 0) -
          (assetsByUploader.get(a.userId)?.length ?? 0),
      )
      .map((member) => {
        const memberAssets = assetsByUploader.get(member.userId) ?? [];
        return { member, count: memberAssets.length, assets: memberAssets };
      });
  }, [photos, assets, members]);

  const filteredAssets = useMemo(() => {
    if (filter === "photos") {
      return assets.filter((a) => a.mediaType !== "video");
    }
    if (filter === "videos") {
      return assets.filter((a) => a.mediaType === "video");
    }
    return assets;
  }, [assets, filter]);
  const filteredAssetsRef = useRef(filteredAssets);
  filteredAssetsRef.current = filteredAssets;

  // Day sections flattened into FlashList items: a "day" header followed
  // by full-width rows of GRID_COLUMNS tiles. Assets arrive newest-first (pending
  // uploads pinned to the front — they are the newest), so one pass in
  // order groups them.
  const listItems = useMemo<ListItem[]>(() => {
    if (filter === "people") {
      if (contributors.length === 0 && !isLoading) {
        return [{ type: "empty", key: "empty", filter, failed: isPhotosError }];
      }
      return contributors.map((contributor) => ({
        type: "person",
        key: contributor.member.userId,
        contributor,
      }));
    }

    if (filteredAssets.length === 0) {
      return isLoading
        ? []
        : [{ type: "empty", key: "empty", filter, failed: isPhotosError }];
    }

    const now = dayjs();
    const nowMs = Date.now();
    const items: ListItem[] = [];
    let currentDayKey: string | null = null;
    let currentRow: MediaAsset[] = [];

    const flushRow = () => {
      if (currentRow.length === 0) return;
      items.push({
        type: "row",
        key: `row-${currentRow[0].id}`,
        assets: currentRow,
      });
      currentRow = [];
    };

    for (const asset of filteredAssets) {
      const ts = asset.creationTime ?? nowMs;
      const key = dayjs(ts).startOf("day").format("YYYY-MM-DD");
      if (key !== currentDayKey) {
        flushRow();
        currentDayKey = key;
        items.push({
          type: "day",
          // Position-suffixed: pending uploads are pinned to the front, so
          // a day can legitimately appear twice (a parked capture from
          // yesterday ahead of today's server photos)
          key: `day-${key}-${items.length}`,
          label: dayLabel(ts, now),
          // Filled in below once the group is complete
          count: 0,
        });
      }
      currentRow.push(asset);
      if (currentRow.length === GRID_COLUMNS) flushRow();
    }
    flushRow();

    // Second pass: write each day's item count into its header
    let dayIndex = -1;
    const counts: number[] = [];
    for (const item of items) {
      if (item.type === "day") {
        dayIndex += 1;
        counts[dayIndex] = 0;
      } else if (item.type === "row") {
        counts[dayIndex] += item.assets.length;
      }
    }
    dayIndex = -1;
    for (const item of items) {
      if (item.type === "day") {
        dayIndex += 1;
        item.count = counts[dayIndex];
      }
    }
    return items;
  }, [filter, filteredAssets, contributors, isLoading, isPhotosError]);
  const listItemsRef = useRef(listItems);
  listItemsRef.current = listItems;

  // -------------------------------------------------------------------
  // Viewer session (flight open from the pressed cell + return flight)
  // -------------------------------------------------------------------

  // `base` freezes the filtered list at open — a refetch mid-view must
  // not shift which photo sits under the viewer's numeric page offset
  const [viewerSession, setViewerSession] = useState<{
    index: number;
    originFrame: Frame | null;
    base: MediaAsset[];
  } | null>(null);
  const viewerSessionRef = useRef(viewerSession);
  viewerSessionRef.current = viewerSession;

  const [viewedId, setViewedId] = useState<string | null>(null);
  const pendingViewedIdRef = useRef<string | null>(null);
  const handleOpenTransitionStart = useCallback(() => {
    if (pendingViewedIdRef.current != null) {
      setViewedId(pendingViewedIdRef.current);
      pendingViewedIdRef.current = null;
    }
  }, []);

  const tileRefs = useRef(new Map<string, View>());
  const registerRef = useCallback((assetId: string, node: View | null) => {
    if (node) tileRefs.current.set(assetId, node);
    else tileRefs.current.delete(assetId);
  }, []);

  // Size enrichment, coalesced to one re-render per batch and skipped
  // entirely while the viewer is closed (GallerySectionRow pattern)
  const [sizeVersion, setSizeVersion] = useState(0);
  const bumpScheduledRef = useRef(false);
  const handleImageLoad = useCallback(
    (assetId: string, width: number, height: number) => {
      if (tileSizeCache.has(assetId)) return;
      tileSizeCache.set(assetId, { width, height });
      if (viewerSessionRef.current === null) return;
      if (bumpScheduledRef.current) return;
      bumpScheduledRef.current = true;
      queueMicrotask(() => {
        bumpScheduledRef.current = false;
        setSizeVersion((v) => v + 1);
      });
    },
    [],
  );
  const viewerAssets = useMemo(() => {
    void sizeVersion;
    if (viewerSession === null) return EMPTY_VIEWER_ASSETS;
    return viewerSession.base.map((asset) => {
      if (asset.width > 0 && asset.height > 0) return asset;
      const size = tileSizeCache.get(asset.id);
      return size ? { ...asset, ...size } : asset;
    });
  }, [viewerSession, sizeVersion]);

  const frameForAsset = useCallback(
    (assetId: string) =>
      new Promise<Frame | null>((resolve) => {
        const node = tileRefs.current.get(assetId);
        if (!node) {
          resolve(null);
          return;
        }
        node.measureInWindow((x, y, width, height) => {
          if (!(width > 0 && height > 0)) {
            resolve(null);
            return;
          }
          const window = Dimensions.get("window");
          const cx = x + width / 2;
          const cy = y + height / 2;
          const visible =
            cx >= 0 && cx <= window.width && cy >= 0 && cy <= window.height;
          resolve(visible ? { x, y, width, height } : null);
        });
      }),
    [],
  );

  // Touch-down warmup: start pulling the viewer-size image the moment the
  // finger lands — the ~100ms between press-in and press-up is free head
  // start for the open flight's full-res layer (Snapchat pattern).
  const [pressWarmId, setPressWarmId] = useState<string | null>(null);
  const handleTilePressIn = useCallback((assetId: string) => {
    setPressWarmId(assetId);
  }, []);

  const handleTilePress = useCallback(
    (assetId: string) => {
      const base = filteredAssetsRef.current;
      const index = base.findIndex((a) => a.id === assetId);
      if (index < 0) return;
      if (base[index].uploadOffline) {
        showWaitingForConnectionNotice();
        return;
      }
      // Tapping a failed upload IS the retry
      if (base[index].uploadFailed) {
        retryAllFailedUploads();
        return;
      }
      pendingViewedIdRef.current = assetId;
      frameForAsset(assetId).then((originFrame) => {
        // PERF-PROBE (temporary)
        (globalThis as any).__memoPerfMark?.("viewer_session_set");
        setViewerSession({ index, originFrame, base });
      });
    },
    [frameForAsset],
  );

  // Grid list handle — drives the viewer-follows-grid scrolling below (and
  // the perf probe's scripted scrolls)
  const listRef = useRef<unknown>(null);
  const scrollListToItem = useCallback((itemIndex: number) => {
    const node = listRef.current as {
      scrollToIndex?: (params: {
        index: number;
        animated: boolean;
        viewPosition?: number;
      }) => void;
    } | null;
    node?.scrollToIndex?.({
      index: itemIndex,
      animated: false,
      viewPosition: 0.5,
    });
  }, []);

  // PERF-PROBE (temporary): scripted scroll/open/swipe measurement
  const probeOpenRef = useRef(handleTilePress);
  probeOpenRef.current = handleTilePress;
  useGalleryPerfProbe({
    listRef,
    assetsRef: filteredAssetsRef,
    openAssetRef: probeOpenRef,
  });

  /** List index of the grid row containing this asset (-1 when filtered out). */
  const rowIndexForAsset = useCallback((assetId: string): number => {
    return listItemsRef.current.findIndex(
      (item) =>
        item.type === "row" && item.assets.some((a) => a.id === assetId),
    );
  }, []);

  // The grid follows the viewer: each time paging settles on a photo whose
  // cell is outside the viewport, scroll its row into view (invisible — the
  // viewer's backdrop covers the grid). Dismissing then always flies the
  // photo home to its REAL cell, and closing leaves the grid at the photo
  // you were looking at — instead of the fade fallback plus a jump back to
  // wherever you originally opened. A visible cell keeps the scroll
  // position untouched, so open-and-close without paging never shifts the
  // grid.
  const handleViewerIndexChange = useCallback(
    (index: number) => {
      const base = viewerSessionRef.current?.base;
      const asset = base?.[index];
      if (!asset) return;
      void frameForAsset(asset.id).then((frame) => {
        if (frame) return;
        const rowIndex = rowIndexForAsset(asset.id);
        if (rowIndex >= 0) scrollListToItem(rowIndex);
      });
    },
    [frameForAsset, rowIndexForAsset, scrollListToItem],
  );

  // Resolves the grid cell the dismissed photo flies home to. When the
  // cell is outside the viewport (the user paged far from where they
  // opened), scroll its row into view first — the viewer prefetches this
  // while its backdrop still fully hides the grid, so the scroll is
  // invisible — then measure again once FlashList has laid the row out.
  // Only if that still fails does the viewer take its fade fallback.
  const getReturnFrame = useCallback(
    async (index: number): Promise<Frame | null> => {
      const base = viewerSessionRef.current?.base ?? filteredAssetsRef.current;
      const id = base[index]?.id;
      if (!id) return null;
      setViewedId(id);
      const frame = await frameForAsset(id);
      if (frame) return frame;
      const rowIndex = rowIndexForAsset(id);
      if (rowIndex < 0) return null;
      scrollListToItem(rowIndex);
      // Two-ish frames for the scrolled-to row to mount and lay out
      // (well inside the viewer's return-frame timeout)
      await new Promise((resolve) => setTimeout(resolve, 64));
      return frameForAsset(id);
    },
    [frameForAsset, rowIndexForAsset, scrollListToItem],
  );

  const handleCloseViewer = useCallback(() => {
    pendingViewedIdRef.current = null;
    setViewerSession(null);
    setViewedId(null);
  }, []);

  // -------------------------------------------------------------------
  // List rendering
  // -------------------------------------------------------------------

  const handlePressPerson = useCallback(
    (contributor: Contributor) => {
      if (!albumId) return;
      router.push({
        pathname: "/album/[albumId]/gallery",
        params: {
          albumId,
          filter: "member",
          memberId: contributor.member.userId,
          title: contributor.member.name,
        },
      });
    },
    [router, albumId],
  );

  const poppingSet = useMemo(() => new Set(poppingIds ?? []), [poppingIds]);

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        <HeroHeader
          album={album}
          coverUri={coverUri}
          photoCount={photoCount}
          videoCount={videoCount}
          members={members}
          scrollY={galleryScrollY}
        />
        <ActionsRow albumId={albumId} />
        <FilterChips
          filter={filter}
          onChange={setFilter}
          videoCount={videoCount}
          peopleCount={contributors.length}
        />
      </View>
    ),
    [
      album,
      coverUri,
      photoCount,
      videoCount,
      members,
      albumId,
      filter,
      contributors.length,
      galleryScrollY,
    ],
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      switch (item.type) {
        case "day":
          return (
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>{item.label}</Text>
              <Text style={styles.dayCount}>
                {item.count} {item.count === 1 ? "item" : "items"}
              </Text>
            </View>
          );
        case "row":
          return (
            <View style={styles.gridRow}>
              {/* Keyed by COLUMN, not asset id: FlashList recycles rows by
                  swapping their data, and an id key would remount every
                  tile subtrees (reanimated nodes, image views) on every
                  recycle — the main scroll-jank cost. With a stable key the
                  memoized tiles just re-render with new props; MediaTile's
                  recyclingKey handles the image swap. */}
              {item.assets.map((asset, column) => (
                <GridTile
                  key={column}
                  asset={asset}
                  popping={poppingSet.has(asset.id)}
                  dimmed={asset.id === viewedId}
                  onPress={handleTilePress}
                  onPressIn={handleTilePressIn}
                  registerRef={registerRef}
                  onImageLoad={handleImageLoad}
                />
              ))}
            </View>
          );
        case "person":
          // One strip per contributor: avatar + name header, their latest
          // photos horizontally, header/"+N" tile opens their full grid.
          // GallerySectionRow brings its own PhotoViewer scoped to the
          // person's uploads.
          return (
            <View style={styles.personSection}>
              <GallerySectionRow
                title={item.contributor.member.name}
                count={item.contributor.count}
                assets={item.contributor.assets}
                maxTiles={PERSON_STRIP_TILES}
                leading={
                  <Avatar
                    user={item.contributor.member as any}
                    size={22}
                    ringColor={memberColor(item.contributor.member)}
                  />
                }
                onOpenAll={() => handlePressPerson(item.contributor)}
                renderSocialOverlay={renderSocialOverlay}
                renderPageAttribution={renderPageAttribution}
                onDoubleTapAsset={onDoubleTapAsset}
                poppingIds={poppingIds}
              />
            </View>
          );
        case "empty":
          // A failed fetch must never read as "no photos yet" — offline
          // with no cached photos gets the connection message instead
          // (pull-to-refresh is the retry)
          return (
            <View style={styles.emptyContainer}>
              <Ionicons
                name={item.failed ? "cloud-offline-outline" : "images-outline"}
                size={48}
                color="#ccc"
              />
              <Text style={styles.emptyText}>
                {item.failed
                  ? "Couldn't load photos — check your connection"
                  : EMPTY_COPY[item.filter]}
              </Text>
            </View>
          );
      }
    },
    [
      poppingSet,
      viewedId,
      handleTilePress,
      handleTilePressIn,
      registerRef,
      handleImageLoad,
      handlePressPerson,
      renderSocialOverlay,
      renderPageAttribution,
      onDoubleTapAsset,
      poppingIds,
    ],
  );

  const keyExtractor = useCallback((item: ListItem) => item.key, []);
  const getItemType = useCallback((item: ListItem) => item.type, []);

  const extraData = useMemo(
    () => ({ viewedId, poppingSet }),
    [viewedId, poppingSet],
  );

  // Warm the viewer-size derivatives of the newest few photos (same
  // prefetch the classic page runs), plus — at the front — the tile the
  // user's finger is currently down on
  const viewerWarmupItems = useMemo<WarmupItem[]>(() => {
    const items = (photos ?? [])
      .slice(0, 6)
      .map((photo) => photo.displayUrl ?? photo.url)
      .filter((uri): uri is string => !!uri)
      .map((uri) => ({ uri, bucket: "full" as const }));
    if (pressWarmId) {
      const pressed = filteredAssetsRef.current.find(
        (asset) => asset.id === pressWarmId,
      );
      const uri = pressed ? flightUriFor(pressed) : null;
      if (uri?.startsWith("http") && !items.some((item) => item.uri === uri)) {
        items.unshift({ uri, bucket: "full" as const });
      }
    }
    return items;
  }, [photos, pressWarmId]);

  return (
    <View style={styles.page}>
      <AnimatedFlashList
        ref={listRef}
        data={listItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        extraData={extraData}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingPhotos}
            onRefresh={refetchPhotos}
            // The spinner draws over the dark cover hero
            tintColor="#fff"
          />
        }
      />

      <View style={styles.floatingActions} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [
            styles.addPill,
            pressed && styles.addPillPressed,
          ]}
          onPress={handleAddPhoto}
          accessibilityRole="button"
          accessibilityLabel="Add photos"
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addPillLabel}>Add photos</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.cameraButton,
            pressed && styles.addPillPressed,
          ]}
          onPress={handleTakePhoto}
          accessibilityRole="button"
          accessibilityLabel="Take a photo for this album"
        >
          {/* Shutter ring — the app's camera glyph (tab bar, GalleryFabs) */}
          <View style={styles.shutterRing} />
        </Pressable>
      </View>

      <PreparingPhotosModal visible={preparing} />

      {viewerSession !== null && (
        <PhotoViewer
          visible
          assets={viewerAssets}
          initialIndex={viewerSession.index}
          originFrame={viewerSession.originFrame}
          getReturnFrame={getReturnFrame}
          onActiveIndexChange={handleViewerIndexChange}
          onClose={handleCloseViewer}
          onOpenTransitionStart={handleOpenTransitionStart}
          gridCornerRadius={0}
          renderSocialOverlay={renderSocialOverlay}
          renderPageAttribution={renderPageAttribution}
          onDoubleTapAsset={onDoubleTapAsset}
        />
      )}

      <ImageWarmup items={viewerWarmupItems} concurrency={2} />
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: color.bg,
  },
  listContent: {
    paddingBottom: LIST_BOTTOM_PADDING,
  },
  headerBlock: {
    backgroundColor: color.bg,
  },

  // Hero
  hero: {
    height: EDITORIAL_HERO_HEIGHT,
    backgroundColor: "#1C1C1E",
    justifyContent: "flex-end",
  },
  // Animated wrapper — the parallax/stretch transform lives on this, the
  // image itself just fills it
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImageFill: {
    width: "100%",
    height: "100%",
  },
  heroTopScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  heroBottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  heroContent: {
    paddingHorizontal: screenH,
    paddingBottom: 22,
  },
  heroOverline: {
    ...type.overline,
    color: "rgba(255, 255, 255, 0.65)",
  },
  heroTitle: {
    fontSize: 36,
    ...font.bold,
    color: color.onDarkPrimary,
    lineHeight: 41,
    marginTop: 6,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  facepile: {
    flexDirection: "row",
    alignItems: "center",
  },
  facepileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#3A3A3C",
  },
  facepileOverlap: {
    marginLeft: -9,
  },
  facepileOverflow: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  facepileOverflowText: {
    fontSize: 11,
    ...font.semibold,
    color: "#fff",
  },
  heroMeta: {
    flexShrink: 1,
    fontSize: 14,
    ...font.medium,
    color: "rgba(255, 255, 255, 0.85)",
  },

  // Action cells — hairlines, not cards. Opaque: the parallaxing cover
  // bleeds past the hero's bottom edge behind these rows.
  actionsRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
    backgroundColor: color.bg,
  },
  actionCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 14,
  },
  actionCellDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: color.separator,
  },
  actionCellPressed: {
    backgroundColor: color.surface1,
  },
  actionLabel: {
    fontSize: 13,
    ...font.medium,
    color: color.textPrimary,
  },
  actionDot: {
    position: "absolute",
    top: -2,
    right: -6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#FF3B30",
  },

  // Filter chips
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: screenH,
    paddingVertical: 14,
    backgroundColor: color.bg,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.16)",
  },
  chipActive: {
    backgroundColor: color.textPrimary,
    borderColor: color.textPrimary,
  },
  chipLabel: {
    fontSize: 14,
    ...font.medium,
    color: color.textPrimary,
  },
  chipLabelActive: {
    color: color.textInverse,
  },
  chipCount: {
    fontSize: 13,
    ...font.medium,
    color: color.textTertiary,
    fontVariant: ["tabular-nums"],
  },

  // Day sections
  dayHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: screenH,
    paddingTop: 18,
    paddingBottom: 10,
    backgroundColor: color.bg,
  },
  dayLabel: {
    fontSize: 17,
    ...font.bold,
    color: color.textPrimary,
  },
  dayCount: {
    fontSize: 13,
    ...font.regular,
    color: color.textTertiary,
    fontVariant: ["tabular-nums"],
  },
  // Opaque (incl. the white tile gaps) — see actionsRow. The row gap is
  // padding, not margin, so it's covered by the background too.
  gridRow: {
    flexDirection: "row",
    gap: GRID_GAP,
    paddingBottom: GRID_GAP,
    backgroundColor: color.bg,
  },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
  },
  tileFill: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: color.surface1,
  },
  tileDimmed: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.surface1,
  },
  durationBadge: {
    position: "absolute",
    bottom: 5,
    left: 5,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  durationText: {
    fontSize: 10,
    ...font.semibold,
    color: "#fff",
    fontVariant: ["tabular-nums"],
  },

  // People sections — opaque like the grid rows (parallax bleed)
  personSection: {
    backgroundColor: color.bg,
  },

  emptyContainer: {
    alignItems: "center",
    paddingVertical: 80,
    gap: 8,
    backgroundColor: color.bg,
  },
  emptyText: {
    fontSize: 16,
    color: "#888",
  },

  // Floating actions: the add pill with the camera beside it
  floatingActions: {
    position: "absolute",
    bottom: 110,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: color.textPrimary,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  cameraButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.textPrimary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  // Mirrors the main tab bar's camera glyph, sized for the 48pt button
  shutterRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: "#fff",
  },
  addPillPressed: {
    transform: [{ scale: 0.97 }],
  },
  addPillLabel: {
    fontSize: 15,
    ...font.semibold,
    color: color.textInverse,
  },
});

export default GalleryPageB;
