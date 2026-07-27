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
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { photoKeys } from "@/features/album/api/photo.queries";
import photoApi from "@/features/album/api/photo.api";
import {
  beginAlbumLinks,
  failAlbumLinks,
  settleAlbumLink,
} from "@/features/album/store/albumLinkStore";
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
        // Videos have no still of their own — the device-library poster
        // recorded at enqueue time stands in (null keeps the grid's dark
        // play-glyph tile rather than a blank one)
        thumbnailUrl:
          entry.mediaType === "video"
            ? (entry.posterUri ?? null)
            : entry.fileUri,
        mediaType: entry.mediaType === "video" ? ("video" as const) : ("photo" as const),
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

// ---------------------------------------------------------------------------
// Adding a library photo to an album — shown in the album IMMEDIATELY
// ---------------------------------------------------------------------------

/**
 * The library photo behind an id, read straight from the cached feed — it
 * supplies the image the album paints while the link is being made.
 */
const findLibraryPhoto = (
  queryClient: QueryClient,
  libraryPhotoId: string,
): MergedLibraryPhoto | undefined =>
  queryClient
    .getQueryData<InfiniteData<LibraryPage>>(libraryKeys.all)
    ?.pages.flatMap((page) => page.photos)
    .find((photo) => photo.photoId === libraryPhotoId);

/**
 * Records the in-flight links so every album surface can show the photo at
 * once. This goes to a STORE, not the album's query cache: a cache entry is
 * erased by the next refetch of that album's photos, which lands a moment
 * later and would make the tile vanish again.
 */
const beginLinks = (
  queryClient: QueryClient,
  libraryPhotoId: string,
  albumIds: string[],
): void => {
  if (albumIds.length === 0) return;
  const photo = findLibraryPhoto(queryClient, libraryPhotoId);
  if (!photo) return;
  beginAlbumLinks(
    albumIds.map((albumId) => ({
      albumId,
      libraryPhotoId,
      url: photo.url,
      thumbnailUrl: photo.thumbnailUrl,
      mediaType: photo.mediaType === "video" ? "video" : "photo",
      width: photo.width,
      height: photo.height,
    })),
  );
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
      const createdRows: { albumId: string; photoId: string }[] = [];
      for (const albumId of added) {
        const created = await libraryApi.addLibraryPhotoToAlbum(
          albumId,
          libraryPhotoId,
        );
        createdRows.push({ albumId, photoId: created.photoId });
        // Hand this album's tile over as soon as ITS row exists, rather
        // than waiting for the rest of the batch
        settleAlbumLink(albumId, libraryPhotoId, created.photoId);
      }
      return {
        addedTo: added,
        createdRows,
        removedFrom: removed.map((a) => a.albumId),
      };
    },
    // Paint the new membership at once — the viewer's "In <album>" label must
    // react to the checkbox choice, not to the network round-trip
    onMutate: async ({ libraryPhotoId, current, nextAlbums }) => {
      await queryClient.cancelQueries({ queryKey: libraryKeys.all });
      const previous = queryClient.getQueryData<InfiniteData<LibraryPage>>(
        libraryKeys.all,
      );
      const copyIds = new Map(current.map((a) => [a.albumId, a.photoId]));

      // Paint the photo into every newly checked album NOW — the album must
      // not sit empty while the server makes its copy
      const currentIds = new Set(current.map((a) => a.albumId));
      const addedAlbumIds = nextAlbums
        .map((album) => album.albumId)
        .filter((albumId) => !currentIds.has(albumId));
      beginLinks(queryClient, libraryPhotoId, addedAlbumIds);
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
      return { previous, addedAlbumIds };
    },
    onError: (_error, { libraryPhotoId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(libraryKeys.all, context.previous);
      }
      for (const albumId of context?.addedAlbumIds ?? []) {
        failAlbumLinks(albumId, [libraryPhotoId]);
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
    // Same as the multi-album picker: the album shows the photo at once,
    // badged as pending, instead of waiting on the server copy
    onMutate: async ({ albumId, libraryPhotoId }) => {
      beginLinks(queryClient, libraryPhotoId, [albumId]);
    },
    onError: (_error, { albumId, libraryPhotoId }) => {
      failAlbumLinks(albumId, [libraryPhotoId]);
    },
    onSuccess: (created, { albumId, libraryPhotoId }) => {
      settleAlbumLink(albumId, libraryPhotoId, created.photoId);
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
