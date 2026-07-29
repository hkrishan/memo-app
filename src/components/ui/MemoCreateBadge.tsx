/**
 * Corner badge marking a photo as a Memo Create creation — the UI-side
 * stamp (the exported image itself stays clean). Rendered by MediaTile on
 * any grid/strip when the photo's id is in the created-covers registry.
 */

import React, { memo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";

interface MemoCreateBadgeProps {
  /** Show the stacked-pages glyph too (the cover represents a carousel). */
  multi?: boolean;
  style?: ViewStyle;
}

export const MemoCreateBadge = memo<MemoCreateBadgeProps>(
  ({ multi = false, style }) => (
    <View style={[styles.badge, style]} pointerEvents="none">
      <Ionicons name="color-wand" size={9} color="#fff" />
      <Text style={styles.text}>Memo Create</Text>
      {multi && <Ionicons name="albums" size={9} color="#fff" />}
    </View>
  ),
);
MemoCreateBadge.displayName = "MemoCreateBadge";

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 17,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  text: {
    fontSize: 8,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.2,
  },
});

export default MemoCreateBadge;
