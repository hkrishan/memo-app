/**
 * The album-aware layer every PhotoViewer surface shares: the
 * like/comment/tag overlay, double-tap-to-like, and the delete
 * choreography (pop the cell away optimistically, pop it back on
 * failure, prune once the refetch actually lands).
 *
 * Used by the Gallery tab's overview rows, the pushed full-gallery
 * grid, and anywhere else an album photo opens fullscreen — the
 * delicate delete/like wiring lives in exactly one place.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { SharedValue } from "react-native-reanimated";

import { AlbumPhotoSocialOverlay } from "../components/photoSocial";
import type { AlbumPhotoSocialOverlayHandle } from "../components/photoSocial/AlbumPhotoSocialOverlay";
import { MediaAsset } from "./useMediaLibrary";

export interface SocialOverlayInfo {
  asset: MediaAsset;
  chromeVisible: boolean;
  intro: SharedValue<number>;
  visibility: SharedValue<number>;
  bottomInset: number;
  requestClose: () => void;
}

export const useAlbumPhotoViewerExtras = (
  albumId: string | undefined,
  assets: MediaAsset[],
) => {
  const socialOverlayRef = useRef<AlbumPhotoSocialOverlayHandle>(null);

  // Photos mid-deletion: their cells play a pop-away and stay invisible
  // until the refetch actually removes them. A failed delete pops the
  // cell back in.
  const [poppingIds, setPoppingIds] = useState<string[]>([]);
  const handleDeleteStarted = useCallback((photoId: string) => {
    setPoppingIds((ids) => (ids.includes(photoId) ? ids : [...ids, photoId]));
  }, []);
  const handleDeleteFailed = useCallback((photoId: string) => {
    setPoppingIds((ids) => ids.filter((id) => id !== photoId));
  }, []);
  // Prune ids whose assets are gone (the deletion refetch landed)
  useEffect(() => {
    setPoppingIds((ids) => {
      if (ids.length === 0) return ids;
      const alive = ids.filter((id) =>
        assets.some((asset) => asset.id === id),
      );
      return alive.length === ids.length ? ids : alive;
    });
  }, [assets]);

  const renderSocialOverlay = useCallback(
    (info: SocialOverlayInfo) =>
      albumId ? (
        <AlbumPhotoSocialOverlay
          ref={socialOverlayRef}
          albumId={albumId}
          asset={info.asset}
          chromeVisible={info.chromeVisible}
          intro={info.intro}
          visibility={info.visibility}
          bottomInset={info.bottomInset}
          requestClose={info.requestClose}
          onDeleteStarted={handleDeleteStarted}
          onDeleteFailed={handleDeleteFailed}
        />
      ) : null,
    [albumId, handleDeleteStarted, handleDeleteFailed],
  );

  // Double-tap on the fullscreen photo = like (with the overlay's heart
  // burst). Pass the asset the VIEWER resolved from its live scroll
  // position — the overlay's own prop can be a page behind mid-settle
  const onDoubleTapAsset = useCallback((asset: MediaAsset) => {
    socialOverlayRef.current?.doubleTapLike(asset.id);
  }, []);

  return {
    renderSocialOverlay: albumId ? renderSocialOverlay : undefined,
    onDoubleTapAsset: albumId ? onDoubleTapAsset : undefined,
    poppingIds,
  };
};
