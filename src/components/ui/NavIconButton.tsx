/**
 * NavIconButton — the app's one icon-only nav button (back, close, menu,
 * search…). Guarantees what 28 hand-rolled versions kept forgetting: a
 * ≥44pt hit area, a pressed state, hitSlop, and a required accessibility
 * label. The visual glyph stays compact; the touch target doesn't.
 */

import React, { memo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { color, size } from "@/lib/tokens";

interface NavIconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  /** Required — icon-only buttons are invisible to screen readers. */
  label: string;
  onPress: () => void;
  iconSize?: number;
  iconColor?: string;
  /** Soft circular backing (the frosted-circle look). */
  backed?: boolean;
  backingColor?: string;
}

export const NavIconButton = memo<NavIconButtonProps>(
  ({
    icon,
    label,
    onPress,
    iconSize = 24,
    iconColor = color.textPrimary,
    backed = false,
    backingColor = color.surface1,
  }) => (
    <Pressable
      onPress={onPress}
      hitSlop={size.hitSlop}
      style={({ pressed }) => [
        styles.button,
        backed && { backgroundColor: backingColor, borderRadius: 22 },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={iconSize} color={iconColor} />
    </Pressable>
  ),
);
NavIconButton.displayName = "NavIconButton";

const styles = StyleSheet.create({
  button: {
    width: size.touchMin,
    height: size.touchMin,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
});

export default NavIconButton;
