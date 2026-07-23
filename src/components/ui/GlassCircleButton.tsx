/**
 * GlassCircleButton — liquid-glass circular action button.
 * Live blur of what's beneath, a frost layer, a specular top sheen, a
 * bright rim, and soft depth; the icon floats on glass. Android's
 * BlurView falls back to a translucent tint — frost/sheen/rim still
 * carry the look. `tint="dark"` renders smoked glass for dark surfaces.
 */

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

interface GlassCircleButtonProps {
  onPress: () => void;
  label: string;
  size?: number;
  tint?: "light" | "dark";
  children: React.ReactNode;
}

export const GlassCircleButton: React.FC<GlassCircleButtonProps> = ({
  onPress,
  label,
  size = 34,
  tint = "light",
  children,
}) => {
  const radius = size / 2;
  const dark = tint === "dark";
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: radius },
        pressed && styles.buttonPressed,
      ]}
    >
      <View style={[styles.clip, { borderRadius: radius }]}>
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={45}
          tint={tint}
        />
        <View
          style={[
            styles.frost,
            dark ? styles.frostDark : styles.frostLight,
          ]}
        />
        <LinearGradient
          colors={
            dark
              ? ["rgba(255, 255, 255, 0.22)", "rgba(255, 255, 255, 0.02)"]
              : ["rgba(255, 255, 255, 0.65)", "rgba(255, 255, 255, 0.04)"]
          }
          style={styles.sheen}
          pointerEvents="none"
        />
      </View>
      <View
        style={[
          styles.rim,
          { borderRadius: radius },
          dark ? styles.rimDark : styles.rimLight,
        ]}
        pointerEvents="none"
      />
      {children}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    // Depth lives OUT here — the clip below would swallow a shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonPressed: {
    transform: [{ scale: 0.94 }],
  },
  clip: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  frost: {
    ...StyleSheet.absoluteFillObject,
  },
  frostLight: {
    backgroundColor: "rgba(255, 255, 255, 0.28)",
  },
  frostDark: {
    backgroundColor: "rgba(25, 25, 28, 0.32)",
  },
  sheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "55%",
  },
  rim: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rimLight: {
    borderColor: "rgba(255, 255, 255, 0.85)",
  },
  rimDark: {
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
});

export default GlassCircleButton;
