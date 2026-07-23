/**
 * Phone flow, step 2 — the 6-digit code. Six boxes driven by one hidden
 * input (native SMS autofill via oneTimeCode/sms-otp lands there),
 * auto-submit on the sixth digit, shake + clear on a wrong code, resend
 * with a countdown. Success routes by account age: existing users go
 * straight into the app; brand-new accounts continue to the name screen
 * (replace, so back can't return to a used code).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import useAuth, { sanitizeRedirect } from "../../hooks/useAuth";
import {
  CODE_LENGTH,
  FlowBackButton,
  flowStyles,
  prettyPhone,
  RESEND_COOLDOWN_S,
} from "./phoneFlowShared";

const PhoneCodeScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // phone arrives as digits without the "+" (URL-safe); re-prefix here
  const { phone: phoneParam, redirect } = useLocalSearchParams<{
    phone: string;
    redirect?: string;
  }>();
  const sentPhone = `+${phoneParam ?? ""}`;
  const { requestSmsCode, loginWithPhone } = useAuth();

  const [code, setCode] = useState("");
  const [pending, setPending] = useState<"verify" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The previous screen just sent a code — start the cooldown immediately
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_S);

  const inputRef = useRef<TextInput>(null);
  // Guards double-fire: autofill can deliver all six digits in one change
  const verifyingRef = useRef(false);

  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 450);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setInterval(
      () => setResendIn((s) => (s > 0 ? s - 1 : 0)),
      1000,
    );
    return () => clearInterval(timer);
  }, [resendIn > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = useCallback(
    async (fullCode: string) => {
      if (verifyingRef.current) return;
      verifyingRef.current = true;
      setError(null);
      setPending("verify");
      try {
        const response = await loginWithPhone(sentPhone, fullCode, {
          skipNavigation: true,
        });
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        if (response.isNewUser) {
          router.replace({
            pathname: "/phone/name",
            params: redirect ? { redirect } : {},
          });
        } else {
          router.replace(sanitizeRedirect(redirect) ?? "/(app)");
        }
      } catch (err: any) {
        verifyingRef.current = false;
        setPending(null);
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error,
        ).catch(() => {});
        shakeX.value = withSequence(
          withTiming(-10, { duration: 45 }),
          withTiming(8, { duration: 45 }),
          withTiming(-5, { duration: 45 }),
          withTiming(0, { duration: 45 }),
        );
        setCode("");
        setError(err?.message || "That code isn't right. Try again.");
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [sentPhone, redirect, loginWithPhone, router, shakeX],
  );

  const handleCodeChange = useCallback(
    (value: string) => {
      const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
      setCode(digits);
      if (error) setError(null);
      if (digits.length === CODE_LENGTH) {
        void handleVerify(digits);
      }
    },
    [error, handleVerify],
  );

  const handleResend = useCallback(async () => {
    if (pending || resendIn > 0) return;
    setError(null);
    setPending("resend");
    try {
      await requestSmsCode(sentPhone);
      Haptics.selectionAsync().catch(() => {});
      setResendIn(RESEND_COOLDOWN_S);
      setCode("");
      verifyingRef.current = false;
      inputRef.current?.focus();
    } catch (err: any) {
      setError(err?.message || "Couldn't resend the code. Try again.");
    } finally {
      setPending(null);
    }
  }, [pending, resendIn, sentPhone, requestSmsCode]);

  const cells = [];
  for (let i = 0; i < CODE_LENGTH; i++) {
    const digit = code[i];
    const isActive = i === code.length && pending !== "verify";
    cells.push(
      <View
        key={i}
        style={[
          styles.codeCell,
          isActive && styles.codeCellActive,
          error != null && styles.codeCellError,
        ]}
      >
        <Text style={styles.codeDigit}>{digit ?? ""}</Text>
        {isActive && <View style={styles.codeCaret} />}
      </View>,
    );
  }

  return (
    <View style={[flowStyles.container, { paddingTop: insets.top }]}>
      <View style={flowStyles.topBar}>
        <FlowBackButton disabled={pending === "verify"} />
      </View>
      <KeyboardAvoidingView
        style={flowStyles.content}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View entering={FadeInDown.duration(300)}>
          <Text style={flowStyles.title}>Enter the code</Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(300).delay(60)}>
          <Text style={flowStyles.subtitle}>
            Sent to {prettyPhone(sentPhone)} —{" "}
            <Text
              style={styles.changeLink}
              onPress={() => {
                if (pending !== "verify") router.back();
              }}
            >
              change
            </Text>
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(300).delay(120)}
          style={[styles.codeRow, shakeStyle]}
        >
          {cells}
          {/* Hidden input drives the boxes; SMS autofill lands here */}
          <TextInput
            ref={inputRef}
            style={styles.codeHiddenInput}
            value={code}
            onChangeText={handleCodeChange}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            editable={pending !== "verify"}
            maxLength={CODE_LENGTH}
            caretHidden
          />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(300).delay(180)}
          style={styles.footer}
        >
          {pending === "verify" ? (
            <View style={styles.verifyingRow}>
              <ActivityIndicator size={14} color="#fff" />
              <Text style={styles.verifyingText}>Verifying…</Text>
            </View>
          ) : resendIn > 0 ? (
            <Text style={styles.resendCountdown}>
              Resend code in {resendIn}s
            </Text>
          ) : (
            <Pressable onPress={handleResend} hitSlop={8}>
              {pending === "resend" ? (
                <ActivityIndicator size={14} color="#fff" />
              ) : (
                <Text style={styles.resendLink}>Resend code</Text>
              )}
            </Pressable>
          )}
        </Animated.View>

        {error && <Text style={flowStyles.error}>{error}</Text>}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  changeLink: {
    color: "#fff",
    fontWeight: "700",
  },
  codeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 32,
  },
  codeCell: {
    flex: 1,
    maxWidth: 56,
    aspectRatio: 0.8,
    borderRadius: 14,
    backgroundColor: "#1c1c1e",
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  codeCellActive: {
    borderColor: "rgba(255,255,255,0.6)",
  },
  codeCellError: {
    borderColor: "#ff6b6b",
  },
  codeDigit: {
    fontSize: 26,
    fontWeight: "700",
    color: "#fff",
    fontVariant: ["tabular-nums"],
  },
  codeCaret: {
    position: "absolute",
    bottom: 12,
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#fff",
    opacity: 0.7,
  },
  codeHiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.01,
  },
  footer: {
    marginTop: 28,
    minHeight: 24,
  },
  verifyingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  verifyingText: {
    fontSize: 15,
    color: "#fff",
  },
  resendCountdown: {
    fontSize: 15,
    color: "#6e6e73",
    fontVariant: ["tabular-nums"],
  },
  resendLink: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});

export default PhoneCodeScreen;
