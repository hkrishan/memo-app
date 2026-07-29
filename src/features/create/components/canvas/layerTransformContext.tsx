/**
 * Memo Create Studio — the stage's shared-value plumbing.
 *
 * Each layer view owns Reanimated shared values for its LIVE transform
 * (gestures write these at 60fps; the store only sees a commit when the
 * gesture ends). The registry lets stage-level overlays — the selection
 * frame, its scale/rotate handle — track whichever layer is selected
 * without re-rendering per frame. Snap-guide positions live here too since
 * any layer's drag can light them up.
 */

import { createContext, useContext } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { SharedValue } from "react-native-reanimated";
import type { GestureType, ScrollView } from "react-native-gesture-handler";

export interface LayerSharedValues {
  /** Layer center in preview px. */
  cx: SharedValue<number>;
  cy: SharedValue<number>;
  /** Doc-space uniform scale (dimensionless). */
  sc: SharedValue<number>;
  /** Radians. */
  rot: SharedValue<number>;
  /** >0 while any gesture on this layer is live (guards doc→SV syncing). */
  activeCount: SharedValue<number>;
}

export interface StageContextValue {
  registry: MutableRefObject<Map<string, LayerSharedValues>>;
  /** Snap guide positions in preview px; -1 = hidden. */
  guideX: SharedValue<number>;
  guideY: SharedValue<number>;
  /** The stage's horizontal ScrollView — layer pans block it. */
  scrollRef: RefObject<ScrollView | null>;
}

export const StageContext = createContext<StageContextValue | null>(null);

export const useStageContext = (): StageContextValue => {
  const value = useContext(StageContext);
  if (!value) throw new Error("useStageContext outside CanvasStage");
  return value;
};

/**
 * RNGH's `blocksExternalGesture` types its ref parameter around
 * ComponentType, but the documented ref-interop pattern passes exactly this
 * kind of native-component ref at runtime — the cast bridges the sloppy
 * upstream typing, nothing more.
 */
export const asBlockableRef = (
  ref: RefObject<ScrollView | null>,
): GestureType => ref as unknown as GestureType;
