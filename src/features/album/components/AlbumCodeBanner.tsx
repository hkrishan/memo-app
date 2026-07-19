import { useState, useCallback } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { theme } from "@/lib/theme";

type AlbumCodeBannerProps = {
  code: string;
  onClick?: () => void;
};

const AlbumCodeBanner = ({ code }: AlbumCodeBannerProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <Pressable onPress={handleCopy} style={styles.container}>
      <Text style={styles.code}>{code}</Text>
      <View style={styles.copyButton}>
        <Ionicons
          name={copied ? "checkmark" : "copy-outline"}
          size={18}
          color={theme.colors.onPrimary}
        />
        <Text style={styles.copyText}>{copied ? "Copied!" : "Copy"}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  code: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.onPrimary,
    letterSpacing: 2,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  copyText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.onPrimary,
  },
});

export default AlbumCodeBanner;
