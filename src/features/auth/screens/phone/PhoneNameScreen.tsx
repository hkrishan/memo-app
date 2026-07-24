/**
 * Phone flow, step 3 — first-time accounts pick a display name. The user
 * is ALREADY signed in when this mounts (verification created the account
 * and stored tokens), so there is no back affordance and the name is a
 * nicety: skippable, and a save failure never blocks entry to the app.
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
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";

import userApi from "@/features/user/api/user.api";
import { useAuthStore } from "../../store/authStore";
import { sanitizeRedirect } from "../../hooks/useAuth";
import { flowStyles } from "./phoneFlowShared";

const PhoneNameScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();

  const [name, setName] = useState("");
  const [focused, setFocused] = useState(false);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 450);
    return () => clearTimeout(timer);
  }, []);

  const enterApp = useCallback(() => {
    router.replace(sanitizeRedirect(redirect) ?? "/(app)");
  }, [router, redirect]);

  const handleContinue = useCallback(
    async (skip = false) => {
      const trimmed = name.trim();
      if (pending) return;
      if (skip || !trimmed) {
        enterApp();
        return;
      }
      setPending(true);
      try {
        await userApi.updateProfile({ name: trimmed });
        const { user, setUser } = useAuthStore.getState();
        if (user) setUser({ ...user, name: trimmed });
      } catch (err) {
        // The session exists — never trap the user behind a failed save
        if (__DEV__) console.error("Saving name failed (continuing):", err);
      } finally {
        setPending(false);
        enterApp();
      }
    },
    [name, pending, enterApp],
  );

  return (
    <View style={[flowStyles.container, { paddingTop: insets.top }]}>
      {/* No back bar — the account exists; forward is the only direction */}
      <View style={flowStyles.topBar} />
      <KeyboardAvoidingView
        style={flowStyles.content}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={styles.welcomeBadge}
        >
          <Ionicons name="checkmark-circle" size={18} color="#34C759" />
          <Text style={styles.welcomeBadgeText}>You're in!</Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(300).delay(60)}>
          <Text style={flowStyles.title}>What should we{"\n"}call you?</Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(300).delay(120)}>
          <Text style={flowStyles.subtitle}>
            Your name is shown to people you share albums with.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(180)}>
          <TextInput
            ref={inputRef}
            style={[flowStyles.input, focused && flowStyles.inputFocused]}
            value={name}
            onChangeText={setName}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Your name"
            placeholderTextColor="#555"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            maxLength={50}
            editable={!pending}
            onSubmitEditing={() => handleContinue()}
            returnKeyType="done"
          />

          <Pressable
            style={[
              flowStyles.primaryButton,
              (!name.trim() || pending) && flowStyles.primaryButtonDisabled,
            ]}
            onPress={() => handleContinue()}
            disabled={!name.trim() || pending}
            accessibilityRole="button"
          >
            {pending ? (
              <ActivityIndicator size={18} color="#000" />
            ) : (
              <>
                <Text style={flowStyles.primaryButtonText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#000" />
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.skipButton}
            onPress={() => handleContinue(true)}
            disabled={pending}
            hitSlop={8}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  welcomeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  welcomeBadgeText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#34C759",
  },
  skipButton: {
    alignSelf: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  skipText: {
    fontSize: 15,
    color: "#8e8e93",
  },
});

export default PhoneNameScreen;
