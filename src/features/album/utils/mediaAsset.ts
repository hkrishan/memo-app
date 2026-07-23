import { MediaAsset } from "../hooks";
import { PhotoWithUploader } from "../types/album.types";

/** Album photo → grid/viewer asset shape. */
export const photoToMediaAsset = (photo: PhotoWithUploader): MediaAsset => ({
  id: photo.photoId,
  uri: photo.url,
  // Videos must never fall back to the video URL as a "thumbnail" —
  // expo-image can't render it. A null poster stays null so the grid /
  // viewer can show the dark play-glyph tile instead of a broken image.
  thumbnailUrl:
    photo.mediaType === "video"
      ? (photo.thumbnailUrl ?? null)
      : (photo.thumbnailUrl ?? photo.url),
  mediaType: photo.mediaType === "video" ? "video" : "photo",
  width: 0,
  height: 0,
  duration: 0,
  creationTime: new Date(photo.createdAt).getTime(),
  modificationTime: new Date(photo.createdAt).getTime(),
  likeCount: photo.social?.likeCount ?? 0,
});
