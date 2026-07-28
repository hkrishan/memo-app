/**
 * Memo Create — saved projects (drafts).
 *
 * Every edit auto-saves its project here, so leaving the editor never loses
 * work; the Projects tab lists them for reopening. Persisted to
 * AsyncStorage like the app's other long-lived stores.
 *
 * Photos are referenced by URI plus (when known) their library photoId.
 * Signed URLs rot after ~72h, so on open the editor re-resolves each slot
 * against the current library by photoId and falls back to the stored URI —
 * a draft older than the signature window still heals itself as long as the
 * photo is still in the library.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** One filled slot: how to draw it now, and how to re-resolve it later. */
export type SlotPhoto = {
  uri: string;
  /** Memo-library photoId when the photo came from there. */
  photoId: string | null;
};

export type CollageProject = {
  id: string;
  type: "collage";
  templateId: string;
  ratioId: string;
  /** Slot photos by template slot index; null = still empty. */
  slots: (SlotPhoto | null)[];
  gap: number;
  cornerRadius: number;
  /** Canvas background, hex. */
  background: string;
  createdAt: string;
  updatedAt: string;
};

export type CarouselProject = {
  id: string;
  type: "carousel";
  ratioId: string;
  photo: SlotPhoto | null;
  pages: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateProject = CollageProject | CarouselProject;

interface CreateProjectsState {
  projects: CreateProject[];
  /** Insert or replace by id; newest-touched first. */
  upsert: (project: CreateProject) => void;
  remove: (id: string) => void;
}

export const useCreateProjectsStore = create<CreateProjectsState>()(
  persist(
    (set) => ({
      projects: [],
      upsert: (project) =>
        set((state) => ({
          projects: [
            project,
            ...state.projects.filter((p) => p.id !== project.id),
          ],
        })),
      remove: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
        })),
    }),
    {
      name: "create-projects",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

let counter = 0;
export const newProjectId = (): string => `proj-${Date.now()}-${counter++}`;
