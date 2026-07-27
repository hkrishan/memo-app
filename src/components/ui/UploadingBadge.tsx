/**
 * Corner chip marking a photo tile whose upload is still in flight — a
 * spinner while it transfers, a cloud-off glyph once it failed and is
 * waiting on the queue's automatic retry.
 *
 * Positioned by the tile (absolute, top-right by convention); it never
 * takes touches, so the tile stays fully pressable.
 */

import React, { memo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const SIZE = 22;

interface UploadingBadgeProps {
  /** Upload failed — awaiting the queue's backoff retry. */
  failed?: boolean;
  /** Extra positioning (top/right offsets differ per grid). */
  style?: object;
}

const UploadingBadge = memo<UploadingBadgeProps>(({ failed, style }) => (
  <View
    style={[styles.badge, style]}
    pointerEvents="none"
    accessibilityLabel={failed ? "Upload failed, will retry" : "Uploading"}
  >
    {failed ? (
      <Ionicons name="cloud-offline" size={12} color="#fff" />
    ) : (
      // The small indicator is ~20pt — scaled down so it sits inside the
      // chip with breathing room
      <ActivityIndicator size="small" color="#fff" style={styles.spinner} />
    )}
  </View>
));
UploadingBadge.displayName = "UploadingBadge";

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 5,
    right: 5,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    transform: [{ scale: 0.7 }],
  },
});

export default UploadingBadge;
