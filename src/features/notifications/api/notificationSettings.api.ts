import { endpoints, httpClient } from "@/lib/api";

export type AlbumNotificationSettings = {
  memberJoined: boolean;
  photoUploaded: boolean;
  comments: boolean;
  likes: boolean;
  moments: boolean;
};

export type UpdateAlbumNotificationSettingsInput =
  Partial<AlbumNotificationSettings>;

const notificationSettingsApi = {
  getSettings: async (albumId: string) =>
    httpClient.get<AlbumNotificationSettings>(
      endpoints.album.notificationSettings(albumId),
    ),

  updateSettings: async (
    albumId: string,
    input: UpdateAlbumNotificationSettingsInput,
  ) =>
    httpClient.put<AlbumNotificationSettings>(
      endpoints.album.notificationSettings(albumId),
      input,
    ),
};

export default notificationSettingsApi;
