/**
 * Memo Create Studio — gesture-free layer renderers.
 *
 * The same visuals as ImageLayerView/TextLayerView (identical geometry and
 * the identical doc-px Skia paragraph) with zero interactivity — used by
 * the seamless preview, where the strip must render exactly like the
 * editor but only page-snap scroll.
 */

import React, { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import {
  Canvas,
  Group,
  Paragraph,
  RoundedRect,
} from "@shopify/react-native-skia";
import type { SkTypefaceFontProvider } from "@shopify/react-native-skia";

import type { ImageLayer, TextLayer } from "../../engine/document";
import { innerImageRect } from "../../engine/geometry";
import {
  buildParagraph,
  estimatedTextHeight,
  textBleedFor,
  textLayerBox,
} from "../../engine/paragraph";

const layerStyle = (
  transform: ImageLayer["transform"],
  ps: number,
  width: number,
  height: number,
) => ({
  position: "absolute" as const,
  left: 0,
  top: 0,
  width,
  height,
  transform: [
    { translateX: transform.x * ps - width / 2 },
    { translateY: transform.y * ps - height / 2 },
    { rotate: `${transform.rotation}rad` },
    { scale: transform.scale },
  ],
});

export const StaticImageLayer = memo<{ layer: ImageLayer; ps: number }>(
  ({ layer, ps }) => {
    const width = layer.baseWidth * ps;
    const height = layer.baseHeight * ps;
    const inner = innerImageRect(layer.crop, width, height);
    return (
      <View
        style={[
          layerStyle(layer.transform, ps, width, height),
          { opacity: layer.opacity },
        ]}
        pointerEvents="none"
      >
        <View
          style={[styles.frame, { borderRadius: layer.cornerRadius * ps }]}
        >
          <Image
            source={{ uri: layer.photo.uri }}
            style={{
              position: "absolute",
              left: inner.left,
              top: inner.top,
              width: inner.width,
              height: inner.height,
            }}
            contentFit="fill"
          />
        </View>
      </View>
    );
  },
);
StaticImageLayer.displayName = "StaticImageLayer";

export const StaticTextLayer = memo<{
  layer: TextLayer;
  ps: number;
  provider: SkTypefaceFontProvider | null;
}>(({ layer, ps, provider }) => {
  const paragraph = useMemo(
    () => (provider ? buildParagraph(layer, provider) : null),
    [provider, layer],
  );
  const textHeight = paragraph
    ? paragraph.getHeight()
    : estimatedTextHeight(layer);
  const box = textLayerBox(layer, textHeight);
  const width = box.width * ps;
  const height = box.height * ps;
  // Same ink-bleed treatment as the editable TextLayerView
  const bleed = textBleedFor(layer);
  const bleedPx = bleed * ps;
  return (
    <View
      style={[
        layerStyle(layer.transform, ps, width, height),
        { opacity: layer.opacity },
      ]}
      pointerEvents="none"
    >
      <Canvas
        style={{
          position: "absolute",
          left: -bleedPx,
          top: -bleedPx,
          width: width + bleedPx * 2,
          height: height + bleedPx * 2,
        }}
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
    </View>
  );
});
StaticTextLayer.displayName = "StaticTextLayer";

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    overflow: "hidden",
  },
});
