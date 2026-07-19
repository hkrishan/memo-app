import { create } from "zustand";

export type PendingAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
};

interface PendingUploadsState {
  assets: PendingAsset[];
  setAssets: (assets: PendingAsset[]) => void;
  clearAssets: () => void;
  addAssets: (assets: PendingAsset[]) => void;
  removeAsset: (uri: string) => void;
}

export const usePendingUploadsStore = create<PendingUploadsState>((set) => ({
  assets: [],
  setAssets: (assets) => set({ assets }),
  clearAssets: () => set({ assets: [] }),
  addAssets: (newAssets) =>
    set((state) => ({ assets: [...state.assets, ...newAssets] })),
  removeAsset: (uri) =>
    set((state) => ({ assets: state.assets.filter((a) => a.uri !== uri) })),
}));
