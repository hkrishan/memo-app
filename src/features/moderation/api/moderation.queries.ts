import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import moderationApi from "./moderation.api";
import { BlockedUser } from "../types/moderation.types";

export const moderationKeys = {
  blockedUsers: ["moderation", "blockedUsers"] as const,
};

export const useBlockedUsers = () => {
  return useQuery({
    queryKey: moderationKeys.blockedUsers,
    queryFn: moderationApi.getBlockedUsers,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * The blocked userIds as a Set for cheap membership checks (chat filtering).
 * While the list is loading (or errored) the set is empty — no filtering.
 */
export const useBlockedUserIds = (): Set<string> => {
  const { data } = useBlockedUsers();
  return useMemo(
    () => new Set((data ?? []).map((user) => user.userId)),
    [data],
  );
};

export const useBlockUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      userId: string;
      name?: string | null;
      avatarUrl?: string | null;
    }) => moderationApi.blockUser(params.userId),
    onSuccess: (_, params) => {
      // Write the block into the cache synchronously so the user's content
      // disappears immediately, then refetch for the server's copy
      queryClient.setQueryData<BlockedUser[]>(
        moderationKeys.blockedUsers,
        (blocked) =>
          blocked && !blocked.some((u) => u.userId === params.userId)
            ? [
                ...blocked,
                {
                  userId: params.userId,
                  name: params.name ?? "",
                  avatarUrl: params.avatarUrl ?? null,
                  blockedAt: new Date().toISOString(),
                },
              ]
            : blocked,
      );
      queryClient.invalidateQueries({ queryKey: moderationKeys.blockedUsers });
    },
  });
};

export const useUnblockUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => moderationApi.unblockUser(userId),
    onSuccess: (_, userId) => {
      queryClient.setQueryData<BlockedUser[]>(
        moderationKeys.blockedUsers,
        (blocked) => blocked?.filter((u) => u.userId !== userId),
      );
      queryClient.invalidateQueries({ queryKey: moderationKeys.blockedUsers });
    },
  });
};

export const useReportContent = () => {
  return useMutation({
    mutationFn: moderationApi.reportContent,
  });
};
