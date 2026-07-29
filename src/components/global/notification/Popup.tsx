import React, { useEffect } from "react";
import { StyleSheet, Pressable, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "react-native-paper";
import { PopupNotification, NotificationType } from "./types";

interface PopupProps {
  notification: PopupNotification;
  onDismiss: () => void;
}

/**
 * Per-type accents, in the DeleteConfirmSheet language: a small tinted
 * icon well up top and a full-width pill for the primary action.
 * Destructive confirms (warning/error) get the red pill; success/info get
 * a white pill with dark text.
 */
const ACCENTS: Record<
  NotificationType,
  {
    icon: keyof typeof Ionicons.glyphMap;
    tint: string;
    well: string;
    pill: string;
    pillPressed: string;
    pillLabel: string;
  }
> = {
  warning: {
    icon: "warning-outline",
    tint: "#E5484D",
    well: "rgba(229, 72, 77, 0.14)",
    pill: "#E5484D",
    pillPressed: "#C93A3F",
    pillLabel: "#fff",
  },
  error: {
    icon: "alert-circle-outline",
    tint: "#E5484D",
    well: "rgba(229, 72, 77, 0.14)",
    pill: "#E5484D",
    pillPressed: "#C93A3F",
    pillLabel: "#fff",
  },
  success: {
    icon: "checkmark-circle-outline",
    tint: "#30D158",
    well: "rgba(48, 209, 88, 0.14)",
    pill: "#fff",
    pillPressed: "#d8d8dc",
    pillLabel: "#111",
  },
  info: {
    icon: "information-circle-outline",
    tint: "#8ab8ff",
    well: "rgba(138, 184, 255, 0.14)",
    pill: "#fff",
    pillPressed: "#d8d8dc",
    pillLabel: "#111",
  },
};

export default function Popup({ notification, onDismiss }: PopupProps) {
  const progress = useSharedValue(0);
  const accent = ACCENTS[notification.type] ?? ACCENTS.info;

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  const dismissPopup = () => {
    progress.value = withTiming(0, { duration: 150 }, (finished) => {
      if (finished) {
        runOnJS(onDismiss)();
      }
    });
  };

  const handlePrimaryAction = () => {
    notification.primaryAction?.onPress();
    dismissPopup();
  };

  const handleSecondaryAction = () => {
    notification.secondaryAction?.onPress();
    dismissPopup();
  };

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.55,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.94 + 0.06 * progress.value }],
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={notification.dismissable ? dismissPopup : undefined}
        />
      </Animated.View>

      <Animated.View style={[styles.card, cardStyle]}>
        <View style={[styles.iconWell, { backgroundColor: accent.well }]}>
          <Ionicons name={accent.icon} size={22} color={accent.tint} />
        </View>

        <Text style={styles.title}>{notification.title}</Text>

        {notification.message && (
          <Text style={styles.message}>{notification.message}</Text>
        )}

        <Pressable
          onPress={handlePrimaryAction}
          style={({ pressed }) => [
            styles.primaryPill,
            { backgroundColor: pressed ? accent.pillPressed : accent.pill },
          ]}
          accessibilityRole="button"
          accessibilityLabel={notification.primaryAction?.label ?? "OK"}
        >
          <Text style={[styles.primaryLabel, { color: accent.pillLabel }]}>
            {notification.primaryAction?.label ?? "OK"}
          </Text>
        </Pressable>

        {notification.secondaryAction && (
          <Pressable
            onPress={handleSecondaryAction}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.cancelPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={notification.secondaryAction.label}
          >
            <Text style={styles.cancelLabel}>
              {notification.secondaryAction.label}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  card: {
    backgroundColor: "#1c1c1e",
    borderRadius: 26,
    paddingTop: 24,
    paddingBottom: 14,
    paddingHorizontal: 20,
    marginHorizontal: 40,
    maxWidth: 320,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
  },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 6,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255, 255, 255, 0.72)",
    textAlign: "center",
    maxWidth: 260,
  },
  primaryPill: {
    alignSelf: "stretch",
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  primaryLabel: {
    fontSize: 15,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
  cancelButton: {
    alignSelf: "stretch",
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  cancelPressed: {
    opacity: 0.6,
  },
  cancelLabel: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
});
