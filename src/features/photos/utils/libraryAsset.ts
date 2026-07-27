/**
 * Adapts a Memo-library photo to the MediaAsset shape the shared photo grid
 * and viewer consume. Server photos arrive without pixel dimensions; the
 * PhotoBrowser/PhotoViewer enrich sizes from the thumbnails at load time, so
 * 0/0 here is fine (they fall back to a fade until sizes are known).
 */

import { MediaAsset } from "@/features/album/hooks";
import { LibraryPhoto } from "../api/library.api";

export const libraryPhotoToAsset = (photo: LibraryPhoto): MediaAsset => {
  const createdAt = Date.parse(photo.createdAt) || 0;
  return {
    id: photo.photoId,
    uri: photo.url,
    // A video must never fall back to the video URL as its "thumbnail" —
    // expo-image can't render one. Null stays null so grids/viewers show
    // the play-glyph tile instead (mirrors photoToMediaAsset).
    thumbnailUrl:
      photo.mediaType === "video"
        ? (photo.thumbnailUrl ?? null)
        : (photo.thumbnailUrl ?? photo.url),
    mediaType: photo.mediaType === "video" ? "video" : "photo",
    displayUrl: photo.displayUrl ?? null,
    width: photo.width ?? 0,
    height: photo.height ?? 0,
    duration: 0,
    creationTime: createdAt,
    modificationTime: createdAt,
  };
};
