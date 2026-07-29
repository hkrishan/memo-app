/**
 * Memo Create Studio — one image layer on the stage.
 *
 * Two interaction modes:
 *  - normal: drag/pinch/rotate the FRAME (useLayerGestures, shared with
 *    text layers). Double-tap enters crop mode.
 *  - crop: the frame is pinned; pan repositions the photo INSIDE it and
 *    pinch zooms the crop — the reframing tool every serious editor has.
 *    Both write crop shared values at 60fps and commit once on release.
 *
 * Crop is shown by an oversized inner image inside an overflow-hidden
 * frame — the view-side twin of the exporter's drawImageRect(src → dst).
 */

import React, { memo, useCallback, useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { clamp } from "@/features/photos/components/photoViewer/geometry";
import type { ImageLayer } from "../../engine/document";
import { coverCropUnitRect } from "../../engine/geometry";
import type { SnapLines } from "../../engine/snapping";
import { useEditorStore } from "../../store/editorStore";
import { asBlockableRef, useStageContext } from "./layerTransformContext";
import { useLayerGestures } from "./useLayerGestures";

const AnimatedImage = Animated.createAnimatedComponent(Image);

/** Deepest crop-in allowed, relative to the full asset. */
const MAX_CROP_ZOOM = 8;

interface ImageLayerViewProps {
  layer: ImageLayer;
  /** preview px per doc px. */
  ps: number;
  snapLines: SnapLines;
  /** Crop mode: gestures reframe the photo instead of moving the frame. */
  isCropping: boolean;
}

export const ImageLayerView = memo<ImageLayerViewProps>(
  ({ layer, ps, snapLines, isCropping }) => {
    const { scrollRef } = useStageContext();
    const width = layer.baseWidth * ps;
    const height = layer.baseHeight * ps;

    const enterCrop = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      useEditorStore.getState().setCropping(layer.id);
    }, [layer.id]);

    const { gesture, animatedStyle } = useLayerGestures({
      layerId: layer.id,
      transform: layer.transform,
      ps,
      snapLines,
      width,
      height,
      onDoubleTap: enterCrop,
    });

    // ---- live crop (unit space of the asset) ----
    const cropX = useSharedValue(layer.crop.x);
    const cropY = useSharedValue(layer.crop.y);
    const cropW = useSharedValue(layer.crop.w);
    const cropH = useSharedValue(layer.crop.h);
    const cropActive = useSharedValue(0);
    const baseCX = useSharedValue(0);
    const baseCY = useSharedValue(0);
    const baseCW = useSharedValue(1);
    const baseCH = useSharedValue(1);
    const cropPanStarted = useSharedValue(0);
    const cropPinchStarted = useSharedValue(0);

    const { x: cx, y: cy, w: cw, h: ch } = layer.crop;
    useEffect(() => {
      if (cropActive.value > 0) return;
      cropX.value = cx;
      cropY.value = cy;
      cropW.value = cw;
      cropH.value = ch;
    }, [cx, cy, cw, ch, cropX, cropY, cropW, cropH, cropActive]);

    const commitCrop = useCallback(() => {
      useEditorStore.getState().commit((project) => ({
        ...project,
        layers: project.layers.map((l) =>
          l.id === layer.id && l.type === "image"
            ? {
                ...l,
                crop: {
                  x: cropX.value,
                  y: cropY.value,
                  w: cropW.value,
                  h: cropH.value,
                },
              }
            : l,
        ),
      }));
    }, [layer.id, cropX, cropY, cropW, cropH]);

    const cropGesture = useMemo(() => {
      const finishOne = () => {
        "worklet";
        cropActive.value -= 1;
        if (cropActive.value === 0) runOnJS(commitCrop)();
      };

      const pan = Gesture.Pan()
        .blocksExternalGesture(asBlockableRef(scrollRef))
        .onStart(() => {
          cropPanStarted.value = 1;
          cropActive.value += 1;
          baseCX.value = cropX.value;
          baseCY.value = cropY.value;
        })
        .onUpdate((event) => {
          // Moving the photo right reveals content to its left
          const innerW = width / cropW.value;
          const innerH = height / cropH.value;
          cropX.value = clamp(
            baseCX.value - event.translationX / innerW,
            0,
            1 - cropW.value,
          );
          cropY.value = clamp(
            baseCY.value - event.translationY / innerH,
            0,
            1 - cropH.value,
          );
        })
        .onFinalize(() => {
          if (cropPanStarted.value === 1) {
            cropPanStarted.value = 0;
            finishOne();
          }
        });

      const pinch = Gesture.Pinch()
        .blocksExternalGesture(asBlockableRef(scrollRef))
        .onStart(() => {
          cropPinchStarted.value = 1;
          cropActive.value += 1;
          baseCX.value = cropX.value;
          baseCY.value = cropY.value;
          baseCW.value = cropW.value;
          baseCH.value = cropH.value;
        })
        .onUpdate((event) => {
          // Zoom about the crop center; aspect (h/w ratio) never changes
          const k = baseCH.value / baseCW.value;
          const minW = Math.max(1 / MAX_CROP_ZOOM, 0.02);
          const maxW = Math.min(1, 1 / Math.max(k, 1e-6));
          const w = clamp(baseCW.value / event.scale, minW, maxW);
          const h = w * k;
          cropW.value = w;
          cropH.value = h;
          cropX.value = clamp(
            baseCX.value + (baseCW.value - w) / 2,
            0,
            1 - w,
          );
          cropY.value = clamp(
            baseCY.value + (baseCH.value - h) / 2,
            0,
            1 - h,
          );
        })
        .onFinalize(() => {
          if (cropPinchStarted.value === 1) {
            cropPinchStarted.value = 0;
            finishOne();
          }
        });

      return Gesture.Simultaneous(pan, pinch);
    }, [
      width,
      height,
      commitCrop,
      scrollRef,
      cropActive,
      cropX,
      cropY,
      cropW,
      cropH,
      baseCX,
      baseCY,
      baseCW,
      baseCH,
      cropPanStarted,
      cropPinchStarted,
    ]);

    // Inner image driven by the live crop — the same math as the exporter's
    // src rect, expressed as an oversized view offset inside the frame
    const innerStyle = useAnimatedStyle(() => {
      const innerW = width / cropW.value;
      const innerH = height / cropH.value;
      return {
        position: "absolute" as const,
        left: -cropX.value * innerW,
        top: -cropY.value * innerH,
        width: innerW,
        height: innerH,
      };
    }, [width, height]);

    // Some layers are created before the asset's pixel size is known
    // (server photos without dims, v1-converted drafts). Once the preview
    // decodes it, fix the layer up — per its fitMode: "natural" reshapes
    // the frame to the photo's aspect, "cover" keeps the frame and derives
    // the cover crop. Not an undo step.
    const handleLoad = useCallback(
      (event: { source?: { width?: number; height?: number } }) => {
        const sourceWidth = event.source?.width ?? 0;
        const sourceHeight = event.source?.height ?? 0;
        if (layer.assetWidth > 0 || sourceWidth <= 0 || sourceHeight <= 0)
          return;
        useEditorStore.getState().commit(
          (project) => ({
            ...project,
            layers: project.layers.map((l) => {
              if (l.id !== layer.id || l.type !== "image") return l;
              if (l.fitMode === "cover") {
                return {
                  ...l,
                  assetWidth: sourceWidth,
                  assetHeight: sourceHeight,
                  crop: coverCropUnitRect(
                    sourceWidth,
                    sourceHeight,
                    l.baseWidth,
                    l.baseHeight,
                  ),
                };
              }
              return {
                ...l,
                assetWidth: sourceWidth,
                assetHeight: sourceHeight,
                baseHeight: Math.round(
                  (l.baseWidth * sourceHeight) / sourceWidth,
                ),
              };
            }),
          }),
          { undoable: false },
        );
      },
      [layer.id, layer.assetWidth],
    );

    return (
      <GestureDetector gesture={isCropping ? cropGesture : gesture}>
        <Animated.View
          style={[
            styles.layer,
            { width, height, opacity: layer.opacity },
            animatedStyle,
          ]}
        >
          <View
            style={[styles.frame, { borderRadius: layer.cornerRadius * ps }]}
          >
            <AnimatedImage
              source={{ uri: layer.photo.uri }}
              style={innerStyle}
              contentFit="fill"
              transition={60}
              onLoad={handleLoad}
            />
          </View>
          {isCropping && (
            <View pointerEvents="none" style={styles.cropOutline} />
          )}
        </Animated.View>
      </GestureDetector>
    );
  },
);
ImageLayerView.displayName = "ImageLayerView";

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  frame: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "rgba(0, 0, 0, 0.04)",
  },
  // Crop mode reads as "the frame is pinned": a steady white-on-black edge
  cropOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 0 },
  },
});
