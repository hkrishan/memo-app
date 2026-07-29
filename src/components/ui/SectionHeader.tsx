/**
 * SectionHeader — the one overline-style section label (SETTINGS,
 * MEMBERS, …). Six drifting treatments existed (three casings, four
 * grays); this is the canonical one.
 */

import React, { memo } from "react";
import { StyleSheet, Text } from "react-native";

import { color, screenH, type } from "@/lib/tokens";

export const SectionHeader = memo<{ title: string }>(({ title }) => (
  <Text style={styles.label}>{title}</Text>
));
SectionHeader.displayName = "SectionHeader";

const styles = StyleSheet.create({
  label: {
    ...type.overline,
    color: color.textTertiary,
    marginHorizontal: screenH,
    marginTop: 28,
    marginBottom: 8,
  },
});

export default SectionHeader;
