/**
 * Store for tracking which local photos belong to albums
 * Maps local asset URIs to album info
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AlbumAssociation {
  albumId: string;
  albumTitle: string;
  uploadedAt: number;
}

interface PhotoAlbumState {
  // Map of local photo URI -> album association
  associations: Record<string, AlbumAssociation>;

  // Add association when photo is uploaded to album
  addAssociation: (
    localUri: string,
    albumId: string,
    albumTitle: string
  ) => void;

  // Get album info for a local photo
  getAlbumForPhoto: (localUri: string) => AlbumAssociation | null;

  // Check if photo is in any album
  isPhotoInAlbum: (localUri: string) => boolean;

  // Clear all associations
  clearAssociations: () => void;
}

export const usePhotoAlbumStore = create<PhotoAlbumState>()(
  persist(
    (set, get) => ({
      associations: {},

      addAssociation: (localUri, albumId, albumTitle) => {
        // Normalize URI by removing file:// prefix for consistent matching
        const normalizedUri = localUri.replace(/^file:\/\//, "");

        set((state) => ({
          associations: {
            ...state.associations,
            [normalizedUri]: {
              albumId,
              albumTitle,
              uploadedAt: Date.now(),
            },
          },
        }));
      },

      getAlbumForPhoto: (localUri) => {
        const normalizedUri = localUri.replace(/^file:\/\//, "");
        return get().associations[normalizedUri] ?? null;
      },

      isPhotoInAlbum: (localUri) => {
        const normalizedUri = localUri.replace(/^file:\/\//, "");
        return normalizedUri in get().associations;
      },

      clearAssociations: () => {
        set({ associations: {} });
      },
    }),
    {
      name: "photo-album-associations",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
