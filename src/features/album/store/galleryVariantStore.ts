import { create } from "zustand";
import { MMKV } from "react-native-mmkv";

/**
 * A/B assignment for the album Gallery tab layout.
 *
 * "classic"   — the shipped sectioned overview (GalleryPage).
 * "editorial" — the cover-hero + day-grouped grid variant (GalleryPageB).
 *
 * Assignment is a 50/50 coin flip on FIRST read, written straight to MMKV
 * so it sticks across launches (zustand/persist only writes on set, which
 * would re-flip users who never touch the setter). MMKV is sync, so the
 * pager renders the right variant on its first frame — no flash of the
 * other layout. `setGalleryVariant` overrides the assignment (dev/testing,
 * or a future remote kill switch).
 */
const experimentsStorage = new MMKV({ id: "experiments-storage" });

/**
 * The editorial variant's full-bleed cover height — shared here (the
 * experiment's one common module) because BOTH sides of the contract need
 * it: GalleryPageB sizes its hero with it, and AlbumNavBar derives the
 * deeper scroll thresholds its white bar fades in at (the classic
 * header's [60, 130] range would frost the bar over the dark cover).
 */
export const EDITORIAL_HERO_HEIGHT = 420;

const ASSIGNMENT_KEY = "gallery-variant-assignment";

export type GalleryVariant = "classic" | "editorial";

/**
 * Sticky assignment: the stored value always wins, so the user-facing
 * switch in album settings (setGalleryVariant) holds across launches.
 * A fresh install defaults to "editorial" — the variant being trialled.
 * For a real 50/50 rollout, swap the default for the coin flip:
 * `Math.random() < 0.5 ? "classic" : "editorial"`.
 */
const DEFAULT_VARIANT: GalleryVariant = "editorial";

const assignVariant = (): GalleryVariant => {
  const existing = experimentsStorage.getString(ASSIGNMENT_KEY);
  if (existing === "classic" || existing === "editorial") return existing;
  experimentsStorage.set(ASSIGNMENT_KEY, DEFAULT_VARIANT);
  return DEFAULT_VARIANT;
};

interface GalleryVariantState {
  galleryVariant: GalleryVariant;
  setGalleryVariant: (variant: GalleryVariant) => void;
}

export const useGalleryVariantStore = create<GalleryVariantState>()((set) => ({
  galleryVariant: assignVariant(),
  setGalleryVariant: (variant) => {
    experimentsStorage.set(ASSIGNMENT_KEY, variant);
    set({ galleryVariant: variant });
  },
}));

export const selectGalleryVariant = (state: GalleryVariantState) =>
  state.galleryVariant;
