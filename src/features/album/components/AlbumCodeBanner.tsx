/**
 * AlbumCodeBanner — the album's join code, presented quietly under the
 * invite-link actions: an "or join with code" divider, then the code in
 * spaced tabular digits. Tapping copies the code to the clipboard.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

type AlbumCodeBannerProps = {
  code: string;
};

const AlbumCodeBanner = ({ code }: AlbumCodeBannerProps) => {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <View style={styles.container}>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or join with code</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable
        onPress={handleCopy}
        style={({ pressed }) => [
          styles.codeRow,
          pressed && styles.codeRowPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Album code ${code.split("").join(" ")}. Copy code`}
      >
        <Text style={styles.code}>{code}</Text>
        <Ionicons
          name={copied ? "checkmark" : "copy-outline"}
          size={16}
          color={copied ? "#000" : "#9C9C99"}
        />
      </Pressable>

      <Text style={styles.hint}>{copied ? "Code copied" : "Tap to copy"}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    gap: 12,
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#D8D8D5",
  },
  dividerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9C9C99",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  codeRowPressed: {
    backgroundColor: "#E9E9E6",
  },
  code: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111",
    letterSpacing: 8,
    fontVariant: ["tabular-nums"],
  },
  hint: {
    fontSize: 12,
    color: "#9C9C99",
    marginTop: 2,
  },
});

export default AlbumCodeBanner;
