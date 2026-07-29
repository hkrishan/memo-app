/**
 * ReportContentSheet
 * The app-wide "report this" flow: a reason picker (the 7 moderation
 * reasons) with an optional free-text details field and a submit button.
 * Built on SocialBottomSheet, which renders in its own transparent Modal —
 * so it stacks correctly above ANY surface, including the fullscreen photo
 * viewer's modal and pageSheet screens.
 *
 * Self-contained: give it a target and it reports it, confirming with a
 * native Alert (which always stacks above modals) on success.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import SocialBottomSheet from "@/features/album/components/photoSocial/SocialBottomSheet";
import { useReportContent } from "../api/moderation.queries";
import {
  REPORT_REASONS,
  ReportReason,
  ReportTarget,
} from "../types/moderation.types";

const MAX_DETAILS_LENGTH = 500;

export type ReportContentSheetProps = {
  visible: boolean;
  /**
   * What's being reported. The parent should RETAIN this through the close
   * animation (only clear it after `visible` goes false) so the sheet's
   * content doesn't blank out mid-dismiss.
   */
  target: ReportTarget | null;
  onClose: () => void;
};

export const ReportContentSheet: React.FC<ReportContentSheetProps> = ({
  visible,
  target,
  onClose,
}) => {
  const reportContent = useReportContent();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");

  // Fresh form every time the sheet opens
  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails("");
    }
  }, [visible]);

  const handleSelectReason = useCallback((value: ReportReason) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReason(value);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!target || !reason || reportContent.isPending) return;

    const trimmedDetails = details.trim();
    reportContent.mutate(
      {
        targetType: target.targetType,
        targetId: target.targetId,
        albumId: target.albumId,
        reason,
        details: trimmedDetails.length > 0 ? trimmedDetails : undefined,
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onClose();
          Alert.alert(
            "Thanks for reporting",
            "We'll review this within 24 hours.",
          );
        },
        onError: () => {
          // Native alert: visible even when the sheet sits above a modal
          Alert.alert("Couldn't send report", "Please try again");
        },
      },
    );
  }, [target, reason, details, reportContent, onClose]);

  return (
    <SocialBottomSheet
      visible={visible}
      onClose={onClose}
      title="Report"
      heightFraction={0.85}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.prompt}>Why are you reporting this?</Text>

        <View style={styles.reasonGroup}>
          {REPORT_REASONS.map((item, index) => {
            const selected = reason === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => handleSelectReason(item.value)}
                style={({ pressed }) => [
                  styles.reasonRow,
                  index > 0 && styles.reasonRowDivided,
                  pressed && styles.reasonRowPressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={item.label}
              >
                <Text
                  style={[
                    styles.reasonLabel,
                    selected && styles.reasonLabelSelected,
                  ]}
                >
                  {item.label}
                </Text>
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={selected ? "#fff" : "rgba(255, 255, 255, 0.4)"}
                />
              </Pressable>
            );
          })}
        </View>

        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder="Anything else we should know? (optional)"
          placeholderTextColor="rgba(255, 255, 255, 0.4)"
          style={styles.detailsInput}
          maxLength={MAX_DETAILS_LENGTH}
          multiline
          editable={!reportContent.isPending}
        />

        <Pressable
          onPress={handleSubmit}
          disabled={!reason || reportContent.isPending}
          style={({ pressed }) => [
            styles.submitButton,
            (!reason || reportContent.isPending) && styles.submitButtonDisabled,
            pressed && styles.submitButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Submit report"
        >
          {reportContent.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitLabel}>Submit report</Text>
          )}
        </Pressable>
      </ScrollView>
    </SocialBottomSheet>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 14,
  },
  prompt: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 14,
    textAlign: "center",
  },
  reasonGroup: {
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 14,
    overflow: "hidden",
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    minHeight: 44,
  },
  reasonRowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.12)",
  },
  reasonRowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  reasonLabel: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 15,
  },
  reasonLabelSelected: {
    color: "#fff",
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  detailsInput: {
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 64,
    color: "#fff",
    fontSize: 15,
    textAlignVertical: "top",
  },
  submitButton: {
    alignSelf: "stretch",
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E5484D",
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonPressed: {
    backgroundColor: "#C93A3F",
  },
  submitLabel: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
});

export default ReportContentSheet;
