/**
 * Local-first album gallery: every photo on its way into this album, shown
 * from its LOCAL file (flagged `pending`, so tiles carry the uploading
 * badge) until the server copy actually appears in the album's photo list.
 * Nothing is dropped before its replacement is there, so the handover is
 * gapless — the same contract useMergedLibrary uses for "My Photos".
 *
 * Three sources, one per way a photo reaches an album:
 * - the library upload queue — camera captures, which upload to the Memo
 *   library first and are then linked into the album
 * - the album upload manager — the photo picker's batches, which upload
 *   straight to the album
 * - the album link store — library photos added from the viewer's album
 *   picker, where only the server-side link is outstanding
 *
 * All three are STORES on purpose. An optimistic row written into the
 * album's react-query cache instead would be erased by that album's next
 * photo refetch — which arrives a moment later and takes the tile with it.
 */

import { useMemo } from "react";

import { useLibraryUploadQueue } from "@/features/photos/store/libraryUploadQueue";
import { useUploadManagerStore } from "../store/uploadManager";
import { useAlbumLinkStore } from "../store/albumLinkStore";
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
  const uploads = useUploadManagerStore((state) => state.pending);
  const links = useAlbumLinkStore((state) => state.links);

  return useMemo<MediaAsset[]>(() => {
    if (
      !albumId ||
      (entries.length === 0 && uploads.length === 0 && links.length === 0)
    ) {
      return [];
    }
    const landed = new Set(photos?.map((photo) => photo.photoId));

    const assets: MediaAsset[] = [];

    // Library photos being linked into this album from the viewer's picker
    for (const link of links) {
      if (link.albumId !== albumId) continue;
      // The server row exists AND the list carries it — hand over, no gap
      if (link.albumPhotoId && landed.has(link.albumPhotoId)) continue;
      assets.push({
        id: `${PENDING_ID_PREFIX}link:${link.key}`,
        uri: link.url,
        thumbnailUrl: link.thumbnailUrl,
        mediaType: link.mediaType,
        width: link.width ?? 0,
        height: link.height ?? 0,
        duration: 0,
        creationTime: link.startedAt,
        modificationTime: link.startedAt,
        // The link call having returned means it IS in the album now — only
        // the refetch is outstanding, so the badge stops there
        pending: link.albumPhotoId == null && !link.failed,
        uploadFailed: link.failed,
      });
    }

    // Picker batches — the local file renders until the album's list carries
    // the row it created (the record itself lingers past that, so the server
    // tile can keep drawing the same local file)
    for (const upload of uploads) {
      if (upload.albumId !== albumId) continue;
      if (upload.albumPhotoId && landed.has(upload.albumPhotoId)) continue;
      assets.push({
        id: `${PENDING_ID_PREFIX}upload:${upload.uri}`,
        uri: upload.uri,
        thumbnailUrl: upload.uri,
        mediaType: "photo",
        // Sizes come with the server photo; the viewer fades in meanwhile
        width: 0,
        height: 0,
        duration: 0,
        creationTime: upload.startedAt,
        modificationTime: upload.startedAt,
        pending: !upload.uploaded && !upload.failed,
        uploadFailed: upload.failed,
      });
    }

    // Camera captures riding the library queue
    for (const entry of entries) {
      const target = entry.albumTargets.find((t) => t.albumId === albumId);
      if (!target) continue;
      // The album copy exists AND the list already carries it — the server
      // tile has taken over, so the local one retires with no gap
      if (target.albumPhotoId && landed.has(target.albumPhotoId)) continue;

      // An entry with no usable timestamp is still in flight NOW — never
      // let it fall back to epoch 0 and sort to the bottom
      const capturedAt = Date.parse(entry.capturedAt) || Date.now();
      assets.push({
        id: `${PENDING_ID_PREFIX}${entry.localId}`,
        uri: entry.fileUri,
        // A video file has no renderable image — the device-library poster
        // recorded at enqueue time stands in (null keeps the grid's dark
        // play-glyph tile rather than a broken cell)
        thumbnailUrl:
          entry.mediaType === "video"
            ? (entry.posterUri ?? null)
            : entry.fileUri,
        mediaType: entry.mediaType === "video" ? "video" : "photo",
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
  }, [albumId, entries, uploads, links, photos]);
};

/**
 * Local files for photos this device just put into the album, keyed by their
 * SERVER photoId.
 *
 * Handing a tile over from the local-first asset to the server one swaps a
 * file that is already on disk for a signed R2 URL that has never been
 * downloaded — so the cell goes blank exactly when the album finishes
 * loading, and only fills in once the thumbnail arrives. Feeding these to
 * the tile as expo-image's `placeholder` keeps the local pixels on screen
 * underneath until the remote image is actually decoded.
 *
 * Entries live as long as their local file does (the queue prunes settled
 * captures about a minute after they land), which is far longer than a
 * thumbnail fetch.
 */
export const useAlbumLocalPlaceholders = (
  albumId: string | undefined,
): Map<string, string> => {
  const entries = useLibraryUploadQueue((state) => state.entries);
  const uploads = useUploadManagerStore((state) => state.pending);

  return useMemo(() => {
    const byPhotoId = new Map<string, string>();
    if (!albumId) return byPhotoId;

    for (const entry of entries) {
      const target = entry.albumTargets.find((t) => t.albumId === albumId);
      if (!target?.albumPhotoId) continue;
      // Videos hand over their poster, photos the capture itself
      const local =
        entry.mediaType === "video" ? entry.posterUri : entry.fileUri;
      if (local) byPhotoId.set(target.albumPhotoId, local);
    }

    for (const upload of uploads) {
      if (upload.albumId !== albumId || !upload.albumPhotoId) continue;
      byPhotoId.set(upload.albumPhotoId, upload.uri);
    }

    return byPhotoId;
  }, [albumId, entries, uploads]);
};
