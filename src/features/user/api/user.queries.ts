import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store/authStore";
import userApi from "./user.api";
import { User } from "../types/user.types";

const getUserQuery = () => {
  return useQuery({
    queryKey: ["user", "me"],
    queryFn: userApi.getMe,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useUpdateAvatarMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: userApi.updateAvatar,
    onSuccess: async (updatedUser: User) => {
      // Cancel any in-flight refetch so a stale response can't overwrite
      // the fresh avatar we're about to write into the cache
      await queryClient.cancelQueries({ queryKey: ["user", "me"] });
      queryClient.setQueryData(["user", "me"], updatedUser);

      // Sync the persisted auth store so avatars elsewhere update too
      const { user, setUser } = useAuthStore.getState();
      if (user) {
        setUser({ ...user, avatarUrl: updatedUser.avatarUrl });
      }
    },
  });
};

export const useUpdateProfileMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: userApi.updateProfile,
    onSuccess: async (updatedUser: User) => {
      // Cancel any in-flight refetch so a stale response can't overwrite
      // the fresh name we're about to write into the cache
      await queryClient.cancelQueries({ queryKey: ["user", "me"] });
      queryClient.setQueryData(["user", "me"], updatedUser);

      // Sync the persisted auth store so the name elsewhere updates too
      const { user, setUser } = useAuthStore.getState();
      if (user) {
        setUser({ ...user, name: updatedUser.name });
      }
    },
  });
};

export default getUserQuery;
