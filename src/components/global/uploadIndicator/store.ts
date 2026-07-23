import { create } from "zustand";

export type UploadIndicatorPhase = "active" | "success" | "error";

interface UploadIndicatorState {
  /** Active upload ids -> optional label (insertion order preserved) */
  entries: Record<string, string | undefined>;
  visible: boolean;
  phase: UploadIndicatorPhase;
  label: string;
}

const DEFAULT_ACTIVE_LABEL = "Uploading…";
const DEFAULT_SUCCESS_LABEL = "Done";
const DEFAULT_ERROR_LABEL = "Upload failed";

/** How long the terminal state (check / error glyph) is held before hiding */
const SUCCESS_HOLD_MS = 900;
const ERROR_HOLD_MS = 1400;

export const useUploadIndicatorStore = create<UploadIndicatorState>(() => ({
  entries: {},
  visible: false,
  phase: "active",
  label: DEFAULT_ACTIVE_LABEL,
}));

let hideTimer: ReturnType<typeof setTimeout> | null = null;

const clearHideTimer = () => {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
};

/** Most recently begun labelled entry wins; falls back to the default */
const activeLabel = (entries: Record<string, string | undefined>): string => {
  const labels = Object.values(entries).filter(
    (label): label is string => !!label,
  );
  return labels[labels.length - 1] ?? DEFAULT_ACTIVE_LABEL;
};

const finish = (
  id: string,
  phase: UploadIndicatorPhase,
  defaultLabel: string,
  holdMs: number,
  label?: string,
) => {
  const state = useUploadIndicatorStore.getState();
  // Unknown id (begin was never called, or already finished) — ignore so a
  // stray succeed/fail can't flash the pill
  if (!(id in state.entries)) return;

  const entries = { ...state.entries };
  delete entries[id];

  if (Object.keys(entries).length > 0) {
    // Others still uploading — keep spinning, just refresh the label
    useUploadIndicatorStore.setState({ entries, label: activeLabel(entries) });
    return;
  }

  // Last one done — morph to the terminal glyph, hold briefly, then hide
  clearHideTimer();
  useUploadIndicatorStore.setState({
    entries,
    phase,
    label: label ?? defaultLabel,
    visible: true,
  });
  hideTimer = setTimeout(() => {
    hideTimer = null;
    useUploadIndicatorStore.setState({ visible: false });
  }, holdMs);
};

export const uploadIndicator = {
  /**
   * Shows (or keeps showing) the pill for the given upload id. Calling again
   * with the same id just updates the label. Multiple concurrent ids are
   * ref-counted: the pill hides only when all of them are done.
   */
  begin: (id: string, label?: string): void => {
    clearHideTimer();
    useUploadIndicatorStore.setState((state) => {
      const entries = { ...state.entries, [id]: label ?? state.entries[id] };
      return {
        entries,
        visible: true,
        phase: "active",
        label: label ?? activeLabel(entries),
      };
    });
  },

  /**
   * Marks the id done. When it is the last active one, the pill briefly shows
   * a checkmark + label (default "Done"), then slides away.
   */
  succeed: (id: string, label?: string): void => {
    finish(id, "success", DEFAULT_SUCCESS_LABEL, SUCCESS_HOLD_MS, label);
  },

  /**
   * Marks the id done. When it is the last active one, the pill briefly shows
   * an error glyph + label (default "Upload failed"), then slides away.
   */
  fail: (id: string, label?: string): void => {
    finish(id, "error", DEFAULT_ERROR_LABEL, ERROR_HOLD_MS, label);
  },
};
