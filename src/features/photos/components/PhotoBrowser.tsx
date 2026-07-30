/**
 * PhotoBrowser Component
 * The packaged camera-roll experience: a tappable CameraRollGrid wired to
 * the fullscreen PhotoViewer. Dropping this one component in gives a screen
 * the full zoom-flight open, pinch/pan/double-tap, pan-to-dismiss with the
 * return flight into the exact grid cell, and iOS-Photos-style dimming of
 * the slot being previewed.
 *
 * It owns everything call sites used to duplicate:
 * - Viewer session state (tapped index + the pressed cell's window frame)
 * - viewedIndex dimming that follows page swipes in the viewer
 * - getReturnFrame plumbing from the viewer back into the grid
 *
 * Dimension enrichment:
 * Server-backed assets can arrive with width/height 0, and PhotoViewer
 * deliberately falls back to fades for unknown dimensions. The grid reports
 * each thumbnail's natural size on load (a thumbnail preserves the aspect
 * ratio, which is all the flight's fitRect math needs); those sizes are
 * cached in a ref and merged into the assets handed to the viewer. By the
 * time a user can tap a visible thumbnail its size is cached and the flight
 * runs; an asset that somehow still has no size keeps the graceful fade
 * fallback. Cache writes coalesce into at most one re-render per batch.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SharedValue } from "react-native-reanimated";
import { MediaAsset } from "@/features/album/hooks";
import { CameraRollGrid, CameraRollGridHandle } from "./CameraRollGrid";
import { PhotoViewer } from "./PhotoViewer";
import { Frame } from "./types";
import {
  retryAllFailedUploads,
  showWaitingForConnectionNotice,
} from "@/features/photos/uploadRetry";

/** Viewer session: the tapped index plus the grid cell it expands from. */
interface ViewerSession {
  index: number;
  originFrame: Frame | null;
}

export interface PhotoBrowserProps {
  assets: MediaAsset[];
  /** Grid columns (default 4). */
  numColumns?: number;
  /**
   * iOS-Photos-style month/year sections + fast-scroll scrubber in the
   * grid (default false). Purely presentational inside the grid — all
   * index contracts stay asset-index based, so the viewer is unaffected.
   */
  sectioned?: boolean;
  /** Pagination for both the grid and the viewer's pager. */
  onEndReached?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  ListHeaderComponent?: React.ReactElement;
  ListEmptyComponent?: React.ComponentType | React.ReactElement | null;
  /** Total library count for the viewer's "n of M" counter. */
  totalCount?: number | null;
  /** Grid scroll offset mirror for collapsing headers. */
  animatedScrollY?: SharedValue<number>;
  /** Bottom padding of the grid's list content. */
  contentBottomPadding?: number;
  /** Passed through to the viewer — see PhotoViewerProps. */
  renderSocialOverlay?: (info: {
    asset: MediaAsset;
    chromeVisible: boolean;
    intro: SharedValue<number>;
    visibility: SharedValue<number>;
    bottomInset: number;
    requestClose: () => void;
  }) => React.ReactNode;
  /** Passed through to the viewer — the per-page uploader pill. */
  renderPageAttribution?: (asset: MediaAsset) => React.ReactNode;
  /** Passed through to the viewer — see PhotoViewerProps. */
  onDoubleTapAsset?: (asset: MediaAsset) => void;
  /** Asset ids mid-deletion — their grid cells pop away. */
  poppingIds?: string[];
  /**
   * Deep link: open the viewer on this asset as soon as it appears in
   * `assets` (once per mount). No origin frame — the viewer fades in.
   */
  autoOpenAssetId?: string;
}

