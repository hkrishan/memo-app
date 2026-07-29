import { StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";

export type LoginProvider =
  | "phone"
  | "google"
  | "apple"
  | "facebook"
  | "email"
  | "test";

interface LoginProviderButtonProps {
  provider: LoginProvider;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const providerConfig: Record<
  LoginProvider,
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    bgColor: string;
    textColor: string;
  }
> = {
  phone: {
    label: "Continue with Phone",
    icon: "chatbubble-ellipses",
    bgColor: "#000000",
    textColor: "#ffffff",
  },
  google: {
    label: "Continue with Google",
    icon: "logo-google",
    bgColor: "#ffffff",
    textColor: "#000000",
  },
  apple: {
    label: "Continue with Apple",
    icon: "logo-apple",
    bgColor: "#000000",
    textColor: "#ffffff",
  },
  facebook: {
    label: "Continue with Facebook",
    icon: "logo-facebook",
    bgColor: "#1877F2",
    textColor: "#ffffff",
  },
  email: {
    label: "Continue with Email",
    icon: "mail",
    bgColor: "#333333",
    textColor: "#ffffff",
  },
  test: {
    label: "Test Login (Dev)",
    icon: "bug",
    bgColor: "#000",
    textColor: "#fff",
  },
};

export default function LoginProviderButton({
  provider,
  onPress,
  disabled = false,
  loading = false,
}: LoginProviderButtonProps) {
  const config = providerConfig[provider];

  return (
    <Button
      mode="contained"
      onPress={onPress}
      disabled={disabled || loading}
      loading={loading}
      style={[styles.button, { backgroundColor: config.bgColor }]}
      contentStyle={styles.buttonContent}
      labelStyle={[styles.label, { color: config.textColor }]}
      icon={() => (
        <Ionicons name={config.icon} size={20} color={config.textColor} />
      )}
    >
      {config.label}
    </Button>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    marginVertical: 6,
    borderRadius: 12,
  },
  buttonContent: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
});
