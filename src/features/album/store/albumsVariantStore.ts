import { create } from "zustand";
import { MMKV } from "react-native-mmkv";

/**
 * A/B assignment for the My Albums tab (and its create/join flows).
 *
 * "classic"   — the shipped tab: "My Photos" strip + sectioned albums grid,
 *               and the three-step choice/create/join modal.
 * "editorial" — the hairline "My albums" page: display title, ALL MY PHOTOS
 *               strip, filter tabs, plus the "Add an album" sheet and the
 *               fuller New album / Join an album screens.
 *
 * Same contract as galleryVariantStore: the assignment is written straight
 * to MMKV on FIRST read so it sticks across launches, and MMKV being sync
 * means the home pager mounts the right tab on its first frame — no flash
 * of the other layout. `setAlbumsVariant` overrides the assignment (the
 * switch in album settings, dev, or a future remote kill switch).
 */
const experimentsStorage = new MMKV({ id: "experiments-storage" });

const ASSIGNMENT_KEY = "albums-variant-assignment";

export type AlbumsVariant = "classic" | "editorial";

/**
 * Sticky assignment: the stored value always wins. A fresh install defaults
 * to "editorial" — the variant being trialled. For a real 50/50 rollout,
 * swap the default for the coin flip:
 * `Math.random() < 0.5 ? "classic" : "editorial"`.
 */
const DEFAULT_VARIANT: AlbumsVariant = "editorial";

const assignVariant = (): AlbumsVariant => {
  const existing = experimentsStorage.getString(ASSIGNMENT_KEY);
  if (existing === "classic" || existing === "editorial") return existing;
  experimentsStorage.set(ASSIGNMENT_KEY, DEFAULT_VARIANT);
  return DEFAULT_VARIANT;
};

interface AlbumsVariantState {
  albumsVariant: AlbumsVariant;
  setAlbumsVariant: (variant: AlbumsVariant) => void;
}

export const useAlbumsVariantStore = create<AlbumsVariantState>()((set) => ({
  albumsVariant: assignVariant(),
  setAlbumsVariant: (variant) => {
    experimentsStorage.set(ASSIGNMENT_KEY, variant);
    set({ albumsVariant: variant });
  },
}));

export const selectAlbumsVariant = (state: AlbumsVariantState) =>
  state.albumsVariant;
