import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import photoApi, { UploadPhotoParams } from "./photo.api";

export const photoKeys = {
  all: ["photos"] as const,
  byAlbum: (albumId: string) => [...photoKeys.all, albumId] as const,
};

/**
 * Removes the bucket name from R2 URLs
 * e.g., "https://domain.com/memo-media-dev/path/image.jpg" -> "https://domain.com/path/image.jpg"
 */
const removeBucketFromUrl = (url: string): string => {
  return url.replace("/memo-media-dev", "");
};

export const useGetPhotosQuery = (albumId: string) => {
  return useQuery({
    queryKey: photoKeys.byAlbum(albumId),
    queryFn: () => photoApi.getPhotos(albumId),
    staleTime: 1000, // 1 second - quick refetch but uses cache for navigation
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    enabled: !!albumId,
    placeholderData: (previousData) => previousData, // Use cached data immediately
    networkMode: "offlineFirst", // Show cached data first, then update
    select: (photos) =>
      photos.map((photo) => ({
        ...photo,
        url: removeBucketFromUrl(photo.url),
      })),
  });
};

export const useUploadPhotoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UploadPhotoParams) => photoApi.uploadPhoto(params),
    onSuccess: (_data, variables) => {
      // Invalidate photos for the album to refetch
      queryClient.invalidateQueries({
        queryKey: photoKeys.byAlbum(variables.albumId),
      });
    },
  });
};

export const useDeletePhotoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ albumId, photoId }: { albumId: string; photoId: string }) =>
      photoApi.deletePhoto(albumId, photoId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: photoKeys.byAlbum(variables.albumId),
      });
    },
  });
};
