/**
 * One overview section on the album Gallery tab: a pressable header row
 * (title, muted count, chevron — the whole row opens the filtered
 * full-gallery screen) above a single horizontally-scrolling strip of
 * square rounded photo tiles.
 *
 * Tapping a tile opens the fullscreen PhotoViewer scoped to THIS
 * section's assets, flying out of the pressed tile (FeedPost pattern:
 * measureInWindow → originFrame; tiles are square cover so the plain
 * tile rect IS the fitted rect) and returning to it on dismiss when the
 * tile is still on screen — otherwise the viewer takes its fade fallback.
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
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { MediaAsset } from "../hooks";
import type { SocialOverlayInfo } from "../hooks/useAlbumPhotoViewerExtras";
import { PhotoViewer } from "@/features/photos/components";
import type { Frame } from "@/features/photos/components";
import UploadingBadge from "@/components/ui/UploadingBadge";
import { MediaTile, VideoPlayBadge } from "@/components/ui/MediaTile";
import { hasRenderableStill } from "@/lib/mediaStill";

// Portrait tiles, matching the "My Photos" strip on the My Albums tab
// (GaleryCarousel: 80 wide, 1.4x tall, same radius and gap) so a photo is
// the same shape and size wherever it is shown in a horizontal strip.
export const TILE_WIDTH = 80;
export const TILE_HEIGHT = TILE_WIDTH * 1.4;
const TILE_RADIUS = 12;
const TILE_GAP = 8;
const H_PADDING = 16;
/** Tiles shown in the strip before the "View all" end tile takes over. */
const MAX_TILES = 12;

// Natural sizes learned from tile image loads, shared across sections
// (the same photo can sit in Recents, People and Most loved). The
// viewer's flight math needs real aspect ratios; a photo whose size is
// still unknown keeps the viewer's graceful fade fallback.
const tileSizeCache = new Map<string, { width: number; height: number }>();

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

interface SectionTileProps {
  asset: MediaAsset;
  popping: boolean;
  /** iOS-Photos-style: the slot goes plain gray while its photo is
   *  open in the viewer (the photo "left" the tile). */
  dimmed: boolean;
  badge?: React.ReactNode;
  onPress: (assetId: string) => void;
  registerRef: (assetId: string, node: View | null) => void;
  onImageLoad: (assetId: string, width: number, height: number) => void;
}

const SectionTile = memo<SectionTileProps>(
  ({ asset, popping, dimmed, badge, onPress, registerRef, onImageLoad }) => {
    // Delete choreography: grow slightly, then shrink away; a failed
    // delete pops the tile back in. Mirrors the grid's pop-away feel.
    const pop = useSharedValue(popping ? 0 : 1);
    useEffect(() => {
      pop.value = popping
        ? withSequence(
            withTiming(1.06, { duration: 90, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) }),
          )
        : withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) });
    }, [popping, pop]);
    const popStyle = useAnimatedStyle(() => ({
      opacity: Math.min(pop.value, 1),
      transform: [{ scale: Math.max(pop.value, 0.001) }],
    }));

    const handlePress = useCallback(() => onPress(asset.id), [onPress, asset.id]);
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
        accessibilityRole="imagebutton"
        accessibilityLabel={isVideo ? "Video" : "Photo"}
      >
        <View ref={handleRef} collapsable={false} style={styles.tile}>
          <Animated.View style={[styles.tileFill, popStyle]}>
            <MediaTile
              asset={asset}
              fallbackGlyphSize={20}
              onLoad={handleLoad}
            />
            {isVideo && !posterlessVideo && <VideoPlayBadge />}
            {(asset.likeCount ?? 0) > 0 && (
              <View style={styles.likeBadge} pointerEvents="none">
                <Ionicons name="heart" size={9} color="#fff" />
                <Text style={styles.likeBadgeText}>{asset.likeCount}</Text>
              </View>
            )}
            {/* Still uploading to the album (local-first tile) */}
            {(asset.pending || asset.uploadFailed) && (
              <UploadingBadge failed={asset.uploadFailed} />
            )}
            {badge}
            {dimmed && <View style={styles.tileDimmed} pointerEvents="none" />}
          </Animated.View>
        </View>
      </Pressable>
    );
  },
);
SectionTile.displayName = "SectionTile";

// ---------------------------------------------------------------------------
// Section row
// ---------------------------------------------------------------------------

