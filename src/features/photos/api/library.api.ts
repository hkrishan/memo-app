/**
 * Memo library API — the user's server-side "My Photos" archive.
 * Every capture uploads here (the base action); album copies are made from
 * existing library photos without re-uploading. Signed URLs, newest first.
 */

import { endpoints, httpClient } from "@/lib/api";
import { Photo, type MediaMetadata } from "@/features/album/types/album.types";

/** A single photo/video in the Memo library (server response shape). */
export interface LibraryPhoto {
  photoId: string;
  url: string;
  thumbnailUrl: string | null;
  /** See Photo.displayUrl — the size the viewer paints. */
  displayUrl?: string | null;
  mediaType: "photo" | "video";
  width: number | null;
  height: number | null;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  /** Albums this photo has been added to (via the source-library link).
   *  `photoId` is the album COPY's id — what removing from that album
   *  deletes. Empty for a pending capture whose copy isn't made yet. */
  albums?: { albumId: string; title: string; photoId: string }[];
  /** Custom media metadata (lives on the media object, so album copies
   *  share it) — e.g. { memoCreate: { pageCount } }. */
  metadata?: MediaMetadata | null;
}

/** One page of the library feed (newest first, cursor-paginated). */
export interface LibraryPage {
  photos: LibraryPhoto[];
  nextCursor: string | null;
}

export interface UploadLibraryPhotoParams {
  fileUri: string;
  fileName: string;
  mimeType: string;
  /** GPS position the photo was taken at, when known. */
  latitude?: number;
  longitude?: number;
  /** Custom metadata stored on the media object (JSON, server-capped). */
  metadata?: MediaMetadata;
}

/** Query key for the library feed — lives here (not in the queries module)
 *  so the non-React upload queue can invalidate it without an import cycle. */
export const libraryKeys = {
  all: ["library"] as const,
};

const LIBRARY_PAGE_LIMIT = 30;

const libraryApi = {
  /** A page of the library. Omit cursor for the newest page. */
  getLibrary: async (cursor?: string): Promise<LibraryPage> =>
    httpClient.get<LibraryPage>(endpoints.user.photos, {
      params: { limit: LIBRARY_PAGE_LIMIT, cursor },
    }),

  /** Upload a captured file to the library (multipart, field `photo`). */
  uploadLibraryPhoto: async ({
    fileUri,
    fileName,
    mimeType,
    latitude,
    longitude,
    metadata,
  }: UploadLibraryPhotoParams): Promise<LibraryPhoto> => {
    const formData = new FormData();
    formData.append("photo", {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);

    if (latitude !== undefined && longitude !== undefined) {
      formData.append("latitude", String(latitude));
      formData.append("longitude", String(longitude));
    }
    if (metadata !== undefined) {
      formData.append("metadata", JSON.stringify(metadata));
    }

    return httpClient.upload<LibraryPhoto>(endpoints.user.photos, formData);
  },

  deleteLibraryPhoto: async (photoId: string): Promise<void> =>
    httpClient.delete<void>(endpoints.user.photo(photoId)),

  /**
   * Copy an existing library photo into an album (server-side R2 copy — the
   * library copy stays put). Returns the created album photo.
   */
  addLibraryPhotoToAlbum: async (
    albumId: string,
    libraryPhotoId: string,
  ): Promise<Photo> =>
    httpClient.post<Photo>(endpoints.album.photosFromLibrary(albumId), {
      libraryPhotoId,
    }),
};

export default libraryApi;
