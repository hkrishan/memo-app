/**
 * Capture-extras store
 * Every main-tab capture ALWAYS uploads to the Memo library (the base action,
 * not configurable). These are the sticky OPTIONAL extras applied on top:
 * also save to the device camera roll, and/or also copy into one album.
 * Persisted to AsyncStorage (see photoAlbumStore for the pattern). If the
 * stored album is later deleted, the read site falls back to no-album — the
 * store itself does not know the album list.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface CaptureExtras {
  /** Also write each capture to the device camera roll. */
  alsoDeviceGallery: boolean;
  /** Also copy each capture into this album (null = none). */
  alsoAlbumId: string | null;
}

interface CaptureExtrasState extends CaptureExtras {
  setAlsoDeviceGallery: (value: boolean) => void;
  /** Toggle the single sticky album (pass null to clear). */
  setAlsoAlbumId: (albumId: string | null) => void;
}

export const useCaptureExtrasStore = create<CaptureExtrasState>()(
  persist(
    (set) => ({
      alsoDeviceGallery: false,
      alsoAlbumId: null,
      setAlsoDeviceGallery: (alsoDeviceGallery) => set({ alsoDeviceGallery }),
      setAlsoAlbumId: (alsoAlbumId) => set({ alsoAlbumId }),
    }),
    {
      name: "capture-extras",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
