import { endpoints, httpClient } from "@/lib/api";
import { Photo, PhotoWithUploader } from "../types/album.types";

export type UploadPhotoParams = {
  albumId: string;
  uri: string;
  mimeType: string;
  caption?: string;
};

const photoApi = {
  getPhotos: async (albumId: string) =>
    httpClient.get<PhotoWithUploader[]>(endpoints.album.photos(albumId)),

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

  deletePhoto: async (albumId: string, photoId: string) =>
    httpClient.delete<void>(endpoints.album.deletePhoto(albumId, photoId)),
};

export default photoApi;
