import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useUploadIndicatorStore } from "./store";

const SHOW_SPRING = { damping: 18, stiffness: 220, mass: 0.6 };
const HIDE_SPRING = { damping: 20, stiffness: 260, mass: 0.6 };
const FADE_IN = { duration: 180 };
const FADE_OUT = { duration: 200 };
const CROSSFADE = { duration: 160 };

const GLYPH_SIZE = 18;

/**
 * Small floating capsule under the safe area that reflects the global
 * uploadIndicator store. Rendered once, next to NotificationManager.
 * Never intercepts touches.
 */
export default function UploadIndicatorHost() {
  const insets = useSafeAreaInsets();
  const visible = useUploadIndicatorStore((s) => s.visible);
  const phase = useUploadIndicatorStore((s) => s.phase);
  const label = useUploadIndicatorStore((s) => s.label);

  // Keep the pill mounted while it animates out, then drop it entirely
  const [rendered, setRendered] = useState(visible);

  const translateY = useSharedValue(-12);
  const opacity = useSharedValue(0);
  const spinnerOpacity = useSharedValue(1);
  const glyphOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      translateY.value = withSpring(0, SHOW_SPRING);
      opacity.value = withTiming(1, FADE_IN);
    } else {
      translateY.value = withSpring(-12, HIDE_SPRING);
      opacity.value = withTiming(0, FADE_OUT, (finished) => {
        if (finished) {
          runOnJS(setRendered)(false);
        }
      });
    }
  }, [visible, translateY, opacity]);

  // Spinner crossfades to the terminal glyph (check / error) and back
  useEffect(() => {
    const showSpinner = phase === "active";
    spinnerOpacity.value = withTiming(showSpinner ? 1 : 0, CROSSFADE);
    glyphOpacity.value = withTiming(showSpinner ? 0 : 1, CROSSFADE);
  }, [phase, spinnerOpacity, glyphOpacity]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const spinnerStyle = useAnimatedStyle(() => ({
    opacity: spinnerOpacity.value,
  }));

  const glyphStyle = useAnimatedStyle(() => ({
    opacity: glyphOpacity.value,
  }));

  if (!rendered) {
    return null;
  }

  return (
    <View
      style={[styles.container, { top: insets.top + 8 }]}
      pointerEvents="none"
    >
      <Animated.View style={[styles.pill, pillStyle]}>
        <View style={styles.glyphSlot}>
          <Animated.View style={[styles.glyphLayer, spinnerStyle]}>
            <ActivityIndicator size="small" color="#fff" />
          </Animated.View>
          <Animated.View style={[styles.glyphLayer, glyphStyle]}>
            <Ionicons
              name={phase === "error" ? "alert-circle" : "checkmark-circle"}
              size={GLYPH_SIZE}
              color="#fff"
            />
          </Animated.View>
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9998,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    maxWidth: "80%",
    paddingHorizontal: 14,
    gap: 8,
    borderRadius: 999,
    backgroundColor: "rgba(20,20,20,0.92)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  glyphSlot: {
    width: GLYPH_SIZE + 2,
    height: GLYPH_SIZE + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 13,
    fontFamily: "InstrumentSans_500Medium",
    fontWeight: "500",
    color: "#fff",
    flexShrink: 1,
  },
});
