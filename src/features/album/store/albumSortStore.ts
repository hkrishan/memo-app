/**
 * Album sort preference for the "My Albums" grid. Persisted to AsyncStorage
 * so the chosen ordering sticks across launches (see captureDestinationStore
 * for the persist pattern).
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Album } from "../types/album.types";

export type AlbumSort = "activity" | "created" | "alpha";

export const ALBUM_SORT_OPTIONS: { value: AlbumSort; label: string }[] = [
  { value: "activity", label: "Latest activity" },
  { value: "created", label: "Recently created" },
  { value: "alpha", label: "Alphabetical (A–Z)" },
];

export const albumSortLabel = (sort: AlbumSort): string =>
  ALBUM_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Latest activity";

interface AlbumSortState {
  sort: AlbumSort;
  setSort: (sort: AlbumSort) => void;
}

export const useAlbumSortStore = create<AlbumSortState>()(
  persist(
    (set) => ({
      sort: "activity",
      setSort: (sort) => set({ sort }),
    }),
    {
      name: "album-sort",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** Epoch ms for an album's newest activity; falls back to createdAt, else 0. */
const activityTime = (album: Album): number => {
  const raw = album.lastActivityAt ?? album.createdAt ?? null;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const createdTime = (album: Album): number => {
  if (!album.createdAt) return 0;
  const t = new Date(album.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Client-side sort applied before rendering the grid. Returns a new array
 * (never mutates). "activity" is the default — newest photo first, nulls
 * last (they collapse to 0 and sink to the bottom).
 */
export const sortAlbums = (albums: Album[], sort: AlbumSort): Album[] => {
  const copy = [...albums];
  switch (sort) {
    case "alpha":
      return copy.sort((a, b) =>
        (a.title ?? "").localeCompare(b.title ?? "", undefined, {
          sensitivity: "base",
        }),
      );
    case "created":
      return copy.sort((a, b) => createdTime(b) - createdTime(a));
    case "activity":
    default:
      return copy.sort((a, b) => activityTime(b) - activityTime(a));
  }
};
