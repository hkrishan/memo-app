import React, { useEffect } from "react";
import { StyleSheet, Pressable, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Text, Button } from "react-native-paper";
import { PopupNotification, NotificationType } from "./types";

interface PopupProps {
  notification: PopupNotification;
  onDismiss: () => void;
}

const getIconName = (type: NotificationType): keyof typeof Ionicons.glyphMap => {
  switch (type) {
    case "success":
      return "checkmark-circle";
    case "error":
      return "alert-circle";
    case "warning":
      return "warning";
    case "info":
    default:
      return "information-circle";
  }
};

const getColors = (type: NotificationType) => {
  switch (type) {
    case "success":
      return { icon: "#4ade80", button: "#22c55e" };
    case "error":
      return { icon: "#f87171", button: "#ef4444" };
    case "warning":
      return { icon: "#fbbf24", button: "#f59e0b" };
    case "info":
    default:
      return { icon: "#60a5fa", button: "#3b82f6" };
  }
};

export default function Popup({ notification, onDismiss }: PopupProps) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  const colors = getColors(notification.type);

  useEffect(() => {
    // Animate in
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    opacity.value = withTiming(1, { duration: 200 });
    backdropOpacity.value = withTiming(1, { duration: 200 });
  }, []);

  const dismissPopup = () => {
    scale.value = withTiming(0.8, { duration: 150 });
    opacity.value = withTiming(0, { duration: 150 });
    backdropOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(onDismiss)();
    });
  };

  const handlePrimaryAction = () => {
    if (notification.primaryAction) {
      notification.primaryAction.onPress();
    }
    dismissPopup();
  };

  const handleSecondaryAction = () => {
    if (notification.secondaryAction) {
      notification.secondaryAction.onPress();
    }
    dismissPopup();
  };

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.7,
  }));

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={notification.dismissable ? dismissPopup : undefined}
        />
      </Animated.View>

      <Animated.View style={[styles.container, containerStyle]}>
        <View style={styles.iconContainer}>
          <Ionicons name={getIconName(notification.type)} size={48} color={colors.icon} />
        </View>

        <Text style={styles.title}>{notification.title}</Text>

        {notification.message && (
          <Text style={styles.message}>{notification.message}</Text>
        )}

        <View style={styles.actions}>
          {notification.secondaryAction && (
            <Button
              mode="outlined"
              onPress={handleSecondaryAction}
              style={styles.secondaryButton}
              textColor="#888"
            >
              {notification.secondaryAction.label}
            </Button>
          )}

          <Button
            mode="contained"
            onPress={handlePrimaryAction}
            style={[styles.primaryButton, { backgroundColor: colors.button }]}
          >
            {notification.primaryAction?.label ?? "OK"}
          </Button>
        </View>

        {notification.dismissable && (
          <Pressable style={styles.closeButton} onPress={dismissPopup} hitSlop={10}>
            <Ionicons name="close" size={24} color="#666" />
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
  container: {
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 32,
    maxWidth: 340,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: "#999",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 10,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 10,
    borderColor: "#333",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
  },
});
