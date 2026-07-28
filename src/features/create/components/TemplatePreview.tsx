/**
 * Memo Create — mini template preview.
 *
 * Draws a template's slots as gray blocks (or the project's actual photos)
 * from the SAME unit rects the editor and exporter use, so what the tile
 * promises is what the canvas builds.
 */

import React, { memo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { Image } from "expo-image";

import { slotRects, templateById } from "../templates";
import type { SlotPhoto } from "../store/createProjectsStore";

interface TemplatePreviewProps {
  templateId: string;
  width: number;
  height: number;
  /** Photos by slot index — omitted slots draw as placeholder blocks. */
  slots?: (SlotPhoto | null)[];
  gap?: number;
  cornerRadius?: number;
  background?: string;
  style?: ViewStyle;
}

export const TemplatePreview = memo<TemplatePreviewProps>(
  ({
    templateId,
    width,
    height,
    slots,
    gap = 3,
    cornerRadius = 2,
    background = "#FFFFFF",
    style,
  }) => {
    const template = templateById(templateId);
    const rects = slotRects(template, width, height, gap);

    return (
      <View
        style={[
          styles.canvas,
          { width, height, backgroundColor: background },
          style,
        ]}
        pointerEvents="none"
      >
        {rects.map((rect, i) => {
          const photo = slots?.[i] ?? null;
          return (
            <View
              key={i}
              style={[
                styles.slot,
                {
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                  borderRadius: cornerRadius,
                },
              ]}
            >
              {photo && (
                <Image
                  source={{ uri: photo.uri }}
                  style={styles.slotImage}
                  contentFit="cover"
                  transition={0}
                />
              )}
            </View>
          );
        })}
      </View>
    );
  },
);
TemplatePreview.displayName = "TemplatePreview";

const styles = StyleSheet.create({
  canvas: {
    borderRadius: 8,
    overflow: "hidden",
  },
  slot: {
    position: "absolute",
    overflow: "hidden",
    backgroundColor: "#E5E5EA",
  },
  slotImage: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default TemplatePreview;
