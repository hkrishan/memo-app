import { endpoints, httpClient } from "@/lib/api";
import {
  AlbumTagCount,
  Photo,
  PhotoComment,
  PhotoTag,
  PhotoWithUploader,
} from "../types/album.types";

export type UploadPhotoParams = {
  albumId: string;
  uri: string;
  mimeType: string;
  caption?: string;
};

/** One page of an album's photos, newest first. */
export type AlbumPhotoPage = {
  photos: PhotoWithUploader[];
  nextCursor: string | null;
};

const photoApi = {
  getPhotos: async (albumId: string, limit: number, cursor?: string) =>
    httpClient.get<AlbumPhotoPage>(endpoints.album.photos(albumId), {
      params: { limit, ...(cursor && { cursor }) },
    }),

  uploadPhoto: async ({ albumId, uri, mimeType, caption }: UploadPhotoParams) => {
    const formData = new FormData();

    // Get filename from URI
    const filename = uri.split("/").pop() ?? "photo";

    // Append file to FormData
    formData.append("file", {
      uri,
      type: mimeType,
      name: filename,
    } as unknown as Blob);

    if (caption) {
      formData.append("caption", caption);
    }

    return httpClient.upload<Photo>(endpoints.album.uploadPhoto(albumId), formData);
  },

  /** alsoLibrary → "delete everywhere": the server also removes the
   *  uploader's linked Memo-library copy (uploader only). */
  deletePhoto: async (albumId: string, photoId: string, alsoLibrary = false) =>
    httpClient.delete<void>(
      endpoints.album.deletePhoto(albumId, photoId) +
        (alsoLibrary ? "?alsoLibrary=true" : ""),
    ),

  likePhoto: async (albumId: string, photoId: string) =>
    httpClient.post<{ likeCount: number; likedByMe: boolean }>(
      endpoints.album.photoLike(albumId, photoId),
    ),

  unlikePhoto: async (albumId: string, photoId: string) =>
    httpClient.delete<{ likeCount: number; likedByMe: boolean }>(
      endpoints.album.photoLike(albumId, photoId),
    ),

  getComments: async (albumId: string, photoId: string) =>
    httpClient.get<{ comments: PhotoComment[] }>(
      endpoints.album.photoComments(albumId, photoId),
    ),

  addComment: async (albumId: string, photoId: string, content: string) =>
    httpClient.post<PhotoComment>(
      endpoints.album.photoComments(albumId, photoId),
      { content },
    ),

  deleteComment: async (albumId: string, photoId: string, commentId: string) =>
    httpClient.delete<void>(
      endpoints.album.photoComment(albumId, photoId, commentId),
    ),

  tagPhoto: async (albumId: string, photoId: string, tag: string) =>
    httpClient.post<{ tags: PhotoTag[] }>(
      endpoints.album.photoTags(albumId, photoId),
      { tag },
    ),

  untagPhoto: async (albumId: string, photoId: string, tag: string) =>
    httpClient.delete<{ tags: PhotoTag[] }>(
      endpoints.album.photoTag(albumId, photoId, tag),
    ),

  getAlbumPhotoTags: async (albumId: string) =>
    httpClient.get<{ tags: AlbumTagCount[] }>(
      endpoints.album.albumPhotoTags(albumId),
    ),
};

export default photoApi;
