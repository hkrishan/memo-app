/**
 * Create form for a Daily Drop moment: friendly steppers for the run
 * length, drops per day, the daily surprise window and the response
 * window. Rendered inside the dark bottom sheet.
 */

import React, { useCallback, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { notify } from "@/components/global";
import { useCreateMomentMutation } from "../api/moments.queries";
import { DailyDropConfig } from "../types/moment.types";
import { MomentCreateFormProps } from "../registry/registry.types";
import { formatHour } from "../utils/time";
import { SheetRow, SheetStepper, SheetSubmitButton } from "./sheetControls";

const DailyDropCreateForm: React.FC<MomentCreateFormProps> = ({
  albumId,
  onClose,
}) => {
  const [title, setTitle] = useState("");
  const [days, setDays] = useState(7);
  const [dropsPerDay, setDropsPerDay] = useState(1);
  const [windowStartHour, setWindowStartHour] = useState(9);
  const [windowEndHour, setWindowEndHour] = useState(22);
  const [responseWindowMinutes, setResponseWindowMinutes] = useState(10);

  const createMutation = useCreateMomentMutation();

  const handleCreate = useCallback(() => {
    const config: DailyDropConfig = {
      days,
      dropsPerDay,
      windowStartHour,
      windowEndHour,
      responseWindowMinutes,
    };
    createMutation.mutate(
      {
        albumId,
        input: {
          type: "daily_drop",
          title: title.trim() || undefined,
          config,
        },
      },
      {
        onSuccess: () => {
          notify.success("Daily Drop started", "The first drop is a surprise");
          onClose();
        },
        onError: () => {
          notify.error("Couldn't start the moment", "Please try again.");
        },
      },
    );
  }, [
    albumId,
    title,
    days,
    dropsPerDay,
    windowStartHour,
    windowEndHour,
    responseWindowMinutes,
    createMutation,
    onClose,
  ]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.titleInput}
        value={title}
        onChangeText={setTitle}
        placeholder="Title (optional)"
        placeholderTextColor="rgba(255, 255, 255, 0.4)"
        maxLength={60}
        returnKeyType="done"
      />

      <SheetRow label="Days" hint="How long the game runs">
        <SheetStepper value={days} min={1} max={30} onChange={setDays} />
      </SheetRow>

      <SheetRow label="Drops per day" hint="Surprise pings each day">
        <SheetStepper
          value={dropsPerDay}
          min={1}
          max={5}
          onChange={setDropsPerDay}
        />
      </SheetRow>

      <SheetRow label="Earliest drop" hint="Drops never fire before this">
        <SheetStepper
          value={windowStartHour}
          display={formatHour(windowStartHour)}
          min={0}
          max={windowEndHour - 1}
          onChange={setWindowStartHour}
        />
      </SheetRow>

      <SheetRow label="Latest drop" hint="…or after this">
        <SheetStepper
          value={windowEndHour}
          display={formatHour(windowEndHour)}
          min={windowStartHour + 1}
          max={23}
          onChange={setWindowEndHour}
        />
      </SheetRow>

      <SheetRow label="Time to post" hint="After a drop fires">
        <SheetStepper
          value={responseWindowMinutes}
          display={`${responseWindowMinutes} min`}
          min={5}
          max={60}
          step={5}
          onChange={setResponseWindowMinutes}
        />
      </SheetRow>

      <SheetSubmitButton
        label="Start Daily Drop"
        pending={createMutation.isPending}
        onPress={handleCreate}
      />

      <Text style={styles.footnote}>
        Everyone in the album gets pinged when a drop fires — then the clock
        is on.
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
  titleInput: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 15,
    marginBottom: 8,
  },
  footnote: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 17,
  },
});

export default DailyDropCreateForm;
