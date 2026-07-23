/**
 * DeleteConfirmSheet
 * Destructive confirmation for deleting an album photo, rendered INSIDE
 * the fullscreen viewer's modal (a root-level popup would stack beneath
 * it). Same sheet chrome as the comments/tags sheets, sized to content.
 */

import React, { useCallback } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import SocialBottomSheet from "./SocialBottomSheet";

export type DeleteConfirmSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Confirmed — the sheet closes itself first, then this fires. */
  onConfirm: () => void;
  busy?: boolean;
};

export const DeleteConfirmSheet: React.FC<DeleteConfirmSheetProps> = ({
  visible,
  onClose,
  onConfirm,
  busy = false,
}) => {
  const handleConfirm = useCallback(() => {
    if (busy) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onConfirm();
  }, [busy, onConfirm]);

  return (
    <SocialBottomSheet
      visible={visible}
      onClose={onClose}
      title="Delete photo?"
      heightFraction={0.34}
    >
      <View style={styles.body}>
        <View style={styles.iconWell}>
          <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
        </View>
        <Text style={styles.message}>
          It will be removed from the album for everyone. This can't be
          undone.
        </Text>
        <Pressable
          onPress={handleConfirm}
          disabled={busy}
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && styles.deleteButtonPressed,
            busy && styles.deleteButtonBusy,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Delete photo"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.deleteLabel}>Delete photo</Text>
          )}
        </Pressable>
        <Pressable
          onPress={onClose}
          disabled={busy}
          style={({ pressed }) => [
            styles.cancelButton,
            pressed && styles.cancelPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </SocialBottomSheet>
  );
};

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    alignItems: "center",
    gap: 14,
  },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 107, 107, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 280,
  },
  deleteButton: {
    alignSelf: "stretch",
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E5484D",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonPressed: {
    backgroundColor: "#C93A3F",
  },
  deleteButtonBusy: {
    opacity: 0.7,
  },
  deleteLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  cancelButton: {
    alignSelf: "stretch",
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelPressed: {
    opacity: 0.6,
  },
  cancelLabel: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 15,
    fontWeight: "600",
  },
});

export default DeleteConfirmSheet;
