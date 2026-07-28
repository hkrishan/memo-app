/**
 * DualLayoutGlyph Component
 * A miniature of the dual-camera layout it represents: a phone-shaped
 * frame split top/bottom, split left/right, or carrying a small inset
 * circle.
 *
 * Drawn rather than pulled from an icon font on purpose — the glyph IS the
 * layout, so it stays exactly in sync with what the compositor produces
 * and needs no legend. The same glyph marks the current mode in the
 * toolbar and the options in the picker.
 */

import React from "react";
import { StyleSheet, View } from "react-native";

import type { DualCameraLayout } from "../../../../modules/dual-camera";

interface DualLayoutGlyphProps {
  layout: DualCameraLayout;
  color: string;
  /** Height of the frame in px; width follows the phone-ish 3:4 ratio. */
  size?: number;
}

export const DualLayoutGlyph: React.FC<DualLayoutGlyphProps> = ({
  layout,
  color,
  size = 22,
}) => {
  const height = size;
  const width = size * 0.78;
  const stroke = Math.max(1.5, size * 0.09);
  const inset = size * 0.34;

  return (
    <View
      style={{
        width,
        height,
        borderRadius: size * 0.24,
        borderWidth: stroke,
        borderColor: color,
        overflow: "hidden",
      }}
    >
      {layout === "vertical" && (
        <View
          style={[
            styles.absolute,
            {
              left: 0,
              right: 0,
              top: height / 2 - stroke,
              height: stroke,
              backgroundColor: color,
            },
          ]}
        />
      )}

      {layout === "horizontal" && (
        <View
          style={[
            styles.absolute,
            {
              top: 0,
              bottom: 0,
              left: width / 2 - stroke,
              width: stroke,
              backgroundColor: color,
            },
          ]}
        />
      )}

      {layout === "pip" && (
        <View
          style={[
            styles.absolute,
            {
              width: inset,
              height: inset,
              borderRadius: inset / 2,
              backgroundColor: color,
              right: size * 0.08,
              bottom: size * 0.08,
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  absolute: {
    position: "absolute",
  },
});

export default DualLayoutGlyph;
