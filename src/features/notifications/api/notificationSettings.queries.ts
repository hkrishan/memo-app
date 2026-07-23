import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import notificationSettingsApi, {
  AlbumNotificationSettings,
  UpdateAlbumNotificationSettingsInput,
} from "./notificationSettings.api";

const settingsKey = (albumId: string) => [
  "albums",
  albumId,
  "notification-settings",
];

export const useAlbumNotificationSettingsQuery = (albumId: string) => {
  return useQuery({
    queryKey: settingsKey(albumId),
    queryFn: () => notificationSettingsApi.getSettings(albumId),
    enabled: !!albumId,
    staleTime: 60 * 1000,
  });
};

export const useUpdateAlbumNotificationSettingsMutation = (albumId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateAlbumNotificationSettingsInput) =>
      notificationSettingsApi.updateSettings(albumId, input),
    // Optimistic: flip the switch immediately, roll back on failure
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: settingsKey(albumId) });
      const previous = queryClient.getQueryData<AlbumNotificationSettings>(
        settingsKey(albumId),
      );
      if (previous) {
        queryClient.setQueryData(settingsKey(albumId), {
          ...previous,
          ...input,
        });
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKey(albumId), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKey(albumId) });
    },
  });
};
