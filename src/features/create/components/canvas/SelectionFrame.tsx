/**
 * Memo Create Studio — selection chrome.
 *
 * A stage-level overlay that mirrors the selected layer's live transform
 * (via the shared-value registry), so it tracks drags at 60fps without a
 * single React render. The bottom-right handle is SCRL-style one-finger
 * scale + rotate around the layer center: the handle's screen-space vector
 * from the center gives both the scale factor (length ratio) and the
 * rotation delta (angle) — no absolute coordinates needed, pan translation
 * is enough.
 *
 * Border thickness and handle size counter the layer's *committed* scale
 * so chrome stays hairline at any zoom; during a live pinch it briefly
 * scales with the layer, which is imperceptible and saves a per-frame
 * layout pass.
 */

import React, { memo, useEffect, useMemo, useReducer, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { clamp } from "@/features/photos/components/photoViewer/geometry";
import type { Layer } from "../../engine/document";
import { estimatedTextHeight, textLayerBox } from "../../engine/paragraph";
import { snapRotation } from "../../engine/snapping";
import { useEditorStore } from "../../store/editorStore";
import { asBlockableRef, useStageContext } from "./layerTransformContext";

const ROTATION_SNAP = Math.PI / 60;
const MIN_SCALE = 0.05;
const MAX_SCALE = 20;
const HANDLE_SIZE = 18;

interface SelectionFrameProps {
  layer: Layer;
  ps: number;
}

export const SelectionFrame = memo<SelectionFrameProps>(({ layer, ps }) => {
  const { registry, scrollRef } = useStageContext();
  const svs = registry.current.get(layer.id);

  // A layer selected the moment it's added (photo pick) registers its
  // shared values in an effect AFTER this first render — retry once
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const retriedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!svs && retriedForRef.current !== layer.id) {
      retriedForRef.current = layer.id;
      forceRender();
    }
  }, [svs, layer.id]);

  // Text boxes include the pill padding; height comes from the canvas's
  // cached paragraph measurement (estimated until fonts load)
  const textBox =
    layer.type === "text" ? textLayerBox(layer, estimatedTextHeight(layer)) : null;
  const baseWidth = layer.type === "image" ? layer.baseWidth : textBox!.width;
  const baseHeight = layer.type === "image" ? layer.baseHeight : textBox!.height;
  const width = baseWidth * ps;
  const height = baseHeight * ps;

  const baseSc = useSharedValue(1);
  const baseRot = useSharedValue(0);
  const v0x = useSharedValue(1);
  const v0y = useSharedValue(1);
  const lastRotSnapped = useSharedValue(0);
  // Balance activeCount only if this gesture's own onStart ran
  const handleStarted = useSharedValue(0);

  const commitTransform = useMemo(() => {
    if (!svs) return () => {};
    const { cx, cy, sc, rot } = svs;
    return () => {
      useEditorStore.getState().commit((project) => ({
        ...project,
        layers: project.layers.map((l) =>
          l.id === layer.id
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
    };
  }, [svs, layer.id, ps]);

  const handleGesture = useMemo(() => {
    if (!svs) return Gesture.Pan().enabled(false);
    const { sc, rot, activeCount } = svs;
    return Gesture.Pan()
      .blocksExternalGesture(asBlockableRef(scrollRef))
      .onStart(() => {
        handleStarted.value = 1;
        activeCount.value += 1;
        baseSc.value = sc.value;
        baseRot.value = rot.value;
        // Center → handle vector in stage/screen px, at gesture start
        const halfW = (width * sc.value) / 2;
        const halfH = (height * sc.value) / 2;
        const cos = Math.cos(rot.value);
        const sin = Math.sin(rot.value);
        v0x.value = halfW * cos - halfH * sin;
        v0y.value = halfW * sin + halfH * cos;
        lastRotSnapped.value = 0;
      })
      .onUpdate((event) => {
        const vx = v0x.value + event.translationX;
        const vy = v0y.value + event.translationY;
        const len0 = Math.sqrt(v0x.value * v0x.value + v0y.value * v0y.value);
        const len = Math.sqrt(vx * vx + vy * vy);
        if (len0 < 1 || len < 1) return;
        sc.value = clamp(baseSc.value * (len / len0), MIN_SCALE, MAX_SCALE);
        const delta = Math.atan2(
          v0x.value * vy - v0y.value * vx,
          v0x.value * vx + v0y.value * vy,
        );
        const snapped = snapRotation(baseRot.value + delta, ROTATION_SNAP);
        rot.value = snapped.rotation;
        lastRotSnapped.value = snapped.snapped ? 1 : 0;
      })
      .onFinalize(() => {
        if (handleStarted.value === 1) {
          handleStarted.value = 0;
          activeCount.value -= 1;
          runOnJS(commitTransform)();
        }
      });
  }, [
    svs,
    scrollRef,
    width,
    height,
    commitTransform,
    baseSc,
    baseRot,
    v0x,
    v0y,
    lastRotSnapped,
    handleStarted,
  ]);

  const animatedStyle = useAnimatedStyle(() => {
    if (!svs) return { opacity: 0 };
    return {
      opacity: 1,
      transform: [
        { translateX: svs.cx.value - width / 2 },
        { translateY: svs.cy.value - height / 2 },
        { rotate: `${svs.rot.value}rad` },
        { scale: svs.sc.value },
      ],
    };
  }, [svs, width, height]);

  if (!svs) return null;

  // Chrome countering the committed scale (live pinch briefly scales it)
  const committedScale = Math.max(layer.transform.scale, MIN_SCALE);
  const borderWidth = Math.min(1.5 / committedScale, 6);
  const handleScale = 1 / committedScale;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.frame, { width, height }, animatedStyle]}
    >
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, styles.border, { borderWidth }]}
      />
      <GestureDetector gesture={handleGesture}>
        <View
          style={[
            styles.handle,
            {
              right: -HANDLE_SIZE / 2,
              bottom: -HANDLE_SIZE / 2,
              transform: [{ scale: handleScale }],
            },
          ]}
          hitSlop={10}
          accessibilityRole="adjustable"
          accessibilityLabel="Resize and rotate"
        >
          <View style={styles.handleDot} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
});
SelectionFrame.displayName = "SelectionFrame";

const styles = StyleSheet.create({
  frame: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  border: {
    borderColor: "#000",
    // A whisper of white so the black frame reads on dark layers too
    shadowColor: "#fff",
    shadowOpacity: 0.9,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 0 },
  },
  handle: {
    position: "absolute",
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  handleDot: {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#000",
  },
});
