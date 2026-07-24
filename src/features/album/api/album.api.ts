import { endpoints, httpClient } from "@/lib/api";
import {
  Album,
  AlbumActivity,
  AlbumInviteLink,
  AlbumJoinRequest,
  AlbumMember,
  InviteInfo,
  Photo,
} from "../types/album.types";

export interface UploadPhotoParams {
  albumId: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  /** GPS position the photo was taken at, when known */
  latitude?: number;
  longitude?: number;
}

// The API returns the created Photo directly (photo.handler.ts responds
// with `res.json(photo)` — there is no wrapper object).
export type UploadPhotoResponse = Photo;

export interface UpdateAlbumParams {
  title?: string;
  description?: string | null;
  /** Photo from this album to use as cover; null resets to latest photo */
  coverPhotoId?: string | null;
}

const albumApi = {
  getAlbums: async () => httpClient.get<Album[]>(endpoints.album.list),

  getAlbum: async (albumId: string) =>
    httpClient.get<Album>(endpoints.album.get(albumId)),

  getAlbumMembers: async (albumId: string) =>
    httpClient.get<AlbumMember[]>(endpoints.album.members(albumId)),

  /**
   * Set the caller's identity color in this album. 400 invalid hex,
   * 409 when the color is already taken (while free colors remain).
   */
  setMyMemberColor: async (albumId: string, color: string) =>
    httpClient.put<{ color: string }>(endpoints.album.myMemberColor(albumId), {
      color,
    }),

  createAlbum: async (name: string) =>
    httpClient.post<Album>(endpoints.album.create, { title: name }),

  updateAlbum: async (albumId: string, input: UpdateAlbumParams) =>
    httpClient.put<Album>(endpoints.album.update(albumId), input),

  /** Owner only — removes the album, its photos and media */
  deleteAlbum: async (albumId: string) =>
    httpClient.delete<void>(endpoints.album.delete(albumId)),

  /** Members only — the owner must delete the album instead */
  leaveAlbum: async (albumId: string) =>
    httpClient.post<void>(endpoints.album.leave(albumId)),

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

  // ---- Invite links ----

  /** Idempotent get-or-create of the album's active invite link */
  getOrCreateInviteLink: async (albumId: string) =>
    httpClient.post<AlbumInviteLink>(endpoints.album.invites(albumId)),

  /** Revoke an invite link (idempotent) */
  revokeInviteLink: async (albumId: string, inviteId: string) =>
    httpClient.delete<void>(endpoints.album.invite(albumId, inviteId)),

  /** Invite preview for the accept screen — auth only, no membership needed */
  getInviteInfo: async (inviteId: string) =>
    httpClient.get<InviteInfo>(endpoints.invite.info(inviteId)),

  /** Accept an invite; idempotent when already a member */
  acceptInvite: async (inviteId: string) =>
    httpClient.post<{ albumId: string }>(endpoints.invite.accept(inviteId)),

  uploadPhoto: async ({
    albumId,
    fileUri,
    fileName,
    mimeType,
    latitude,
    longitude,
  }: UploadPhotoParams): Promise<UploadPhotoResponse> => {
    const formData = new FormData();

    // React Native requires this format for file uploads
    formData.append("photo", {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);

    if (latitude !== undefined && longitude !== undefined) {
      formData.append("latitude", String(latitude));
      formData.append("longitude", String(longitude));
    }

    return httpClient.upload<UploadPhotoResponse>(
      endpoints.album.uploadPhoto(albumId),
      formData,
    );
  },
};

export default albumApi;
