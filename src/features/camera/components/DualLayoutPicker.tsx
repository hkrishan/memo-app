/**
 * DualLayoutPicker Component
 * Floating card for choosing how the two cameras are arranged.
 *
 * Stays open after a choice so the three layouts can be compared against
 * the live preview underneath — that's the whole point of picking one.
 * Tapping anywhere else closes it.
 */

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Text } from "react-native-paper";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";

import type { DualCameraLayout } from "../../../../modules/dual-camera";
import { DUAL_LAYOUTS, DUAL_LAYOUT_LABELS, CAMERA_UI_CONFIG } from "../constants";
import { DualLayoutGlyph } from "./DualLayoutGlyph";

const { COLORS } = CAMERA_UI_CONFIG;

interface DualLayoutPickerProps {
  visible: boolean;
  layout: DualCameraLayout;
  onSelect: (layout: DualCameraLayout) => void;
  onDismiss: () => void;
  /** Vertical placement, so the card clears the screen's own chrome. */
  top: number;
}

export const DualLayoutPicker: React.FC<DualLayoutPickerProps> = ({
  visible,
  layout,
  onSelect,
  onDismiss,
  top,
}) => {
  if (!visible) return null;

  const handleSelect = (next: DualCameraLayout) => {
    if (next === layout) return;
    Haptics.selectionAsync();
    onSelect(next);
  };

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel="Close layout picker"
    >
      <Animated.View
        entering={FadeIn.duration(140)}
        exiting={FadeOut.duration(110)}
        style={[styles.container, { top }]}
        pointerEvents="box-none"
      >
        {/* Taps inside the card must not reach the dismiss layer */}
        <Pressable onPress={() => {}} style={styles.card}>
          <BlurView
            intensity={40}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.cardContent}>
            <Text style={styles.title}>Dual camera</Text>
            <Text style={styles.subtitle}>{DUAL_LAYOUT_LABELS[layout]}</Text>

            <View style={styles.options}>
              {DUAL_LAYOUTS.map((option) => {
                const active = option === layout;
                return (
                  <Pressable
                    key={option}
                    onPress={() => handleSelect(option)}
                    style={[styles.option, active && styles.optionActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={DUAL_LAYOUT_LABELS[option]}
                  >
                    <DualLayoutGlyph
                      layout={option}
                      color={active ? "#000" : COLORS.TEXT}
                      size={22}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>

        <Text style={styles.hint}>Tap anywhere to close</Text>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  card: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(28, 28, 30, 0.55)",
  },
  cardContent: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 14,
    alignItems: "center",
  },
  title: {
    color: COLORS.TEXT,
    fontSize: 17,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    lineHeight: 22,
  },
  subtitle: {
    color: COLORS.ACCENT,
    fontSize: 13,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 1,
  },
  options: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    padding: 4,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  option: {
    width: 46,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  optionActive: {
    backgroundColor: COLORS.ACCENT,
  },
  hint: {
    marginTop: 12,
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    fontFamily: "InstrumentSans_500Medium",
    fontWeight: "500",
  },
});

export default DualLayoutPicker;
