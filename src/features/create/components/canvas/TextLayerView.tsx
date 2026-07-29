/**
 * Memo Create Studio — one text layer on the stage.
 *
 * The paragraph is laid out ONCE at doc px (the same SkParagraph the
 * exporter draws) and the drawing is minified into the preview by a group
 * scale — so the preview is literally a scaled-down export, not a second
 * text renderer tuned to agree. Double-tap re-opens the entry overlay.
 */

import React, { memo, useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import {
  Canvas,
  Group,
  Paragraph,
  RoundedRect,
} from "@shopify/react-native-skia";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

import type { TextLayer } from "../../engine/document";
import { useFontProvider } from "../../engine/fonts";
import {
  buildParagraph,
  estimatedTextHeight,
  textBleedFor,
  textLayerBox,
} from "../../engine/paragraph";
import type { SnapLines } from "../../engine/snapping";
import { useEditorStore } from "../../store/editorStore";
import { useLayerGestures } from "./useLayerGestures";

interface TextLayerViewProps {
  layer: TextLayer;
  /** preview px per doc px. */
  ps: number;
  snapLines: SnapLines;
  onEdit: (layerId: string) => void;
  /** True while this layer is open in the entry overlay — the canvas copy
   *  hides so the user never sees the text twice. */
  hidden?: boolean;
}

export const TextLayerView = memo<TextLayerViewProps>(
  ({ layer, ps, snapLines, onEdit, hidden = false }) => {
    const provider = useFontProvider();

    const paragraph = useMemo(
      () => (provider ? buildParagraph(layer, provider) : null),
      // Only the style/content fields matter — not transform commits
      [
        provider,
        layer.text,
        layer.fontFamily,
        layer.fontWeight,
        layer.fontSize,
        layer.color,
        layer.align,
        layer.lineHeightMultiplier,
        layer.letterSpacing,
        layer.maxWidth,
      ],
    );

    const textHeight = paragraph
      ? paragraph.getHeight()
      : estimatedTextHeight(layer);
    const box = textLayerBox(layer, textHeight);
    const width = box.width * ps;
    const height = box.height * ps;

    // Cache the measured height on the layer so selection chrome (and the
    // exporter's culling) has a real box; derived data, not an undo step
    useEffect(() => {
      if (!paragraph) return;
      const measured = paragraph.getHeight();
      if (Math.abs((layer.measuredHeight ?? -1) - measured) < 0.5) return;
      useEditorStore.getState().commit(
        (project) => ({
          ...project,
          layers: project.layers.map((l) =>
            l.id === layer.id && l.type === "text"
              ? { ...l, measuredHeight: measured }
              : l,
          ),
        }),
        { undoable: false },
      );
    }, [paragraph, layer.id, layer.measuredHeight]);

    const { gesture, animatedStyle } = useLayerGestures({
      layerId: layer.id,
      transform: layer.transform,
      ps,
      snapLines,
      width,
      height,
      onDoubleTap: () => onEdit(layer.id),
    });

    // Glyph ink (script swashes, descenders) paints outside the layout
    // box; the canvas gets a bleed margin so it isn't clipped. The layer's
    // logical box — hit area, selection, transforms — stays the layout box.
    const bleed = textBleedFor(layer);
    const bleedPx = bleed * ps;

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.layer,
            { width, height, opacity: hidden ? 0 : layer.opacity },
            animatedStyle,
          ]}
        >
          <Canvas
            style={{
              position: "absolute",
              left: -bleedPx,
              top: -bleedPx,
              width: width + bleedPx * 2,
              height: height + bleedPx * 2,
            }}
            pointerEvents="none"
          >
            <Group transform={[{ scale: ps }]}>
              {layer.background && (
                <RoundedRect
                  x={bleed}
                  y={bleed}
                  width={box.width}
                  height={box.height}
                  r={layer.background.cornerRadius}
                  color={layer.background.color}
                />
              )}
              {paragraph && (
                <Paragraph
                  paragraph={paragraph}
                  x={bleed + box.padX}
                  y={bleed + box.padY}
                  width={layer.maxWidth}
                />
              )}
            </Group>
          </Canvas>
        </Animated.View>
      </GestureDetector>
    );
  },
);
TextLayerView.displayName = "TextLayerView";

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});
