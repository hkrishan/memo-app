/**
 * EmptyState — the app's one empty/error-state layout: icon in a soft
 * circle, title, optional subtitle, optional CTA. 27 files hand-rolled
 * this exact structure with drifting sizes and grays; new/migrated
 * screens use this instead.
 */

import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { color, radius } from "@/lib/tokens";

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /** Primary action — every empty state should offer the obvious next
   *  step (create, retry, find…) rather than a dead end. */
  actionLabel?: string;
  onAction?: () => void;
  /** Render on a dark surface (viewer/camera contexts). */
  dark?: boolean;
}

export const EmptyState = memo<EmptyStateProps>(
  ({ icon, title, subtitle, actionLabel, onAction, dark = false }) => (
    <View style={styles.container}>
      <View style={[styles.iconWrap, dark && styles.iconWrapDark]}>
        <Ionicons
          name={icon}
          size={28}
          color={dark ? color.onDarkSecondary : color.textTertiary}
        />
      </View>
      <Text style={[styles.title, dark && styles.titleDark]}>{title}</Text>
      {subtitle != null && (
        <Text style={[styles.subtitle, dark && styles.subtitleDark]}>
          {subtitle}
        </Text>
      )}
      {actionLabel != null && onAction != null && (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            styles.cta,
            dark && styles.ctaDark,
            pressed && styles.ctaPressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaLabel, dark && styles.ctaLabelDark]}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  ),
);
EmptyState.displayName = "EmptyState";

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingHorizontal: 48,
    paddingVertical: 40,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.surface1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  iconWrapDark: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  title: {
    fontSize: 17,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: color.textPrimary,
    textAlign: "center",
  },
  titleDark: {
    color: color.onDarkPrimary,
  },
  subtitle: {
    fontFamily: "InstrumentSans_400Regular",
    fontWeight: "400",
    fontSize: 14,
    lineHeight: 20,
    color: color.textSecondary,
    textAlign: "center",
    marginTop: 6,
  },
  subtitleDark: {
    color: color.onDarkSecondary,
  },
  cta: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: color.textPrimary,
  },
  ctaDark: {
    backgroundColor: "#fff",
  },
  ctaPressed: {
    opacity: 0.7,
  },
  ctaLabel: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  ctaLabelDark: {
    color: "#111",
  },
});

export default EmptyState;
