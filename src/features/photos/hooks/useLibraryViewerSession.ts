/**
 * One Memo-library viewer, shared by every surface that opens it.
 *
 * The camera's last-capture thumbnail and the My Albums tab's "My Photos"
 * strip both page through the same library, so they get the same carousel:
 * the merged (local-first) library, the like/delete/add-to-album overlay,
 * cursor pagination, and the natural-size resolution the zoom flight needs.
 *
 * Callers own only the ORIGIN of the flight — a fixed thumbnail hands over
 * one frame, a scrolling strip re-measures its cell per index — so that is
 * the single thing passed in.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { Image as RNImage } from "react-native";

import { MediaAsset } from "@/features/album/hooks";
import type { Frame } from "../components";
import { useMergedLibrary } from "../api/library.queries";
import { libraryPhotoToAsset } from "../utils/libraryAsset";
import { useLibraryPhotoViewerExtras } from "./useLibraryPhotoViewerExtras";

/** How long a tap waits on a size lookup before opening with a fade. */
const SIZE_RESOLVE_CAP_MS = 250;

export interface LibraryViewerSession {
  /** Everything the viewer pages over, newest (and pending) first. */
  assets: MediaAsset[];
  /** The newest item, for a "last capture" style thumbnail. */
  newest: { uri: string; mediaType: "photo" | "video" } | null;
  /** Spread straight onto <PhotoViewer />. */
  viewerProps: {
    visible: boolean;
    assets: MediaAsset[];
    initialIndex: number;
    originFrame: Frame | null;
    getReturnFrame: (index: number) => Promise<Frame | null>;
    onClose: () => void;
    onEndReached: () => void;
    onActiveIndexChange: (index: number) => void;
    renderSocialOverlay: ReturnType<
      typeof useLibraryPhotoViewerExtras
    >["renderSocialOverlay"];
  };
  /** Opens at `index`, flying out of `originFrame`. */
  open: (index: number, originFrame: Frame | null) => void;
}

export interface UseLibraryViewerSessionOptions {
  /**
   * Where a dismiss should fly back to. Defaults to the frame the viewer
   * was opened from, which is right for a fixed thumbnail; a strip passes
   * its own resolver so the photo returns to its (possibly scrolled) cell.
   */
  getReturnFrame?: (index: number) => Promise<Frame | null>;
  /** Cap on how many library photos to page over (the strip shows a slice). */
  limit?: number;
}

export const useLibraryViewerSession = (
  options: UseLibraryViewerSessionOptions = {},
): LibraryViewerSession => {
  const { getReturnFrame: getReturnFrameOverride, limit } = options;

  const {
    photos: libraryPhotos,
    fetchNextPage,
    hasNextPage,
  } = useMergedLibrary();

  const photos = useMemo(
    () => (limit == null ? libraryPhotos : libraryPhotos.slice(0, limit)),
    [libraryPhotos, limit],
  );

  // Natural sizes for the zoom flight: PhotoViewer only flies when the
  // asset's dimensions are known (unknown sizes fall back to a fade).
  // Photos carry real dimensions now (server-stored, or measured for local
  // captures) — this only covers rows that predate dimension storage.
  const sizeCacheRef = useRef(new Map<string, { width: number; height: number }>());
  const [sizeVersion, setSizeVersion] = useState(0);

  const ensureAssetSize = useCallback(
    (asset: MediaAsset | undefined) =>
      new Promise<void>((resolve) => {
        if (
          !asset ||
          (asset.width > 0 && asset.height > 0) ||
          sizeCacheRef.current.has(asset.id)
        ) {
          resolve();
          return;
        }
        RNImage.getSize(
          asset.thumbnailUrl || asset.uri,
          (width, height) => {
            if (width > 0 && height > 0) {
              sizeCacheRef.current.set(asset.id, { width, height });
              setSizeVersion((v) => v + 1);
            }
            resolve();
          },
          () => resolve(),
        );
      }),
    [],
  );

  const assets = useMemo(() => {
    // sizeVersion invalidates this memo when a size resolves
    void sizeVersion;
    return photos.map((photo) => {
      const asset = libraryPhotoToAsset(photo);
      const size = sizeCacheRef.current.get(asset.id);
      return size ? { ...asset, ...size } : asset;
    });
  }, [photos, sizeVersion]);
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const newest = useMemo(() => {
    const first = photos[0];
    if (!first) return null;
    return {
      uri: first.thumbnailUrl ?? first.url,
      mediaType: first.mediaType === "video" ? ("video" as const) : ("photo" as const),
    };
  }, [photos]);

  const { renderSocialOverlay } = useLibraryPhotoViewerExtras(assets);

  const [session, setSession] = useState<{
    index: number;
    originFrame: Frame | null;
  } | null>(null);

  const open = useCallback(
    (index: number, originFrame: Frame | null) => {
      // The flight needs the opened asset's natural size — resolve it first
      // (local files resolve instantly; the cap keeps the tap snappy if a
      // network thumb dawdles, degrading to the fade open)
      let opened = false;
      const show = () => {
        if (opened) return;
        opened = true;
        setSession({ index, originFrame });
      };
      void ensureAssetSize(assetsRef.current[index]).then(show);
      setTimeout(show, SIZE_RESOLVE_CAP_MS);
    },
    [ensureAssetSize],
  );

  const close = useCallback(() => setSession(null), []);

  const handleActiveIndexChange = useCallback(
    (index: number) => {
      // Pre-resolve the active page's size so a dismiss from it can fly
      void ensureAssetSize(assetsRef.current[index]);
    },
    [ensureAssetSize],
  );

  const handleEndReached = useCallback(() => {
    // A limited strip doesn't page — it's a preview of the library
    if (limit == null && hasNextPage) fetchNextPage();
  }, [limit, hasNextPage, fetchNextPage]);

  const originFrameRef = useRef<Frame | null>(null);
  originFrameRef.current = session?.originFrame ?? null;
  const getReturnFrame = useCallback(
    async (index: number) =>
      getReturnFrameOverride
        ? getReturnFrameOverride(index)
        : originFrameRef.current,
    [getReturnFrameOverride],
  );

  return {
    assets,
    newest,
    open,
    viewerProps: {
      visible: session !== null,
      assets,
      initialIndex: session?.index ?? 0,
      originFrame: session?.originFrame ?? null,
      getReturnFrame,
      onClose: close,
      onEndReached: handleEndReached,
      onActiveIndexChange: handleActiveIndexChange,
      renderSocialOverlay,
    },
  };
};
