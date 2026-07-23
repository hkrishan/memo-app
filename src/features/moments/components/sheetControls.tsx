/**
 * Small form controls for the moment create forms, styled for the dark
 * SocialBottomSheet chrome (white text, translucent white surfaces).
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export const SheetRow: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <View style={styles.row}>
    <View style={styles.rowText}>
      <Text style={styles.rowLabel}>{label}</Text>
      {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
    </View>
    {children}
  </View>
);

export const SheetStepper: React.FC<{
  value: number;
  display?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
}> = ({ value, display, min, max, step = 1, onChange }) => {
  const decDisabled = value - step < min;
  const incDisabled = value + step > max;
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - step))}
        disabled={decDisabled}
        style={[styles.stepperButton, decDisabled && styles.stepperDisabled]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Decrease"
      >
        <Ionicons name="remove" size={18} color="#fff" />
      </Pressable>
      <Text style={styles.stepperValue}>{display ?? String(value)}</Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + step))}
        disabled={incDisabled}
        style={[styles.stepperButton, incDisabled && styles.stepperDisabled]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Increase"
      >
        <Ionicons name="add" size={18} color="#fff" />
      </Pressable>
    </View>
  );
};

export const SheetChip: React.FC<{
  label: string;
  selected: boolean;
  accentColor: string;
  onPress: () => void;
}> = ({ label, selected, accentColor, onPress }) => (
  <Pressable
    onPress={onPress}
    style={[
      styles.chip,
      selected && { backgroundColor: accentColor, borderColor: accentColor },
    ]}
    accessibilityRole="button"
    accessibilityState={{ selected }}
  >
    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
      {label}
    </Text>
  </Pressable>
);

export const SheetSubmitButton: React.FC<{
  label: string;
  disabled?: boolean;
  pending?: boolean;
  onPress: () => void;
}> = ({ label, disabled, pending, onPress }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled || pending}
    style={[styles.submit, (disabled || pending) && styles.submitDisabled]}
    accessibilityRole="button"
  >
    <Text style={styles.submitLabel}>{pending ? "Starting…" : label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
  },
  rowHint: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    marginTop: 2,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperDisabled: {
    opacity: 0.35,
  },
  stepperValue: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    minWidth: 58,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  chipLabel: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 13,
    fontWeight: "600",
  },
  chipLabelSelected: {
    color: "#fff",
  },
  submit: {
    marginTop: 18,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitLabel: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
});
