/**
 * Capture-extras store
 * Every main-tab capture ALWAYS uploads to the Memo library (the base action,
 * not configurable). These are the sticky OPTIONAL extras applied on top:
 * also save to the device camera roll, and/or also copy into albums.
 * Persisted to AsyncStorage (see photoAlbumStore for the pattern). If a
 * stored album is later deleted, the read site drops it — the store itself
 * does not know the album list.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface CaptureExtras {
  /** Also write each capture to the device camera roll. */
  alsoDeviceGallery: boolean;
  /**
   * Also copy each capture into these albums. Order matters: the FIRST is
   * the one the camera's "Saving to" pill names (the sheet marks it
   * "default"); the rest ride along silently.
   */
  alsoAlbumIds: string[];
}

interface CaptureExtrasState extends CaptureExtras {
  setAlsoDeviceGallery: (value: boolean) => void;
  /** Add the album to the sticky set, or remove it if already there. */
  toggleAlsoAlbum: (albumId: string) => void;
}

/** v0 persisted a single `alsoAlbumId: string | null`. */
type PersistedV0 = {
  alsoDeviceGallery?: boolean;
  alsoAlbumId?: string | null;
};

export const useCaptureExtrasStore = create<CaptureExtrasState>()(
  persist(
    (set) => ({
      alsoDeviceGallery: false,
      alsoAlbumIds: [],
      setAlsoDeviceGallery: (alsoDeviceGallery) => set({ alsoDeviceGallery }),
      toggleAlsoAlbum: (albumId) =>
        set((state) => ({
          alsoAlbumIds: state.alsoAlbumIds.includes(albumId)
            ? state.alsoAlbumIds.filter((id) => id !== albumId)
            : [...state.alsoAlbumIds, albumId],
        })),
    }),
    {
      name: "capture-extras",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted, version) => {
        if (version === 0) {
          const v0 = persisted as PersistedV0;
          return {
            alsoDeviceGallery: v0.alsoDeviceGallery ?? false,
            alsoAlbumIds: v0.alsoAlbumId ? [v0.alsoAlbumId] : [],
          };
        }
        return persisted as CaptureExtras;
      },
    },
  ),
);
