/**
 * Memo Create Studio — background tool panel content.
 *
 * Solids (v1's five plus muted tones) and a curated set of 2-stop
 * gradients. A gradient spans the whole strip, so on a multi-page export
 * the hue shifts across the swipe — the SCRL signature. Swatch vocabulary
 * matches the app's 34pt circles.
 */

import React, { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import type { Background } from "../../engine/document";

export const BACKGROUND_COLORS = [
  "#FFFFFF",
  "#000000",
  "#F2F2F7",
  "#FAF6EF",
  "#101828",
  "#E8E3DA",
  "#D9CFC1",
  "#C9D3C9",
  "#BFCBD6",
  "#D8C9CE",
  "#8E8E93",
  "#3A3A3C",
];

/** Slight diagonal so single pages read as designed, not just tinted. */
const GRADIENT_ANGLE = 18;

export const GRADIENT_PRESETS: { id: string; from: string; to: string }[] = [
  { id: "dawn", from: "#FFD9C0", to: "#F2A9B8" },
  { id: "dusk", from: "#5C5F9E", to: "#8F5E90" },
  { id: "sea", from: "#8FD0D2", to: "#22577A" },
  { id: "sand", from: "#FAF6EF", to: "#D9BFA0" },
  { id: "forest", from: "#C2D3BA", to: "#3F5D50" },
  { id: "mono", from: "#FFFFFF", to: "#D8D8DE" },
  { id: "ink", from: "#1D2939", to: "#000000" },
  { id: "blush", from: "#FFF7F2", to: "#F2C6CF" },
];

interface BackgroundPanelProps {
  background: Background;
  onPick: (background: Background) => void;
}

export const BackgroundPanel = memo<BackgroundPanelProps>(
  ({ background, onPick }) => {
    const activeColor = background.type === "solid" ? background.color : null;
    const activeGradient =
      background.type === "gradient"
        ? GRADIENT_PRESETS.find(
            (preset) =>
              preset.from === background.from && preset.to === background.to,
          )?.id
        : null;

    const pick = (next: Background) => {
      Haptics.selectionAsync().catch(() => {});
      onPick(next);
    };

    return (
      <View style={styles.container}>
        <Text style={styles.label}>Color</Text>
        <View style={styles.swatchGrid}>
          {BACKGROUND_COLORS.map((color) => {
            const active = color === activeColor;
            return (
              <Pressable
                key={color}
                onPress={() => pick({ type: "solid", color })}
                style={[
                  styles.swatch,
                  { backgroundColor: color },
                  active && styles.swatchActive,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Background ${color}`}
              />
            );
          })}
        </View>

        <Text style={styles.label}>Gradient</Text>
        <View style={styles.swatchGrid}>
          {GRADIENT_PRESETS.map(({ id, from, to }) => {
            const active = id === activeGradient;
            return (
              <Pressable
                key={id}
                onPress={() =>
                  pick({ type: "gradient", from, to, angle: GRADIENT_ANGLE })
                }
                style={[styles.swatchWrap, active && styles.swatchActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Gradient ${id}`}
              >
                <LinearGradient
                  colors={[from, to]}
                  start={{ x: 0, y: 0.2 }}
                  end={{ x: 1, y: 0.8 }}
                  style={styles.gradientSwatch}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  },
);
BackgroundPanel.displayName = "BackgroundPanel";

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  label: {
    marginTop: 6,
    marginBottom: 10,
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  swatchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 6,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.2)",
  },
  swatchWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.2)",
  },
  gradientSwatch: {
    flex: 1,
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: "#000",
  },
});
