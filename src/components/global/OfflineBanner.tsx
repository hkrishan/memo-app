/**
 * App-wide connectivity strip: a slim bar that slides in under the status
 * bar when the device has been offline for a moment, and confirms with a
 * brief "Back online" before sliding away.
 *
 * Deliberately quiet — the app keeps working offline (cached content,
 * queued uploads), so this is a status line, not an alarm. The show is
 * debounced so a one-second elevator blip never flashes chrome, and the
 * strip takes no touches.
 */

import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useIsOnline } from "@/lib/network";
import { color, font } from "@/lib/tokens";

/** Offline this long before the strip appears (ignores blips). */
const SHOW_DELAY_MS = 2000;
/** How long "Back online" lingers before the strip retires. */
const RESTORED_LINGER_MS = 1800;

type Mode = "hidden" | "offline" | "restored";

export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("hidden");
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (!online) {
      showTimer.current = setTimeout(() => setMode("offline"), SHOW_DELAY_MS);
    } else {
      // Only a strip the user actually saw earns the confirmation
      setMode((current) => (current === "offline" ? "restored" : current));
    }
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
    };
  }, [online]);

  useEffect(() => {
    if (mode !== "restored") return;
    const timer = setTimeout(() => setMode("hidden"), RESTORED_LINGER_MS);
    return () => clearTimeout(timer);
  }, [mode]);

  const visible = mode !== "hidden";
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: 240,
      easing: Easing.out(Easing.quad),
    });
  }, [visible, progress]);
  const slideStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (progress.value - 1) * 48 }],
  }));

  const restored = mode === "restored";

  return (
    <Animated.View
      style={[styles.wrap, { paddingTop: insets.top }, slideStyle]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row}>
        <Ionicons
          name={restored ? "cloud-done-outline" : "cloud-offline-outline"}
          size={13}
          color={restored ? color.success : color.textSecondary}
        />
        <Text style={styles.label}>
          {restored ? "Back online" : "No internet connection"}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
    zIndex: 999,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
  },
  label: {
    fontSize: 12,
    ...font.medium,
    color: color.textSecondary,
  },
});

export default OfflineBanner;
