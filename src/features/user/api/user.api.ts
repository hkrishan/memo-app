import { endpoints, httpClient } from "@/lib/api";
import { User } from "../types/user.types";

export type UpdateAvatarParams = {
  fileUri: string;
  fileName: string;
  mimeType: string;
};

export type UpdateProfileParams = {
  name: string;
};

const userApi = {
  getMe: async (): Promise<User> =>
    httpClient.get<User>(endpoints.user.profile),

  updateAvatar: async ({
    fileUri,
    fileName,
    mimeType,
  }: UpdateAvatarParams): Promise<User> => {
    const formData = new FormData();
    formData.append("avatar", {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any);
    // Camera photos can be several MB — allow more than the default 30s
    return httpClient.upload<User>(endpoints.user.avatar, formData, {
      timeout: 120000,
    });
  },

  updateProfile: async ({ name }: UpdateProfileParams): Promise<User> =>
    httpClient.put<User>(endpoints.user.profile, { name }),

  /** Permanently delete the account and all its data. */
  deleteAccount: async (): Promise<void> => {
    await httpClient.delete<{ message: string }>(endpoints.user.profile);
  },
};

export default userApi;
