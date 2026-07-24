/**
 * Capture-destination store
 * Sticky preference for where the MAIN camera tab auto-saves each capture:
 * the device gallery (default) or a specific album. Persisted to
 * AsyncStorage, matching the codebase's persisted-store style (see
 * photoAlbumStore). If the stored album is later deleted, the read site
 * falls back to gallery — the store itself does not know the album list.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type CaptureDestination =
  | { type: "gallery" }
  | { type: "album"; albumId: string };

interface CaptureDestinationState {
  destination: CaptureDestination;
  setDestination: (destination: CaptureDestination) => void;
}

export const useCaptureDestinationStore = create<CaptureDestinationState>()(
  persist(
    (set) => ({
      destination: { type: "gallery" },
      setDestination: (destination) => set({ destination }),
    }),
    {
      name: "capture-destination",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
