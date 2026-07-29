/**
 * Shared pieces of the phone (SMS OTP) auth flow screens: the dark visual
 * language (matching the video login screen), the top back bar, and the
 * phone-number helpers. Each step is its own routed screen under /phone —
 * navigation transitions come from the native stack, entrance staggering
 * from reanimated `entering` animations inside each screen.
 */

import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

export const RESEND_COOLDOWN_S = 30;
export const CODE_LENGTH = 6;

/** Loose client-side E.164 check; the server re-validates strictly. */
export const normalizePhone = (input: string): string | null => {
  let phone = input.trim().replace(/[\s\-().]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : null;
};

/** "+46701234567" → "+46 70 123 45 67"-ish readable grouping. */
export const prettyPhone = (phone: string): string => {
  const digits = phone.slice(1);
  const groups: string[] = [digits.slice(0, 2)];
  for (let i = 2; i < digits.length; i += 3) {
    groups.push(digits.slice(i, i + 3));
  }
  return `+${groups.filter(Boolean).join(" ")}`;
};

/** Chevron back button seated in the top bar. */
export const FlowBackButton: React.FC<{ disabled?: boolean }> = ({
  disabled,
}) => {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.back()}
      disabled={disabled}
      style={flowStyles.backButton}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Ionicons name="chevron-back" size={26} color="#fff" />
    </Pressable>
  );
};

/** Visual language shared by the three phone-flow screens. */
export const flowStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#9a9aa0",
    marginTop: 8,
  },
  input: {
    marginTop: 28,
    backgroundColor: "#1c1c1e",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 20,
    color: "#fff",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputFocused: {
    borderColor: "rgba(255,255,255,0.35)",
  },
  hint: {
    fontSize: 13,
    color: "#6e6e73",
    marginTop: 10,
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: "#fff",
    borderRadius: 14,
    height: 54,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.35,
  },
  primaryButtonText: {
    fontSize: 17,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#000",
  },
  error: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 19,
    color: "#ff6b6b",
  },
});
