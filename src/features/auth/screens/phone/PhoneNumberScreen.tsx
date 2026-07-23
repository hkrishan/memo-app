/**
 * Phone flow, step 1 — enter the number. Sends the SMS code and pushes the
 * code screen. The number travels as digits WITHOUT the leading "+" (a "+"
 * in route params is a classic URL-encoding footgun) and is re-prefixed on
 * the other side.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import useAuth from "../../hooks/useAuth";
import {
  FlowBackButton,
  flowStyles,
  normalizePhone,
} from "./phoneFlowShared";

const PhoneNumberScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { requestSmsCode } = useAuth();

  const [phoneInput, setPhoneInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Focus once the push transition has settled so the keyboard rises
  // with the screen instead of jumping mid-slide
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 450);
    return () => clearTimeout(timer);
  }, []);

  const normalized = normalizePhone(phoneInput);

  const handleSendCode = async () => {
    if (!normalized || pending) return;
    setError(null);
    setPending(true);
    try {
      await requestSmsCode(normalized);
      Haptics.selectionAsync().catch(() => {});
      router.push({
        pathname: "/phone/code",
        params: {
          phone: normalized.slice(1),
          ...(redirect ? { redirect } : {}),
        },
      });
    } catch (err: any) {
      setError(err?.message || "Couldn't send the code. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={[flowStyles.container, { paddingTop: insets.top }]}>
      <View style={flowStyles.topBar}>
        <FlowBackButton disabled={pending} />
      </View>
      <KeyboardAvoidingView
        style={flowStyles.content}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View entering={FadeInDown.duration(300)}>
          <Text style={flowStyles.title}>What's your{"\n"}number?</Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(300).delay(60)}>
          <Text style={flowStyles.subtitle}>
            We'll text you a code — sign in or create your account in one
            step.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(120)}>
          <TextInput
            ref={inputRef}
            style={[flowStyles.input, focused && flowStyles.inputFocused]}
            value={phoneInput}
            onChangeText={(value) => {
              setPhoneInput(value);
              if (error) setError(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="+46 70 123 45 67"
            placeholderTextColor="#555"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            editable={!pending}
            onSubmitEditing={handleSendCode}
            returnKeyType="go"
          />
          <Text style={flowStyles.hint}>
            Use your full number with country code
          </Text>

          <Pressable
            style={[
              flowStyles.primaryButton,
              (!normalized || pending) && flowStyles.primaryButtonDisabled,
            ]}
            onPress={handleSendCode}
            disabled={!normalized || pending}
            accessibilityRole="button"
          >
            {pending ? (
              <ActivityIndicator size={18} color="#000" />
            ) : (
              <>
                <Text style={flowStyles.primaryButtonText}>Send code</Text>
                <Ionicons name="arrow-forward" size={18} color="#000" />
              </>
            )}
          </Pressable>

          {error && <Text style={flowStyles.error}>{error}</Text>}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
};

export default PhoneNumberScreen;