export const PhotoBrowser: React.FC<PhotoBrowserProps> = ({
  assets,
  numColumns = 4,
  sectioned = false,
  onEndReached,
  refreshing,
  onRefresh,
  isLoadingMore,
  hasMore,
  ListHeaderComponent,
  ListEmptyComponent,
  totalCount,
  animatedScrollY,
  contentBottomPadding,
  renderSocialOverlay,
  renderPageAttribution,
  onDoubleTapAsset,
  poppingIds,
  autoOpenAssetId,
}) => {
  const gridRef = useRef<CameraRollGridHandle>(null);

  const [viewerSession, setViewerSession] = useState<ViewerSession | null>(
    null,
  );
  // The photo currently on screen in the viewer, tracked by ID (indices
  // into a live query array can shift under an open viewer)
  const [viewedId, setViewedId] = useState<string | null>(null);
  // The array the open viewer pages over. It follows the live assets for
  // pure appends (pagination keeps flowing into the viewer) but FREEZES if
  // a refetch prepends/removes items — a numeric FlatList offset over a
  // shifted array would silently change which photo the user is looking at.
  const [viewerBase, setViewerBase] = useState<MediaAsset[] | null>(null);

  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const viewerBaseRef = useRef(viewerBase);
  viewerBaseRef.current = viewerBase;

  useEffect(() => {
    if (!viewerBase || viewerBase === assets) return;
    const n = viewerBase.length;
    const isPureAppend =
      n > 0 &&
      assets.length >= n &&
      assets[0]?.id === viewerBase[0]?.id &&
      assets[n - 1]?.id === viewerBase[n - 1]?.id;
    if (isPureAppend) {
      setViewerBase(assets);
    }
    // Otherwise: keep the frozen array — the viewer stays on the photo the
    // user opened; dimming and return flights translate by id below
  }, [assets, viewerBase]);

  // ---------------------------------------------------------------------
  // Dimension enrichment (natural thumbnail sizes for size-less assets)
  // ---------------------------------------------------------------------

  const sizeCacheRef = useRef<Map<string, { width: number; height: number }>>(
    new Map(),
  );
  const bumpScheduledRef = useRef(false);
  const [sizeVersion, setSizeVersion] = useState(0);

  // Only wire the load hook up when some asset actually lacks dimensions —
  // the common device-library case pays zero overhead
  const needsEnrichment = useMemo(
    () => assets.some((asset) => !(asset.width > 0 && asset.height > 0)),
    [assets],
  );

  const handleCellImageLoad = useCallback(
    (assetId: string, width: number, height: number) => {
      if (!(width > 0 && height > 0)) return;
      const cache = sizeCacheRef.current;
      if (cache.has(assetId)) return;
      cache.set(assetId, { width, height });
      // Coalesce a burst of onLoads (a whole visible grid page) into a
      // single version bump — one re-render per batch, not per image
      if (bumpScheduledRef.current) return;
      bumpScheduledRef.current = true;
      queueMicrotask(() => {
        bumpScheduledRef.current = false;
        setSizeVersion((version) => version + 1);
      });
    },
    [],
  );

  // The grid renders the raw assets; the viewer gets sizes merged in so its
  // flights have real aspect ratios to fly with
  const viewerSource = viewerBase ?? assets;
  const enrichedAssets = useMemo(() => {
    if (!needsEnrichment) return viewerSource;
    // Recomputed as thumbnail sizes arrive
    void sizeVersion;
    const cache = sizeCacheRef.current;
    return viewerSource.map((asset) => {
      if (asset.width > 0 && asset.height > 0) return asset;
      const size = cache.get(asset.id);
      return size
        ? { ...asset, width: size.width, height: size.height }
        : asset;
    });
  }, [viewerSource, needsEnrichment, sizeVersion]);

  // Grid dimming maps the viewed ID back into the LIVE array, so the gray
  // slot stays on the right photo even after a prepend shifted indices
  const dimmedIndex = useMemo(() => {
    if (viewedId === null) return null;
    const index = assets.findIndex((asset) => asset.id === viewedId);
    return index >= 0 ? index : null;
  }, [assets, viewedId]);

  // ---------------------------------------------------------------------
  // Viewer session
  // ---------------------------------------------------------------------

  // Dimming the pressed cell is deferred until the viewer's open
  // transition actually starts — dimming at press time exposes a gray
  // cell for the frames the flight overlay hasn't painted yet (visible
  // as a flicker with server thumbnails, which decode slower than
  // device-library ones)
  const pendingViewedIdRef = useRef<string | null>(null);

  const handlePressItem = useCallback(
    (index: number, originFrame: Frame | null) => {
      const current = assetsRef.current;
      // Parked for the network: the tap explains the wait (upload resumes
      // by itself on reconnect)
      if (current[index]?.uploadOffline) {
        showWaitingForConnectionNotice();
        return;
      }
      // Tapping a failed upload IS the retry (Snapchat's tap-to-retry)
      if (current[index]?.uploadFailed) {
        retryAllFailedUploads();
        return;
      }
      setViewerSession({ index, originFrame });
      setViewerBase(current);
      pendingViewedIdRef.current = current[index]?.id ?? null;
    },
    [],
  );

  const handleOpenTransitionStart = useCallback(() => {
    if (pendingViewedIdRef.current != null) {
      setViewedId(pendingViewedIdRef.current);
      pendingViewedIdRef.current = null;
    }
  }, []);

  // Deep-linked photo (e.g. a "added a new photo" notification tap): open
  // the viewer once the asset is present — once per mount, and never over
  // a viewer the user already opened themselves.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!autoOpenAssetId || autoOpenedRef.current || viewerSession) return;
    const index = assets.findIndex((asset) => asset.id === autoOpenAssetId);
    if (index < 0) return;
    autoOpenedRef.current = true;
    handlePressItem(index, null);
  }, [autoOpenAssetId, assets, viewerSession, handlePressItem]);

  const handleCloseViewer = useCallback(() => {
    pendingViewedIdRef.current = null;
    setViewerSession(null);
    setViewerBase(null);
    setViewedId(null);
  }, []);

  // The viewer resolves the grid cell to fly back to on dismiss. Viewer
  // indices are translated by photo ID into the live grid array (the two
  // can diverge after a refetch); an id no longer in the grid — or a
  // missing grid — resolves null and the viewer takes its fade fallback.
  //
  // The grid's preview dim also updates HERE, not on every page settle:
  // while the viewer is open its opaque backdrop hides the grid, so
  // re-dimming per swipe was pure cost — a full grid re-render (extraData
  // includes dimmedIndex) plus a PhotoBrowser+viewer re-render on every
  // swipe, the main source of paging jank in large albums. getReturnFrame
  // fires exactly when a dismiss may reveal the grid (pan-start prefetch /
  // close press), while the backdrop still occludes it — the dim lands on
  // the right cell before anything shows through.
  const getReturnFrame = useCallback((index: number) => {
    const base = viewerBaseRef.current ?? assetsRef.current;
    const id = base[index]?.id;
    if (!id) return Promise.resolve<Frame | null>(null);
    setViewedId(id);
    const liveIndex =
      base === assetsRef.current
        ? index
        : assetsRef.current.findIndex((asset) => asset.id === id);
    if (liveIndex < 0) return Promise.resolve<Frame | null>(null);
    return (
      gridRef.current?.getReturnFrame(liveIndex) ??
      Promise.resolve<Frame | null>(null)
    );
  }, []);

  return (
    <>
      <CameraRollGrid
        ref={gridRef}
        assets={assets}
        numColumns={numColumns}
        sectioned={sectioned}
        onPressItem={handlePressItem}
        onEndReached={onEndReached}
        refreshing={refreshing}
        onRefresh={onRefresh}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        dimmedIndex={dimmedIndex}
        onCellImageLoad={needsEnrichment ? handleCellImageLoad : undefined}
        animatedScrollY={animatedScrollY}
        contentBottomPadding={contentBottomPadding}
        poppingIds={poppingIds}
      />
      {/* Mounted only while open (onClose fires post-animation) */}
      {viewerSession !== null && (
        <PhotoViewer
          visible
          assets={enrichedAssets}
          initialIndex={viewerSession.index}
          originFrame={viewerSession.originFrame}
          getReturnFrame={getReturnFrame}
          onClose={handleCloseViewer}
          onOpenTransitionStart={handleOpenTransitionStart}
          onEndReached={onEndReached}
          totalCount={totalCount}
          renderSocialOverlay={renderSocialOverlay}
          renderPageAttribution={renderPageAttribution}
          onDoubleTapAsset={onDoubleTapAsset}
        />
      )}
    </>
  );
};

export default PhotoBrowser;
