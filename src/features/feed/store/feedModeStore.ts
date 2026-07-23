import { create } from "zustand";

export type FeedMode = "pages" | "albums";

interface FeedModeState {
  mode: FeedMode;
  setMode: (mode: FeedMode) => void;
}

/**
 * In-memory only (deliberately not persisted to disk): the feed reopens on
 * the last-viewed mode within a session, and resets to Pages on app relaunch.
 */
export const useFeedModeStore = create<FeedModeState>((set) => ({
  mode: "pages",
  setMode: (mode) => set({ mode }),
}));
