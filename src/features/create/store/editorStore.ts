/**
 * Memo Create Studio — ephemeral editor state.
 *
 * The open project, selection, and the undo/redo stacks. Deliberately NOT
 * persisted: the durable copy lives in createProjectsStore via the
 * screen's autosave, exactly like v1's editors. One store instance is fine
 * because only one studio editor is ever open at a time.
 *
 * Undo model: `commit` snapshots the current project onto the past stack
 * before applying an updater (one gesture = one commit = one undo step).
 * Non-undoable commits (URL healing, asset-size corrections) mutate in
 * place without touching the stacks.
 */

import { create } from "zustand";

import type { StudioProject } from "../engine/document";

const MAX_UNDO = 50;

interface EditorState {
  project: StudioProject | null;
  selectedLayerId: string | null;
  /** Image layer in crop mode: gestures adjust the crop, not the frame. */
  croppingLayerId: string | null;
  past: StudioProject[];
  future: StudioProject[];
  load: (project: StudioProject) => void;
  reset: () => void;
  select: (layerId: string | null) => void;
  setCropping: (layerId: string | null) => void;
  commit: (
    updater: (project: StudioProject) => StudioProject,
    options?: { undoable?: boolean },
  ) => void;
  undo: () => void;
  redo: () => void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  project: null,
  selectedLayerId: null,
  croppingLayerId: null,
  past: [],
  future: [],

  load: (project) =>
    set({
      project,
      selectedLayerId: null,
      croppingLayerId: null,
      past: [],
      future: [],
    }),

  reset: () =>
    set({
      project: null,
      selectedLayerId: null,
      croppingLayerId: null,
      past: [],
      future: [],
    }),

  // Selecting away (or deselecting) leaves crop mode
  select: (layerId) =>
    set((state) => ({
      selectedLayerId: layerId,
      croppingLayerId:
        layerId === state.croppingLayerId ? state.croppingLayerId : null,
    })),

  setCropping: (layerId) =>
    set((state) => ({
      croppingLayerId: layerId,
      selectedLayerId: layerId ?? state.selectedLayerId,
    })),

  commit: (updater, options) =>
    set((state) => {
      if (!state.project) return state;
      const next = {
        ...updater(state.project),
        updatedAt: new Date().toISOString(),
      };
      if (options?.undoable === false) return { project: next };
      return {
        project: next,
        past: [...state.past.slice(-(MAX_UNDO - 1)), state.project],
        future: [],
      };
    }),

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!state.project || !previous) return state;
      return {
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future],
        croppingLayerId: null,
        // The restored snapshot may not contain the selected layer
        selectedLayerId:
          previous.layers.some((l) => l.id === state.selectedLayerId)
            ? state.selectedLayerId
            : null,
      };
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!state.project || !next) return state;
      return {
        project: next,
        past: [...state.past, state.project],
        future: state.future.slice(1),
        croppingLayerId: null,
        selectedLayerId: next.layers.some(
          (l) => l.id === state.selectedLayerId,
        )
          ? state.selectedLayerId
          : null,
      };
    }),
}));

export const selectCanUndo = (state: EditorState): boolean =>
  state.past.length > 0;
export const selectCanRedo = (state: EditorState): boolean =>
  state.future.length > 0;
