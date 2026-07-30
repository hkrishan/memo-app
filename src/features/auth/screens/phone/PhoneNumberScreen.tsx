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
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import CountryFlag from "react-native-country-flag";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import useAuth from "../../hooks/useAuth";
import CountryCodePicker from "../../components/CountryCodePicker";
import {
  countryForNumber,
  defaultCountry,
  type Country,
} from "../../lib/countries";
import {
  FlowBackButton,
  flowStyles,
  normalizePhone,
} from "./phoneFlowShared";

/**
 * Compose E.164 from the picked country + national digits. A single trunk
 * "0" is stripped ("070…" → "+4670…") — except for Italy, where the
 * leading zero is part of the number.
 */
const composeNumber = (country: Country, national: string): string | null => {
  let digits = national.replace(/\D/g, "");
  if (country.iso !== "IT" && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return normalizePhone(`+${country.dial}${digits}`);
};

const PhoneNumberScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { requestSmsCode } = useAuth();

  const [country, setCountry] = useState<Country>(defaultCountry);
  const [phoneInput, setPhoneInput] = useState("");
  const [pickerVisible, setPickerVisible] = useState(false);
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

  // A pasted/autofilled full international number ("+46…" or "0046…")
  // switches the picker to the matching country and keeps the rest.
  const handleChangeText = (value: string) => {
    if (error) setError(null);
    const trimmed = value.trim();
    const international = trimmed.startsWith("+")
      ? trimmed.slice(1)
      : trimmed.startsWith("00")
        ? trimmed.slice(2)
        : null;
    if (international !== null) {
      const digits = international.replace(/\D/g, "");
      const matched = countryForNumber(digits, country);
      if (matched) {
        setCountry(matched);
        setPhoneInput(digits.slice(matched.dial.length));
        return;
      }
    }
    setPhoneInput(value);
  };

  const normalized = composeNumber(country, phoneInput);

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
          <View
            style={[
              flowStyles.input,
              styles.inputRow,
              focused && flowStyles.inputFocused,
            ]}
          >
            <Pressable
              style={styles.countryButton}
              onPress={() => setPickerVisible(true)}
              disabled={pending}
              accessibilityRole="button"
              accessibilityLabel={`Country code, ${country.name}, +${country.dial}`}
            >
              <CountryFlag
                isoCode={country.iso}
                size={16}
                style={styles.flag}
              />
              <Text style={styles.dialCode}>+{country.dial}</Text>
              <Ionicons name="chevron-down" size={14} color="#9a9aa0" />
            </Pressable>
            <View style={styles.divider} />
            <TextInput
              ref={inputRef}
              style={styles.numberInput}
              value={phoneInput}
              onChangeText={handleChangeText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="70 123 45 67"
              placeholderTextColor="#555"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              editable={!pending}
              onSubmitEditing={handleSendCode}
              returnKeyType="go"
            />
          </View>
          <Text style={flowStyles.hint}>
            We'll only use your number to sign you in
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

      <CountryCodePicker
        visible={pickerVisible}
        selected={country}
        onSelect={setCountry}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  countryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 18,
    paddingRight: 12,
    alignSelf: "stretch",
  },
  flag: {
    borderRadius: 3,
  },
  dialCode: {
    fontSize: 20,
    color: "#fff",
    fontVariant: ["tabular-nums"],
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  numberInput: {
    flex: 1,
    fontSize: 20,
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
});

export default PhoneNumberScreen;
