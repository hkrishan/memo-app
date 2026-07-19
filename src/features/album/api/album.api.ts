import { endpoints, httpClient } from "@/lib/api";
import {
  Album,
  AlbumActivity,
  AlbumJoinRequest,
  AlbumMember,
  Photo,
} from "../types/album.types";

export interface UploadPhotoParams {
  albumId: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
}

export interface UploadPhotoResponse {
  photo: Photo;
  message: string;
}

const albumApi = {
  getAlbums: async () => httpClient.get<Album[]>(endpoints.album.list),

  getAlbum: async (albumId: string) =>
    httpClient.get<Album>(endpoints.album.get(albumId)),

  getAlbumMembers: async (albumId: string) =>
    httpClient.get<AlbumMember[]>(endpoints.album.members(albumId)),

  createAlbum: async (name: string) =>
    httpClient.post<Album>(endpoints.album.create, { title: name }),

  joinAlbum: async (inviteCode: string) =>
    httpClient.post<Album>(endpoints.album.join, { code: inviteCode }),

  getAlbumActivities: async (albumId: string) =>
    httpClient.get<AlbumActivity[]>(endpoints.album.activities(albumId)),

  getAlbumPendingJoinRequests: async (albumId: string) =>
    httpClient.get<AlbumJoinRequest[]>(
      endpoints.album.pendingJoinRequests(albumId),
    ),

  acceptJoinRequest: async (albumId: string, requestId: string) =>
    httpClient.post(endpoints.album.acceptJoinRequest(albumId, requestId)),

  rejectJoinRequest: async (albumId: string, requestId: string) =>
    httpClient.post(endpoints.album.rejectJoinRequest(albumId, requestId)),

  uploadPhoto: async ({
    albumId,
    fileUri,
    fileName,
    mimeType,
  }: UploadPhotoParams): Promise<UploadPhotoResponse> => {
    const formData = new FormData();

    // React Native requires this format for file uploads
    formData.append("photo", {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);

    return httpClient.upload<UploadPhotoResponse>(
      endpoints.album.uploadPhoto(albumId),
      formData,
    );
  },
};

export default albumApi;
