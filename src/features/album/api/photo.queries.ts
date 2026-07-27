import { useEffect } from "react";
import {
  InfiniteData,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  PhotoComment,
  PhotoSocial,
  PhotoWithUploader,
} from "../types/album.types";
import photoApi, { AlbumPhotoPage, UploadPhotoParams } from "./photo.api";

export const photoKeys = {
  all: ["photos"] as const,
  byAlbum: (albumId: string) => [...photoKeys.all, albumId] as const,
  comments: (albumId: string, photoId: string | null) =>
    [...photoKeys.byAlbum(albumId), "comments", photoId] as const,
};

export const albumPhotoTagsKey = (albumId: string) =>
  ["albumPhotoTags", albumId] as const;

const emptySocial: PhotoSocial = {
  likeCount: 0,
  likedByMe: false,
  commentCount: 0,
  tags: [],
};

const updatePhotoSocial = (
  queryClient: QueryClient,
  albumId: string,
  photoId: string,
  updater: (social: PhotoSocial) => PhotoSocial,
) => {
  // The cache holds pages now, so patch the photo wherever it sits
  queryClient.setQueryData<InfiniteData<AlbumPhotoPage>>(
    photoKeys.byAlbum(albumId),
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          photos: page.photos.map((photo) =>
            photo.photoId === photoId
              ? { ...photo, social: updater(photo.social ?? emptySocial) }
              : photo,
          ),
        })),
      },
  );
};

/**
 * Removes the bucket name from R2 URLs
 * e.g., "https://domain.com/memo-media-dev/path/image.jpg" -> "https://domain.com/path/image.jpg"
 */
const removeBucketFromUrl = (url: string): string => {
  return url.replace("/memo-media-dev", "");
};

// Module-level so its identity is stable: TanStack Query only memoizes a
// select's result while the function identity holds. As an inline arrow
// this re-ran on every render and handed every subscriber (grid, viewer,
// filmstrip, social overlay) a freshly-built array, defeating all their
// downstream memoization.
const selectPhotosWithCleanUrls = (
  data: InfiniteData<AlbumPhotoPage>,
): PhotoWithUploader[] =>
  data.pages.flatMap((page) =>
    page.photos.map((photo) => ({
      ...photo,
      url: removeBucketFromUrl(photo.url),
    })),
  );

/** Photos per request. Big enough that most albums are one round-trip. */
const ALBUM_PAGE_SIZE = 100;

/**
 * An album's photos, newest first.
 *
 * Paged, but the pages are pulled in automatically until the album is fully
 * loaded, so callers still see one flat array and the Gallery tab's derived
 * sections (Most loved, Places, per-member) still see every photo. What
 * changes is WHEN: the first 100 render immediately instead of the screen
 * waiting on a single ~400KB response, and each page's JSON is parsed in its
 * own frame rather than one long block during the open animation.
 */
export const useGetPhotosQuery = (albumId: string) => {
  const query = useInfiniteQuery({
    queryKey: photoKeys.byAlbum(albumId),
    queryFn: ({ pageParam }) =>
      photoApi.getPhotos(albumId, ALBUM_PAGE_SIZE, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // Navigating back into an album shouldn't refetch the whole thing; a
    // new photo arrives through the upload paths' invalidation instead
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!albumId,
    placeholderData: (previousData) => previousData,
    networkMode: "offlineFirst", // Show cached data first, then update
    select: selectPhotosWithCleanUrls,
  });

  // Keep pulling until the album is whole. Runs after each page settles, so
  // the list grows a page at a time instead of blocking on all of them.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return query;
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
    mutationFn: ({
      albumId,
      photoId,
      alsoLibrary,
    }: {
      albumId: string;
      photoId: string;
      /** Delete everywhere — the linked Memo-library copy goes too. */
      alsoLibrary?: boolean;
    }) => photoApi.deletePhoto(albumId, photoId, alsoLibrary ?? false),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: photoKeys.byAlbum(variables.albumId),
      });
      if (variables.alsoLibrary) {
        // My Photos lost one too
        queryClient.invalidateQueries({ queryKey: ["library"] });
      }
    },
  });
};

