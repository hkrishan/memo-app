/**
 * Photos being linked from the Memo library into an album.
 *
 * Adding a library photo to an album is a server-side link: fast, but not
 * instant, and until it lands the album's photo list simply doesn't contain
 * it. This store holds the in-flight links so the album can paint them
 * immediately from the library photo's own (already cached) image.
 *
 * It deliberately lives OUTSIDE react-query: an optimistic entry written
 * into the album's cached list is wiped by the next refetch — which is
 * exactly what happens a second later, when the album screen's query
 * resolves. A record here survives refetches and retires only when the
 * server row it created actually shows up in the list.
 */

import { create } from "zustand";

/** How long a settled record lingers if its album list never refetches. */
const SETTLED_PRUNE_MS = 2 * 60_000;

export type PendingAlbumLink = {
  /** albumId + libraryPhotoId — one link per pair. */
  key: string;
  albumId: string;
  libraryPhotoId: string;
  /** The library photo's media, shown while the link is made. */
  url: string;
  thumbnailUrl: string | null;
  mediaType: "photo" | "video";
  width: number | null;
  height: number | null;
  /** Set once the server made the album row; the tile retires when the
   *  album's list carries that id (no gap). */
  albumPhotoId: string | null;
  /** The link failed — the record goes when the caller reports it. */
  failed: boolean;
  startedAt: number;
  settledAt: number | null;
};

interface AlbumLinkState {
  links: PendingAlbumLink[];
}

export const useAlbumLinkStore = create<AlbumLinkState>(() => ({ links: [] }));

export const albumLinkKey = (albumId: string, libraryPhotoId: string): string =>
  `${albumId}:${libraryPhotoId}`;

/** Drops settled records whose album list never came back for them. */
const pruneSettled = (links: PendingAlbumLink[]): PendingAlbumLink[] => {
  const cutoff = Date.now() - SETTLED_PRUNE_MS;
  return links.filter(
    (link) => link.settledAt == null || link.settledAt > cutoff,
  );
};

export type BeginAlbumLinkInput = Omit<
  PendingAlbumLink,
  "key" | "albumPhotoId" | "failed" | "startedAt" | "settledAt"
>;

/** Paints these links into their albums right away. */
export function beginAlbumLinks(inputs: BeginAlbumLinkInput[]): void {
  if (inputs.length === 0) return;
  const startedAt = Date.now();
  useAlbumLinkStore.setState((state) => {
    const incoming = inputs.map((input) => ({
      ...input,
      key: albumLinkKey(input.albumId, input.libraryPhotoId),
      albumPhotoId: null,
      failed: false,
      startedAt,
      settledAt: null,
    }));
    const incomingKeys = new Set(incoming.map((link) => link.key));
    return {
      links: [
        ...pruneSettled(state.links).filter(
          (link) => !incomingKeys.has(link.key),
        ),
        ...incoming,
      ],
    };
  });
}

/** The server made the album row — hand over once the list carries it. */
export function settleAlbumLink(
  albumId: string,
  libraryPhotoId: string,
  albumPhotoId: string,
): void {
  const key = albumLinkKey(albumId, libraryPhotoId);
  useAlbumLinkStore.setState((state) => ({
    links: state.links.map((link) =>
      link.key === key
        ? { ...link, albumPhotoId, settledAt: Date.now() }
        : link,
    ),
  }));
}

/** The link failed — drop the tile (the caller surfaces the error). */
export function failAlbumLinks(
  albumId: string,
  libraryPhotoIds: string[],
): void {
  const keys = new Set(
    libraryPhotoIds.map((photoId) => albumLinkKey(albumId, photoId)),
  );
  useAlbumLinkStore.setState((state) => ({
    links: state.links.filter((link) => !keys.has(link.key)),
  }));
}

/** Drops a record once its album row is in the list (see the hook). */
export function clearAlbumLink(key: string): void {
  useAlbumLinkStore.setState((state) => ({
    links: state.links.filter((link) => link.key !== key),
  }));
}
