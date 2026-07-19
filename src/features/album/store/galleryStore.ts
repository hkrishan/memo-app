import { create } from 'zustand';

interface GalleryStore {
  refreshKey: number;
  triggerRefresh: () => void;
}

export const useGalleryStore = create<GalleryStore>((set) => ({
  refreshKey: 0,
  triggerRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
}));
