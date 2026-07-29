/**
 * Memo Create Studio — which photos are creations.
 *
 * The exported cover image itself stays clean (no baked-in stamp); the
 * "made with Memo Create" indication is a UI badge drawn by the photo
 * tiles. This store is how tiles know: every export registers the ids the
 * cover received — the Memo-library photoId and, when copied into an
 * album, the album copy's photoId. Persisted so the badges survive
 * restarts. (Device-local by design: creations made on this device.)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface CreationMeta {
  /** >1 = the cover represents a carousel. */
  pageCount: number;
  createdAt: string;
}

interface CreatedCoversState {
  covers: Record<string, CreationMeta>;
  register: (photoIds: string[], meta: CreationMeta) => void;
}

export const useCreatedCoversStore = create<CreatedCoversState>()(
  persist(
    (set) => ({
      covers: {},
      register: (photoIds, meta) =>
        set((state) => ({
          covers: {
            ...state.covers,
            ...Object.fromEntries(photoIds.map((id) => [id, meta])),
          },
        })),
    }),
    {
      name: "memo-create-covers",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** Tile-side lookup: meta when this photo is a Memo Create cover. */
export const useCreationMeta = (photoId: string): CreationMeta | undefined =>
  useCreatedCoversStore((state) => state.covers[photoId]);
