/**
 * Create form for a Challenge moment: a prompt plus a deadline picked
 * from quick chips (no native date picker). Rendered inside the dark
 * bottom sheet.
 */

import React, { useCallback, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { notify } from "@/components/global";
import { useCreateMomentMutation } from "../api/moments.queries";
import { ChallengeConfig } from "../types/moment.types";
import { MomentCreateFormProps } from "../registry/registry.types";
import { SheetChip, SheetSubmitButton } from "./sheetControls";

const ACCENT = "#5E5CE6";

type DeadlineChoice = "today" | "24h" | "3d" | "1w";

const DEADLINE_CHOICES: { key: DeadlineChoice; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "24h", label: "24h" },
  { key: "3d", label: "3 days" },
  { key: "1w", label: "1 week" },
];

/** Compute deadlineAt at submit time so chips stay honest while the sheet sits open */
const deadlineFor = (choice: DeadlineChoice): string => {
  const now = new Date();
  switch (choice) {
    case "today": {
      const end = new Date(now);
      end.setHours(23, 59, 0, 0);
      return end.toISOString();
    }
    case "24h":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    case "3d":
      return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    case "1w":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
};

const ChallengeCreateForm: React.FC<MomentCreateFormProps> = ({
  albumId,
  onClose,
}) => {
  const [prompt, setPrompt] = useState("");
  const [deadlineChoice, setDeadlineChoice] = useState<DeadlineChoice>("24h");

  const createMutation = useCreateMomentMutation();

  const handleCreate = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const config: ChallengeConfig = {
      prompt: trimmed,
      deadlineAt: deadlineFor(deadlineChoice),
    };
    createMutation.mutate(
      { albumId, input: { type: "challenge", config } },
      {
        onSuccess: () => {
          notify.success("Challenge is on", "May the best photo win");
          onClose();
        },
        onError: () => {
          notify.error("Couldn't start the challenge", "Please try again");
        },
      },
    );
  }, [albumId, prompt, deadlineChoice, createMutation, onClose]);

  return (
    <View style={styles.container}>
      <Text style={styles.fieldLabel}>Prompt</Text>
      <TextInput
        style={styles.promptInput}
        value={prompt}
        onChangeText={setPrompt}
        placeholder="e.g. Golden hour, worst parking job, best snack…"
        placeholderTextColor="rgba(255, 255, 255, 0.4)"
        multiline
        maxLength={140}
      />

      <Text style={styles.fieldLabel}>Deadline</Text>
      <View style={styles.chipRow}>
        {DEADLINE_CHOICES.map((choice) => (
          <SheetChip
            key={choice.key}
            label={choice.label}
            selected={deadlineChoice === choice.key}
            accentColor={ACCENT}
            onPress={() => setDeadlineChoice(choice.key)}
          />
        ))}
      </View>

      <SheetSubmitButton
        label="Start Challenge"
        disabled={prompt.trim().length === 0}
        pending={createMutation.isPending}
        onPress={handleCreate}
      />

      <Text style={styles.footnote}>
        Everyone can post one shot before the deadline. Photos are checked
        against the prompt.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  fieldLabel: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 6,
  },
  promptInput: {
    fontFamily: "InstrumentSans_400Regular",
    fontWeight: "400",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    color: "#fff",
    fontSize: 16,
    minHeight: 76,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  footnote: {
    fontFamily: "InstrumentSans_400Regular",
    fontWeight: "400",
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 17,
  },
});

export default ChallengeCreateForm;
