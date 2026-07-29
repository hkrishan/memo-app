/**
 * Memo Create Studio — selected-photo style panel.
 *
 * Corner radius and opacity for one image layer, in the app's pill/step
 * vocabulary. Values are doc px (radius) and 0..1 (opacity), applied
 * identically by the live canvas and the exporter.
 */

import React, { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import * as Haptics from "expo-haptics";

import type { ImageLayer } from "../../engine/document";

/** Doc px ≈ 0 / 4 / 8 / 14 / 22 / 40 preview pt. */
const RADIUS_STEPS = [0, 12, 24, 42, 66, 120];
const OPACITY_STEPS = [1, 0.75, 0.5, 0.25];

interface LayerStylePanelProps {
  layer: ImageLayer;
  onChange: (
    patch: Partial<Pick<ImageLayer, "cornerRadius" | "opacity">>,
  ) => void;
}

export const LayerStylePanel = memo<LayerStylePanelProps>(
  ({ layer, onChange }) => {
    const pick = (patch: Parameters<typeof onChange>[0]) => {
      Haptics.selectionAsync().catch(() => {});
      onChange(patch);
    };

    return (
      <View style={styles.container}>
        <Text style={styles.label}>Corners</Text>
        <View style={styles.row}>
          {RADIUS_STEPS.map((radius) => {
            const active = radius === layer.cornerRadius;
            return (
              <Pressable
                key={radius}
                onPress={() => pick({ cornerRadius: radius })}
                style={[styles.step, active && styles.stepActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View
                  style={[
                    styles.radiusGlyph,
                    { borderTopLeftRadius: Math.min(radius / 8, 14) },
                    active && styles.radiusGlyphActive,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Opacity</Text>
        <View style={styles.row}>
          {OPACITY_STEPS.map((opacity) => {
            const active = Math.abs(opacity - layer.opacity) < 0.01;
            return (
              <Pressable
                key={opacity}
                onPress={() => pick({ opacity })}
                style={[styles.step, active && styles.stepActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[styles.stepText, active && styles.stepTextActive]}
                >
                  {Math.round(opacity * 100)}%
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  },
);
LayerStylePanel.displayName = "LayerStylePanel";

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  label: {
    marginTop: 6,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  step: {
    minWidth: 48,
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 10,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  stepActive: {
    backgroundColor: "#000",
  },
  stepText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3C3C43",
    fontVariant: ["tabular-nums"],
  },
  stepTextActive: {
    color: "#fff",
  },
  radiusGlyph: {
    width: 18,
    height: 18,
    borderTopLeftRadius: 0,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: "#3C3C43",
  },
  radiusGlyphActive: {
    borderColor: "#fff",
  },
});
