/**
 * Memo Create Studio — the shared layer gesture engine.
 *
 * Everything a movable layer needs, image or text: live transform in
 * shared values (60fps, zero React renders), registry registration for the
 * stage overlays, doc→SV syncing guarded while gestures own the values,
 * drag with snap lines + haptic lock-on, pinch scale, two-finger rotate
 * with 45° capture, touch-down selection, and a single store commit when
 * the last finger lifts. Text layers add a double-tap to re-open editing.
 */

import { useCallback, useEffect, useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { clamp } from "@/features/photos/components/photoViewer/geometry";
import type { LayerTransform } from "../../engine/document";
import { snapPoint, snapRotation, type SnapLines } from "../../engine/snapping";
import { useEditorStore } from "../../store/editorStore";
import { asBlockableRef, useStageContext } from "./layerTransformContext";

/** Preview px within which a drag locks onto a snap line. */
const SNAP_THRESHOLD = 6;
/** Rotation capture window: 3°. */
const ROTATION_SNAP = Math.PI / 60;
export const MIN_LAYER_SCALE = 0.05;
export const MAX_LAYER_SCALE = 20;

const hapticTick = () => {
  Haptics.selectionAsync().catch(() => {});
};

interface LayerGestureParams {
  layerId: string;
  transform: LayerTransform;
  /** preview px per doc px. */
  ps: number;
  /** Snap lines in DOC px (converted to preview px here, once). */
  snapLines: SnapLines;
  /** Layer box in preview px (drives the centering offset). */
  width: number;
  height: number;
  onDoubleTap?: () => void;
}

export const useLayerGestures = ({
  layerId,
  transform,
  ps,
  snapLines,
  width,
  height,
  onDoubleTap,
}: LayerGestureParams) => {
  const { registry, guideX, guideY, scrollRef } = useStageContext();

  const cx = useSharedValue(transform.x * ps);
  const cy = useSharedValue(transform.y * ps);
  const sc = useSharedValue(transform.scale);
  const rot = useSharedValue(transform.rotation);
  const activeCount = useSharedValue(0);

  // Gesture baselines + last-snap trackers (for one haptic per lock-on)
  const baseCx = useSharedValue(0);
  const baseCy = useSharedValue(0);
  const baseSc = useSharedValue(1);
  const baseRot = useSharedValue(0);
  const lastGuideX = useSharedValue(-1);
  const lastGuideY = useSharedValue(-1);
  const lastRotSnapped = useSharedValue(0);
  // onFinalize fires for gestures that never activated too — each gesture
  // only balances the active counter if its own onStart ran
  const panStarted = useSharedValue(0);
  const pinchStarted = useSharedValue(0);
  const rotStarted = useSharedValue(0);

  // Stage overlays (selection frame, handle) find this layer's live
  // transform through the registry
  useEffect(() => {
    const map = registry.current;
    map.set(layerId, { cx, cy, sc, rot, activeCount });
    return () => {
      map.delete(layerId);
    };
  }, [layerId, registry, cx, cy, sc, rot, activeCount]);

  // Doc → shared values, whenever the doc changes underneath us (undo,
  // heal, zoom changing ps) and no gesture owns the values right now
  const { x, y, scale, rotation } = transform;
  useEffect(() => {
    if (activeCount.value > 0) return;
    cx.value = x * ps;
    cy.value = y * ps;
    sc.value = scale;
    rot.value = rotation;
  }, [x, y, scale, rotation, ps, cx, cy, sc, rot, activeCount]);

  const previewLines = useMemo<SnapLines>(
    () => ({
      xs: snapLines.xs.map((line) => line * ps),
      ys: snapLines.ys.map((line) => line * ps),
    }),
    [snapLines, ps],
  );

  const select = useCallback(() => {
    useEditorStore.getState().select(layerId);
  }, [layerId]);

  const commitTransform = useCallback(() => {
    useEditorStore.getState().commit((project) => ({
      ...project,
      layers: project.layers.map((l) =>
        l.id === layerId
          ? {
              ...l,
              transform: {
                x: cx.value / ps,
                y: cy.value / ps,
                scale: sc.value,
                rotation: rot.value,
              },
            }
          : l,
      ),
    }));
  }, [layerId, ps, cx, cy, sc, rot]);

  const gesture = useMemo(() => {
    const finishOne = () => {
      "worklet";
      activeCount.value -= 1;
      if (activeCount.value === 0) {
        guideX.value = -1;
        guideY.value = -1;
        runOnJS(commitTransform)();
      }
    };

    const pan = Gesture.Pan()
      .blocksExternalGesture(asBlockableRef(scrollRef))
      .onBegin(() => {
        runOnJS(select)();
      })
      .onStart(() => {
        panStarted.value = 1;
        activeCount.value += 1;
        baseCx.value = cx.value;
        baseCy.value = cy.value;
        lastGuideX.value = -1;
        lastGuideY.value = -1;
      })
      .onUpdate((event) => {
        const snapped = snapPoint(
          baseCx.value + event.translationX,
          baseCy.value + event.translationY,
          (width * sc.value) / 2,
          (height * sc.value) / 2,
          previewLines,
          SNAP_THRESHOLD,
        );
        cx.value = snapped.x;
        cy.value = snapped.y;
        guideX.value = snapped.guideX;
        guideY.value = snapped.guideY;
        if (
          (snapped.guideX >= 0 && snapped.guideX !== lastGuideX.value) ||
          (snapped.guideY >= 0 && snapped.guideY !== lastGuideY.value)
        ) {
          runOnJS(hapticTick)();
        }
        lastGuideX.value = snapped.guideX;
        lastGuideY.value = snapped.guideY;
      })
      .onFinalize(() => {
        if (panStarted.value === 1) {
          panStarted.value = 0;
          finishOne();
        }
      });

    const pinch = Gesture.Pinch()
      .blocksExternalGesture(asBlockableRef(scrollRef))
      .onStart(() => {
        pinchStarted.value = 1;
        activeCount.value += 1;
        baseSc.value = sc.value;
      })
      .onUpdate((event) => {
        sc.value = clamp(
          baseSc.value * event.scale,
          MIN_LAYER_SCALE,
          MAX_LAYER_SCALE,
        );
      })
      .onFinalize(() => {
        if (pinchStarted.value === 1) {
          pinchStarted.value = 0;
          finishOne();
        }
      });

    const rotate = Gesture.Rotation()
      .blocksExternalGesture(asBlockableRef(scrollRef))
      .onStart(() => {
        rotStarted.value = 1;
        activeCount.value += 1;
        baseRot.value = rot.value;
        lastRotSnapped.value = 0;
      })
      .onUpdate((event) => {
        const snapped = snapRotation(
          baseRot.value + event.rotation,
          ROTATION_SNAP,
        );
        rot.value = snapped.rotation;
        if (snapped.snapped && lastRotSnapped.value === 0) {
          runOnJS(hapticTick)();
        }
        lastRotSnapped.value = snapped.snapped ? 1 : 0;
      })
      .onFinalize(() => {
        if (rotStarted.value === 1) {
          rotStarted.value = 0;
          finishOne();
        }
      });

    const combined = Gesture.Simultaneous(pan, pinch, rotate);
    if (!onDoubleTap) return combined;
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDistance(16)
      .onEnd(() => {
        runOnJS(onDoubleTap)();
      });
    // A drag cancels the double-tap; a clean double-tap never moves enough
    // to activate the pan, so Race resolves them without delaying either
    return Gesture.Race(doubleTap, combined);
    // Shared values are stable refs; the closures only need re-creation
    // when geometry or the commit target changes
  }, [
    previewLines,
    select,
    commitTransform,
    onDoubleTap,
    width,
    height,
    scrollRef,
    activeCount,
    baseCx,
    baseCy,
    baseSc,
    baseRot,
    cx,
    cy,
    sc,
    rot,
    guideX,
    guideY,
    lastGuideX,
    lastGuideY,
    lastRotSnapped,
    panStarted,
    pinchStarted,
    rotStarted,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cx.value - width / 2 },
      { translateY: cy.value - height / 2 },
      { rotate: `${rot.value}rad` },
      { scale: sc.value },
    ],
  }));

  return { gesture, animatedStyle };
};
