/**
 * DeleteConfirmSheet
 * Destructive options for an album photo, rendered INSIDE the fullscreen
 * viewer's modal (a root-level popup would stack beneath it):
 *   - "Remove from album" — the photo leaves this album only; the
 *     uploader's Memo-library copy stays.
 *   - "Delete photo" (uploader only) — delete everywhere: album copy AND
 *     the uploader's Memo-library copy.
 * Same sheet chrome as the comments/tags sheets, sized to content.
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
  onConfirm: (alsoLibrary: boolean) => void;
  /** Uploader sees the extra "delete everywhere" option. */
  isUploader?: boolean;
  busy?: boolean;
};

export const DeleteConfirmSheet: React.FC<DeleteConfirmSheetProps> = ({
  visible,
  onClose,
  onConfirm,
  isUploader = false,
  busy = false,
}) => {
  const handleRemove = useCallback(() => {
    if (busy) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onConfirm(false);
  }, [busy, onConfirm]);

  const handleDeleteEverywhere = useCallback(() => {
    if (busy) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onConfirm(true);
  }, [busy, onConfirm]);

  return (
    <SocialBottomSheet
      visible={visible}
      onClose={onClose}
      title="Remove photo?"
      heightFraction={isUploader ? 0.42 : 0.34}
    >
      <View style={styles.body}>
        <View style={styles.iconWell}>
          <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
        </View>
        <Text style={styles.message}>
          {isUploader
            ? "Remove it from this album only, or delete it everywhere — including your Memo photos."
            : "It will be removed from the album for everyone. This can't be undone."}
        </Text>
        <Pressable
          onPress={handleRemove}
          disabled={busy}
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && styles.deleteButtonPressed,
            busy && styles.deleteButtonBusy,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Remove from album"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.deleteLabel}>Remove from album</Text>
          )}
        </Pressable>
        {isUploader && (
          <Pressable
            onPress={handleDeleteEverywhere}
            disabled={busy}
            style={({ pressed }) => [
              styles.everywhereButton,
              pressed && styles.deleteButtonPressed,
              busy && styles.deleteButtonBusy,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Delete photo everywhere"
          >
            <Text style={styles.everywhereLabel}>
              Delete photo (also from My Photos)
            </Text>
          </Pressable>
        )}
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
  everywhereButton: {
    alignSelf: "stretch",
    height: 48,
    borderRadius: 24,
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: "#E5484D",
    alignItems: "center",
    justifyContent: "center",
  },
  everywhereLabel: {
    color: "#E5484D",
    fontSize: 15,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
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
    fontFamily: "InstrumentSans_700Bold",
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
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
});

export default DeleteConfirmSheet;