export interface GallerySectionRowProps {
  title: string;
  /** Full section size (header count; drives the "+N" end tile). */
  count: number;
  /** The complete section — the viewer pages over ALL of these. */
  assets: MediaAsset[];
  /** Header row press AND the "View all" end tile. */
  onOpenAll: () => void;
  /** Slot before the title (member avatar, moment-type icon). */
  leading?: React.ReactNode;
  /** Per-tile corner badge (e.g. Most loved's heart count). */
  renderTileBadge?: (asset: MediaAsset) => React.ReactNode;
  /** Album social layer for the viewer — see useAlbumPhotoViewerExtras. */
  renderSocialOverlay?: (info: SocialOverlayInfo) => React.ReactNode;
  /** Per-page uploader pill — travels with each photo while swiping. */
  renderPageAttribution?: (asset: MediaAsset) => React.ReactNode;
  onDoubleTapAsset?: (asset: MediaAsset) => void;
  poppingIds?: string[];
}

export const GallerySectionRow: React.FC<GallerySectionRowProps> = ({
  title,
  count,
  assets,
  onOpenAll,
  leading,
  renderTileBadge,
  renderSocialOverlay,
  renderPageAttribution,
  onDoubleTapAsset,
  poppingIds,
}) => {
  const tiles = useMemo(() => assets.slice(0, MAX_TILES), [assets]);
  const overflow = count - tiles.length;
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;

  // Strip scroll tracking, so a dismiss can bring the target tile
  // on-screen before the return flight measures it
  const stripRef = useRef<ScrollView>(null);
  const stripScrollXRef = useRef(0);
  const stripViewportWRef = useRef(0);
  const handleStripScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      stripScrollXRef.current = e.nativeEvent.contentOffset.x;
    },
    [],
  );
  const handleStripLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      stripViewportWRef.current = e.nativeEvent.layout.width;
    },
    [],
  );

  // -------------------------------------------------------------------
  // Viewer session (flight open from the pressed tile + return flight)
  // -------------------------------------------------------------------

  // `base` freezes the section at open — a refetch mid-view (a like
  // resorting "Most loved", a delete) must not shift which photo sits
  // under the viewer's numeric page offset. Return flights translate
  // back by id via the tile ref map, so a removed tile simply fades.
  const [viewerSession, setViewerSession] = useState<{
    index: number;
    originFrame: Frame | null;
    base: MediaAsset[];
  } | null>(null);
  const viewerSessionRef = useRef(viewerSession);
  viewerSessionRef.current = viewerSession;

  // The tile whose photo is currently open — rendered as a gray slot.
  // Dimming waits for the open transition (dimming at press time would
  // expose the gray slot before the flight overlay has painted), and
  // re-targets on dismiss via getReturnFrame, mirroring PhotoBrowser.
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

  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  // Size enrichment: recompute viewer assets as tiles report natural
  // sizes (coalesced to one re-render per batch, PhotoBrowser-style)
  const [sizeVersion, setSizeVersion] = useState(0);
  const bumpScheduledRef = useRef(false);
  const handleImageLoad = useCallback(
    (assetId: string, width: number, height: number) => {
      if (tileSizeCache.has(assetId)) return;
      tileSizeCache.set(assetId, { width, height });
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
    const source = viewerSession?.base ?? assets;
    return source.map((asset) => {
      if (asset.width > 0 && asset.height > 0) return asset;
      const size = tileSizeCache.get(asset.id);
      return size ? { ...asset, ...size } : asset;
    });
  }, [assets, viewerSession, sizeVersion]);

  // Resolve a tile's on-screen rect; null when it's no longer visible
  // (scrolled out of the strip or off the page) so the viewer fades.
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

  const handleTilePress = useCallback(
    (assetId: string) => {
      const base = assetsRef.current;
      const index = base.findIndex((a) => a.id === assetId);
      if (index < 0) return;
      pendingViewedIdRef.current = assetId;
      frameForAsset(assetId).then((originFrame) => {
        setViewerSession({ index, originFrame, base });
      });
    },
    [frameForAsset],
  );

  const getReturnFrame = useCallback(
    (index: number) => {
      const base = viewerSessionRef.current?.base ?? assetsRef.current;
      const id = base[index]?.id;
      if (!id) return Promise.resolve<Frame | null>(null);
      // A dismiss is imminent — the gray slot must sit under the photo
      // the return flight will land on
      setViewedId(id);

      // The viewed photo may live in a tile that's scrolled out of the
      // strip (the user paged the viewer). Scroll it into view NOW —
      // the viewer's backdrop still hides the page — so the flight has
      // a slot to land in. Photos beyond the strip's cap have no tile
      // at all and take the viewer's fade fallback.
      const stripIndex = tilesRef.current.findIndex(
        (asset) => asset.id === id,
      );
      if (stripIndex < 0) return Promise.resolve<Frame | null>(null);

      const viewportW =
        stripViewportWRef.current || Dimensions.get("window").width;
      const tileStart = H_PADDING + stripIndex * (TILE_WIDTH + TILE_GAP);
      const visibleStart = stripScrollXRef.current;
      const fullyVisible =
        tileStart >= visibleStart &&
        tileStart + TILE_WIDTH <= visibleStart + viewportW;
      if (fullyVisible) {
        return frameForAsset(id);
      }

      // Center the tile, clamped by the ScrollView itself
      stripRef.current?.scrollTo({
        x: Math.max(0, tileStart - (viewportW - TILE_WIDTH) / 2),
        animated: false,
      });
      return new Promise<Frame | null>((resolve) => {
        // Let the scroll apply and tiles re-lay out before measuring
        requestAnimationFrame(() => {
          setTimeout(() => {
            frameForAsset(id).then(resolve);
          }, 30);
        });
      });
    },
    [frameForAsset],
  );

  const handleCloseViewer = useCallback(() => {
    pendingViewedIdRef.current = null;
    setViewerSession(null);
    setViewedId(null);
  }, []);

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.headerRow}
        onPress={onOpenAll}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${count} items, view all`}
      >
        {leading}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.headerCount}>{count}</Text>
        <Ionicons name="chevron-forward" size={13} color="#C7C7CC" />
      </Pressable>

      <ScrollView
        ref={stripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        onScroll={handleStripScroll}
        scrollEventThrottle={32}
        onLayout={handleStripLayout}
      >
        {tiles.map((asset) => (
          <SectionTile
            key={asset.id}
            asset={asset}
            popping={poppingIds?.includes(asset.id) === true}
            dimmed={asset.id === viewedId}
            badge={renderTileBadge?.(asset)}
            onPress={handleTilePress}
            registerRef={registerRef}
            onImageLoad={handleImageLoad}
          />
        ))}
        {overflow > 0 && (
          <Pressable
            style={styles.viewAllTile}
            onPress={onOpenAll}
            accessibilityRole="button"
            accessibilityLabel={`View all ${count}`}
          >
            <Text style={styles.viewAllCount}>+{overflow}</Text>
            <Text style={styles.viewAllLabel}>View all</Text>
          </Pressable>
        )}
      </ScrollView>

      <PhotoViewer
        visible={viewerSession !== null}
        assets={viewerAssets}
        initialIndex={viewerSession?.index ?? 0}
        originFrame={viewerSession?.originFrame ?? null}
        getReturnFrame={getReturnFrame}
        onClose={handleCloseViewer}
        onOpenTransitionStart={handleOpenTransitionStart}
        gridCornerRadius={TILE_RADIUS}
        renderSocialOverlay={renderSocialOverlay}
        renderPageAttribution={renderPageAttribution}
        onDoubleTapAsset={onDoubleTapAsset}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: H_PADDING,
    marginBottom: 10,
  },
  // Matches the sibling pages' section header voice (MomentsPage)
  headerTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerCount: {
    fontSize: 13,
    fontWeight: "600",
    color: "#C7C7CC",
    fontVariant: ["tabular-nums"],
  },
  strip: {
    paddingHorizontal: H_PADDING,
    gap: TILE_GAP,
  },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
  },
  tileFill: {
    flex: 1,
    borderRadius: TILE_RADIUS,
    overflow: "hidden",
    backgroundColor: "#F2F2F7",
  },
  tileImage: {
    width: "100%",
    height: "100%",
  },
  // Plain gray slot while the photo is open in the viewer — covers the
  // image (and any badges) completely, like the grid's dimmed cell
  tileDimmed: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#F2F2F7",
  },
  playBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    // Optically center the play triangle
    paddingLeft: 1,
  },
  viewAllTile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: TILE_RADIUS,
    backgroundColor: "#F2F2F7",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  viewAllCount: {
    fontSize: 17,
    fontWeight: "700",
    color: "#3C3C43",
    fontVariant: ["tabular-nums"],
  },
  viewAllLabel: {
    fontSize: 12,
    color: "#8E8E93",
  },
  // Like count, bottom-left (play badge keeps top-right)
  likeBadge: {
    position: "absolute",
    bottom: 5,
    left: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 9,
    paddingHorizontal: 6,
    height: 18,
  },
  likeBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});

export default GallerySectionRow;
