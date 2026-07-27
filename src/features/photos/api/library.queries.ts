/**
 * React Query hooks for the Memo library ("My Photos" archive).
 * - useLibraryQuery: infinite feed keyed on the server's nextCursor.
 * - useDeleteLibraryPhotoMutation: optimistic removal from cached pages.
 * - useAddLibraryPhotoToAlbumMutation: copies a library photo into an album
 *   and invalidates that album's photos so the new copy appears.
 */

import { useMemo } from "react";
import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { photoKeys } from "@/features/album/api/photo.queries";
import photoApi from "@/features/album/api/photo.api";
import { useLibraryUploadQueue } from "../store/libraryUploadQueue";
import libraryApi, {
  LibraryPage,
  LibraryPhoto,
  UploadLibraryPhotoParams,
  libraryKeys,
} from "./library.api";

export { libraryKeys };

/** A library photo, possibly still local-only (mid-upload from the queue). */
export type MergedLibraryPhoto = LibraryPhoto & {
  /** True while this capture only exists locally (upload in flight). */
  pending?: boolean;
  /** True when the upload failed and is waiting for an automatic retry. */
  failed?: boolean;
};

/**
 * Uploads a captured file to the library and refreshes the library feed so
 * "My Photos" and the full grid pick up the new photo.
 */
export const useUploadLibraryPhotoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UploadLibraryPhotoParams) =>
      libraryApi.uploadLibraryPhoto(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
};

/** Infinite scroll over the library, newest first. */
export const useLibraryQuery = () =>
  useInfiniteQuery({
    queryKey: libraryKeys.all,
    queryFn: ({ pageParam }) => libraryApi.getLibrary(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30 * 1000,
  });

/**
 * Local-first library: captures still in the upload queue render from their
 * local files IN FRONT of the server pages, so a photo appears in "My
 * Photos" the instant the shutter fires. When an upload settles, the queue
 * only drops its entry after the library refetched — the tile seamlessly
 * switches to the server copy with no gap.
 */
export const useMergedLibrary = () => {
  const query = useLibraryQuery();
  const entries = useLibraryUploadQueue((state) => state.entries);

  const photos = useMemo<MergedLibraryPhoto[]>(() => {
    const local: MergedLibraryPhoto[] = entries
      .filter((entry) => entry.status !== "done")
      .map((entry) => ({
        photoId: entry.localId,
        url: entry.fileUri,
        thumbnailUrl: entry.fileUri,
        mediaType: "photo" as const,
        width: entry.width ?? null,
        height: entry.height ?? null,
        caption: null,
        latitude: entry.latitude ?? null,
        longitude: entry.longitude ?? null,
        createdAt: entry.capturedAt,
        albums: entry.albumTargets.map((target) => ({
          albumId: target.albumId,
          title: target.title,
          // The album copy may not exist yet while the upload is pending;
          // membership is still shown (and editable) from the queue entry
          photoId: target.albumPhotoId ?? "",
        })),
        pending: entry.status !== "failed",
        failed: entry.status === "failed",
      }));
    const server = query.data?.pages.flatMap((page) => page.photos) ?? [];
    return [...local, ...server];
  }, [entries, query.data]);

  return { ...query, photos };
};

/**
 * Optimistically drops the photo from every cached page, then lets the
 * settled refetch reconcile. Rolls back the snapshot on error.
 */
export const useDeleteLibraryPhotoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (photoId: string) => libraryApi.deleteLibraryPhoto(photoId),
    onMutate: async (photoId) => {
      await queryClient.cancelQueries({ queryKey: libraryKeys.all });
      const previous = queryClient.getQueryData<InfiniteData<LibraryPage>>(
        libraryKeys.all,
      );
      queryClient.setQueryData<InfiniteData<LibraryPage>>(
        libraryKeys.all,
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  photos: page.photos.filter((p) => p.photoId !== photoId),
                })),
              }
            : data,
      );
      return { previous };
    },
    onError: (_error, _photoId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(libraryKeys.all, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
};

/**
 * Syncs a settled library photo's FULL album membership to the picker's
 * checkbox set: newly checked albums get a server-side copy, unchecked ones
 * have their copy deleted. An empty set is valid — the photo then lives only
 * in the Memo library. Runs the removals and additions independently so one
 * failure can't strand the rest.
 */
export const useSetLibraryPhotoAlbumsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      libraryPhotoId,
      current,
      nextAlbums,
    }: {
      libraryPhotoId: string;
      /** Present membership, with each album COPY's id (for removal). */
      current: { albumId: string; photoId: string }[];
      /** Titles travel with the ids so the optimistic label can name albums. */
      nextAlbums: { albumId: string; title: string }[];
    }) => {
      const next = new Set(nextAlbums.map((a) => a.albumId));
      const currentIds = new Set(current.map((a) => a.albumId));

      const removed = current.filter((a) => !next.has(a.albumId));
      const added = nextAlbums
        .map((a) => a.albumId)
        .filter((id) => !currentIds.has(id));

      for (const membership of removed) {
        if (!membership.photoId) continue;
        await photoApi.deletePhoto(membership.albumId, membership.photoId);
      }
      for (const albumId of added) {
        await libraryApi.addLibraryPhotoToAlbum(albumId, libraryPhotoId);
      }
      return { addedTo: added, removedFrom: removed.map((a) => a.albumId) };
    },
    // Paint the new membership at once — the viewer's "In <album>" label must
    // react to the checkbox choice, not to the network round-trip
    onMutate: async ({ libraryPhotoId, current, nextAlbums }) => {
      await queryClient.cancelQueries({ queryKey: libraryKeys.all });
      const previous = queryClient.getQueryData<InfiniteData<LibraryPage>>(
        libraryKeys.all,
      );
      const copyIds = new Map(current.map((a) => [a.albumId, a.photoId]));
      queryClient.setQueryData<InfiniteData<LibraryPage>>(
        libraryKeys.all,
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  photos: page.photos.map((photo) =>
                    photo.photoId === libraryPhotoId
                      ? {
                          ...photo,
                          albums: nextAlbums.map((album) => ({
                            ...album,
                            // Newly added copies have no id until the server
                            // responds; the refetch fills it in
                            photoId: copyIds.get(album.albumId) ?? "",
                          })),
                        }
                      : photo,
                  ),
                })),
              }
            : data,
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(libraryKeys.all, context.previous);
      }
    },
    onSettled: (_data, _error, { current, nextAlbums }) => {
      // Refresh every album that gained or lost a copy, plus the list (covers
      // change) and the library feed (it carries the membership badges)
      const touched = new Set([
        ...current.map((a) => a.albumId),
        ...nextAlbums.map((a) => a.albumId),
      ]);
      for (const albumId of touched) {
        queryClient.invalidateQueries({ queryKey: photoKeys.byAlbum(albumId) });
      }
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
};

/**
 * Copies an existing library photo into an album (no re-upload) and
 * refreshes that album's photos + the albums list (its cover may change).
 */
export const useAddLibraryPhotoToAlbumMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      albumId,
      libraryPhotoId,
    }: {
      albumId: string;
      libraryPhotoId: string;
    }) => libraryApi.addLibraryPhotoToAlbum(albumId, libraryPhotoId),
    onSuccess: (_data, { albumId }) => {
      queryClient.invalidateQueries({
        queryKey: photoKeys.byAlbum(albumId),
      });
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      // The library feed carries per-photo album memberships (the "In
      // <album>" banner) — refresh so the new membership shows at once
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
};
