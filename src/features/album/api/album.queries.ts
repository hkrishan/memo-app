import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import albumApi, { UpdateAlbumParams, UploadPhotoParams } from "./album.api";
import { photoKeys } from "./photo.queries";

export const useGetAlbumsQuery = () => {
  return useQuery({
    queryKey: ["albums"],
    queryFn: albumApi.getAlbums,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useGetAlbumQuery = (albumId: string) => {
  return useQuery({
    queryKey: ["albums", albumId],
    queryFn: () => albumApi.getAlbum(albumId),
    staleTime: 1000, // 1 second - quick refetch but uses cache for navigation
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    placeholderData: (previousData) => previousData, // Use cached data immediately
    networkMode: "offlineFirst", // Show cached data first, then update
  });
};

export const useCreateAlbumMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => albumApi.createAlbum(name),
    onSuccess: () => {
      // Invalidate albums query to refresh the list
      queryClient.invalidateQueries({
        queryKey: ["albums"],
      });
    },
  });
};

export const useUpdateAlbumMutation = (albumId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateAlbumParams) =>
      albumApi.updateAlbum(albumId, input),
    onSuccess: () => {
      // Refresh the album detail (cover, title) and the albums list
      queryClient.invalidateQueries({
        queryKey: ["albums", albumId],
      });
      queryClient.invalidateQueries({
        queryKey: ["albums"],
        exact: true,
      });
    },
  });
};

export const useDeleteAlbumMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (albumId: string) => albumApi.deleteAlbum(albumId),
    onSuccess: (_, albumId) => {
      // Drop everything scoped to the dead album, then refresh the list
      queryClient.removeQueries({ queryKey: ["albums", albumId] });
      queryClient.invalidateQueries({ queryKey: ["albums"], exact: true });
    },
  });
};

export const useLeaveAlbumMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (albumId: string) => albumApi.leaveAlbum(albumId),
    onSuccess: (_, albumId) => {
      queryClient.removeQueries({ queryKey: ["albums", albumId] });
      queryClient.invalidateQueries({ queryKey: ["albums"], exact: true });
    },
  });
};

export const useJoinAlbumMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteCode: string) => albumApi.joinAlbum(inviteCode),
    onSuccess: () => {
      // Invalidate albums query to refresh the list
      queryClient.invalidateQueries({
        queryKey: ["albums"],
      });
    },
  });
};

export const useHandleAlbumJoinRequestMutation = (albumId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      action,
    }: {
      requestId: string;
      action: "accept" | "reject";
    }) => {
      if (action === "accept") {
        return albumApi.acceptJoinRequest(albumId, requestId);
      } else {
        return albumApi.rejectJoinRequest(albumId, requestId);
      }
    },
    onSuccess: () => {
      // Invalidate pending join requests and members queries to refresh the data
      queryClient.invalidateQueries({
        queryKey: ["albums", albumId, "pendingJoinRequests"],
      });
      queryClient.invalidateQueries({
        queryKey: ["albums", albumId, "members"],
      });
    },
  });
};

export const useGetAlbumPendingJoinRequestsQuery = (albumId: string) => {
  return useQuery({
    queryKey: ["albums", albumId, "pendingJoinRequests"],
    queryFn: () => albumApi.getAlbumPendingJoinRequests(albumId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useGetAlbumActivitiesQuery = (albumId: string) => {
  return useQuery({
    queryKey: ["albums", albumId, "activities"],
    queryFn: () => albumApi.getAlbumActivities(albumId),
    enabled: !!albumId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useGetAlbumMembersQuery = (albumId: string) => {
  return useQuery({
    queryKey: ["albums", albumId, "members"],
    queryFn: () => albumApi.getAlbumMembers(albumId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// ---- Invite links ----

/**
 * The album's active shareable invite link. The queryFn POST is an
 * idempotent get-or-create, so it's safe to treat it as a query.
 */
export const useAlbumInviteLinkQuery = (albumId: string) => {
  return useQuery({
    queryKey: ["albumInvite", albumId],
    queryFn: () => albumApi.getOrCreateInviteLink(albumId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useRevokeInviteMutation = (albumId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ inviteId }: { inviteId: string }) =>
      albumApi.revokeInviteLink(albumId, inviteId),
    onSuccess: () => {
      // A fresh link gets created on next read — drop the cached one
      queryClient.invalidateQueries({
        queryKey: ["albumInvite", albumId],
      });
    },
  });
};

/** Invite preview for the deeplink accept screen; enabled when id is truthy */
export const useInviteInfoQuery = (inviteId: string | null) => {
  return useQuery({
    queryKey: ["inviteInfo", inviteId],
    queryFn: () => albumApi.getInviteInfo(inviteId!),
    enabled: !!inviteId,
  });
};

export const useAcceptInviteMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ inviteId }: { inviteId: string }) =>
      albumApi.acceptInvite(inviteId),
    onSuccess: () => {
      // The caller just gained an album — refresh the albums list
      queryClient.invalidateQueries({
        queryKey: ["albums"],
      });
    },
  });
};

export const useUploadPhotoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UploadPhotoParams) => albumApi.uploadPhoto(params),
    onSuccess: (_, variables) => {
      // Invalidate album photos query to refresh the list
      queryClient.invalidateQueries({
        queryKey: photoKeys.byAlbum(variables.albumId),
      });
      // Also invalidate albums list in case cover photo changed
      queryClient.invalidateQueries({
        queryKey: ["albums"],
      });
    },
  });
};
