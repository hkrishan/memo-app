/**
 * Local-first album gallery.
 *
 * A capture taken with the album camera goes into the library upload queue
 * (see libraryUploadQueue): it uploads to the Memo library first, then gets
 * copied into the album server-side. Until that copy lands in the album's
 * photo list the album had nothing to show — walking straight into the album
 * after the shutter meant staring at a gallery missing the photo you just
 * took.
 *
 * This hook surfaces those in-flight captures as MediaAssets rendered from
 * their LOCAL file, flagged `pending` so tiles can show the uploading badge.
 * A local asset is dropped only once its album copy actually appears in the
 * server list, so the handover is gapless (the same contract useMergedLibrary
 * uses for "My Photos").
 */

import { useMemo } from "react";

import { useLibraryUploadQueue } from "@/features/photos/store/libraryUploadQueue";
import { PhotoWithUploader } from "../types/album.types";
import { MediaAsset } from "./useMediaLibrary";

/** Prefix keeping local ids clear of server photoIds. */
const PENDING_ID_PREFIX = "pending:";

/** True for assets produced by this hook (never a server photo). */
export const isPendingAssetId = (id: string): boolean =>
  id.startsWith(PENDING_ID_PREFIX);

export const useAlbumPendingAssets = (
  albumId: string | undefined,
  /** The album's server photos — decides when a local tile can hand over. */
  photos: PhotoWithUploader[] | undefined,
): MediaAsset[] => {
  const entries = useLibraryUploadQueue((state) => state.entries);

  return useMemo<MediaAsset[]>(() => {
    if (!albumId || entries.length === 0) return [];
    const landed = new Set(photos?.map((photo) => photo.photoId));

    const assets: MediaAsset[] = [];
    for (const entry of entries) {
      const target = entry.albumTargets.find((t) => t.albumId === albumId);
      if (!target) continue;
      // The album copy exists AND the list already carries it — the server
      // tile has taken over, so the local one retires with no gap
      if (target.albumPhotoId && landed.has(target.albumPhotoId)) continue;

      const capturedAt = Date.parse(entry.capturedAt) || 0;
      assets.push({
        id: `${PENDING_ID_PREFIX}${entry.localId}`,
        uri: entry.fileUri,
        thumbnailUrl: entry.fileUri,
        mediaType: "photo",
        // Measured at enqueue time from the local file — the viewer can fit
        // the photo without waiting on a network round-trip
        width: entry.width ?? 0,
        height: entry.height ?? 0,
        duration: 0,
        creationTime: capturedAt,
        modificationTime: capturedAt,
        // The copy call having returned means the photo IS in the album now
        // (only the refetch is outstanding) — the badge stops there
        pending: target.albumPhotoId == null && entry.status !== "failed",
        uploadFailed: entry.status === "failed",
      });
    }
    return assets;
  }, [albumId, entries, photos]);
};
