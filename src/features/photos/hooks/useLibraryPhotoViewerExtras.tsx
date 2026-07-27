/**
 * Wires the Memo-library per-photo actions (Add to album / Delete) into the
 * shared PhotoViewer via renderSocialOverlay, plus the delete pop-away
 * choreography (cells pop out optimistically and stay hidden until the
 * refetch removes them; a failed delete pops the cell back).
 */

import React, { useCallback, useEffect, useState } from "react";

import { MediaAsset } from "@/features/album/hooks";
import { LibraryPhotoActionsOverlay } from "../components/LibraryPhotoActionsOverlay";

interface SocialOverlayInfo {
  asset: MediaAsset;
  chromeVisible: boolean;
  visibility: import("react-native-reanimated").SharedValue<number>;
  bottomInset: number;
  requestClose: () => void;
}

export const useLibraryPhotoViewerExtras = (assets: MediaAsset[]) => {
  const [poppingIds, setPoppingIds] = useState<string[]>([]);

  const handleDeleteStarted = useCallback((photoId: string) => {
    setPoppingIds((ids) => (ids.includes(photoId) ? ids : [...ids, photoId]));
  }, []);
  const handleDeleteFailed = useCallback((photoId: string) => {
    setPoppingIds((ids) => ids.filter((id) => id !== photoId));
  }, []);

  // Drop ids once their assets are actually gone (the delete refetch landed)
  useEffect(() => {
    setPoppingIds((ids) => {
      if (ids.length === 0) return ids;
      const alive = ids.filter((id) => assets.some((a) => a.id === id));
      return alive.length === ids.length ? ids : alive;
    });
  }, [assets]);

  const renderSocialOverlay = useCallback(
    (info: SocialOverlayInfo) => {
      // Mid-upload captures (queue-local ids) get the same actions — the
      // overlay routes them through the upload queue instead of the server
      return (
        <LibraryPhotoActionsOverlay
          asset={info.asset}
          chromeVisible={info.chromeVisible}
          visibility={info.visibility}
          bottomInset={info.bottomInset}
          requestClose={info.requestClose}
          onDeleteStarted={handleDeleteStarted}
          onDeleteFailed={handleDeleteFailed}
        />
      );
    },
    [handleDeleteStarted, handleDeleteFailed],
  );

  return { renderSocialOverlay, poppingIds };
};