export const useTogglePhotoLikeMutation = (albumId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    // Same-scope mutations run serially: a double-tap's unlike waits for
    // the like to settle, so responses can never reconcile out of order
    // (and its onMutate reads the first toggle's optimistic state)
    scope: { id: `photo-like-${albumId}` },
    mutationFn: ({ photoId, like }: { photoId: string; like: boolean }) =>
      like
        ? photoApi.likePhoto(albumId, photoId)
        : photoApi.unlikePhoto(albumId, photoId),
    onMutate: async ({ photoId, like }) => {
      await queryClient.cancelQueries({
        queryKey: photoKeys.byAlbum(albumId),
      });
      // Snapshot ONLY this photo's social — a whole-list snapshot would,
      // on rollback, clobber refetches and other photos' social updates
      // that landed while this request was in flight
      const previousSocial = queryClient
        .getQueryData<InfiniteData<AlbumPhotoPage>>(photoKeys.byAlbum(albumId))
        ?.pages.flatMap((page) => page.photos)
        .find((photo) => photo.photoId === photoId)?.social;
      updatePhotoSocial(queryClient, albumId, photoId, (social) => ({
        ...social,
        likedByMe: like,
        likeCount: Math.max(0, social.likeCount + (like ? 1 : -1)),
      }));
      return { previousSocial };
    },
    onError: (_error, { photoId }, context) => {
      updatePhotoSocial(queryClient, albumId, photoId, (social) =>
        context?.previousSocial ? context.previousSocial : social,
      );
      // The rollback itself can be stale (state may have moved while we
      // were in flight) — let the server settle it
      queryClient.invalidateQueries({ queryKey: photoKeys.byAlbum(albumId) });
    },
    onSuccess: (data, { photoId }) => {
      // Reconcile with the server's authoritative counts
      updatePhotoSocial(queryClient, albumId, photoId, (social) => ({
        ...social,
        likeCount: data.likeCount,
        likedByMe: data.likedByMe,
      }));
    },
  });
};

export const usePhotoCommentsQuery = (
  albumId: string,
  photoId: string | null,
) => {
  return useQuery({
    queryKey: photoKeys.comments(albumId, photoId),
    queryFn: async () => {
      const { comments } = await photoApi.getComments(albumId, photoId!);
      return comments;
    },
    enabled: !!photoId,
  });
};

export const useAddPhotoCommentMutation = (albumId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ photoId, content }: { photoId: string; content: string }) =>
      photoApi.addComment(albumId, photoId, content),
    // A comments GET dispatched before the POST committed would, resolving
    // after it, wipe the appended comment with its older server snapshot
    onMutate: async ({ photoId }) => {
      await queryClient.cancelQueries({
        queryKey: photoKeys.comments(albumId, photoId),
      });
    },
    onSuccess: (comment, { photoId }) => {
      queryClient.setQueryData<PhotoComment[]>(
        photoKeys.comments(albumId, photoId),
        (comments) => (comments ? [...comments, comment] : [comment]),
      );
      updatePhotoSocial(queryClient, albumId, photoId, (social) => ({
        ...social,
        commentCount: social.commentCount + 1,
      }));
    },
    // Refetch regardless of outcome: reconciles the hand-patched list with
    // the server and revives the initial GET if onMutate cancelled it
    onSettled: (_data, _error, { photoId }) => {
      queryClient.invalidateQueries({
        queryKey: photoKeys.comments(albumId, photoId),
      });
    },
  });
};

export const useDeletePhotoCommentMutation = (albumId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      photoId,
      commentId,
    }: {
      photoId: string;
      commentId: string;
    }) => photoApi.deleteComment(albumId, photoId, commentId),
    // Same in-flight-GET race as addComment — see there
    onMutate: async ({ photoId }) => {
      await queryClient.cancelQueries({
        queryKey: photoKeys.comments(albumId, photoId),
      });
    },
    onSuccess: (_data, { photoId, commentId }) => {
      queryClient.setQueryData<PhotoComment[]>(
        photoKeys.comments(albumId, photoId),
        (comments) => comments?.filter((c) => c.commentId !== commentId),
      );
      updatePhotoSocial(queryClient, albumId, photoId, (social) => ({
        ...social,
        commentCount: Math.max(0, social.commentCount - 1),
      }));
    },
    onSettled: (_data, _error, { photoId }) => {
      queryClient.invalidateQueries({
        queryKey: photoKeys.comments(albumId, photoId),
      });
    },
  });
};

/** Distinct tags across the album's photos with usage counts. */
export const useAlbumPhotoTagsQuery = (albumId: string) => {
  return useQuery({
    queryKey: albumPhotoTagsKey(albumId),
    queryFn: () => photoApi.getAlbumPhotoTags(albumId),
    select: (data) => data.tags,
    staleTime: 30 * 1000,
    enabled: !!albumId,
  });
};

export const useTagPhotoMutation = (albumId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ photoId, tag }: { photoId: string; tag: string }) =>
      photoApi.tagPhoto(albumId, photoId, tag),
    // A photos refetch that predates this tag would, resolving after it,
    // overwrite the authoritative tags written below (same race the like
    // hook guards against)
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: photoKeys.byAlbum(albumId) });
    },
    onSuccess: ({ tags }, { photoId }) => {
      updatePhotoSocial(queryClient, albumId, photoId, (social) => ({
        ...social,
        tags,
      }));
      queryClient.invalidateQueries({ queryKey: albumPhotoTagsKey(albumId) });
    },
  });
};

export const useUntagPhotoMutation = (albumId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ photoId, tag }: { photoId: string; tag: string }) =>
      photoApi.untagPhoto(albumId, photoId, tag),
    // See useTagPhotoMutation — same stale-refetch race
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: photoKeys.byAlbum(albumId) });
    },
    onSuccess: ({ tags }, { photoId }) => {
      updatePhotoSocial(queryClient, albumId, photoId, (social) => ({
        ...social,
        tags,
      }));
      queryClient.invalidateQueries({ queryKey: albumPhotoTagsKey(albumId) });
    },
  });
};
