import React, { useEffect, useRef } from "react";
import { StyleSheet, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing as ReanimatedEasing,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "react-native-paper";
import { ToastNotification, NotificationType } from "./types";

interface ToastProps {
  notification: ToastNotification;
  onRemove: () => void;
}

const SWIPE_THRESHOLD = 50;

const TIMING_IN = {
  duration: 350,
  easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
};

const TIMING_OUT = {
  duration: 250,
  easing: ReanimatedEasing.in(ReanimatedEasing.cubic),
};

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
      return { bg: "#1a3d1a", icon: "#4ade80", border: "#22c55e" };
    case "error":
      return { bg: "#3d1a1a", icon: "#f87171", border: "#ef4444" };
    case "warning":
      return { bg: "#3d3a1a", icon: "#fbbf24", border: "#f59e0b" };
    case "info":
    default:
      return { bg: "#1a2a3d", icon: "#60a5fa", border: "#3b82f6" };
  }
};

export default function Toast({ notification, onRemove }: ToastProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-100);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);
  const isAnimatingOut = useRef(false);

  const isTop = notification.position === "top";
  const colors = getColors(notification.type);

  // Animate in on mount
  useEffect(() => {
    translateY.value = withTiming(0, TIMING_IN);
    opacity.value = withTiming(1, { duration: 300 });
    scale.value = withTiming(1, TIMING_IN);
  }, []);

  // Animate out when dismissing flag is set
  useEffect(() => {
    if (notification.dismissing && !isAnimatingOut.current) {
      isAnimatingOut.current = true;
      animateOut();
    }
  }, [notification.dismissing]);

  const animateOut = () => {
    scale.value = withTiming(0.95, TIMING_OUT);
    opacity.value = withTiming(0, TIMING_OUT, () => {
      runOnJS(onRemove)();
    });
  };

  const handleManualDismiss = () => {
    if (isAnimatingOut.current) return;
    isAnimatingOut.current = true;
    animateOut();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (isAnimatingOut.current) return;
      if (isTop) {
        translateY.value = Math.min(0, e.translationY);
      } else {
        translateY.value = Math.max(0, e.translationY);
      }
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (isAnimatingOut.current) return;

      const shouldDismissY = isTop
        ? e.translationY < -SWIPE_THRESHOLD
        : e.translationY > SWIPE_THRESHOLD;
      const shouldDismissX = Math.abs(e.translationX) > SWIPE_THRESHOLD * 2;

      if (shouldDismissY || shouldDismissX) {
        isAnimatingOut.current = true;
        if (shouldDismissX) {
          translateX.value = withTiming(
            e.translationX > 0 ? 400 : -400,
            TIMING_OUT,
            () => {
              runOnJS(onRemove)();
            },
          );
          opacity.value = withTiming(0, TIMING_OUT);
        } else {
          translateY.value = withTiming(isTop ? -100 : 100, TIMING_OUT, () => {
            runOnJS(onRemove)();
          });
          opacity.value = withTiming(0, TIMING_OUT);
        }
      } else {
        translateY.value = withTiming(0, TIMING_IN);
        translateX.value = withTiming(0, TIMING_IN);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const containerStyle = [
    styles.container,
    {
      backgroundColor: colors.bg,
      borderLeftColor: colors.border,
      [isTop ? "top" : "bottom"]: isTop ? insets.top + 10 : insets.bottom + 10,
    },
  ];

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[containerStyle, animatedStyle]}>
        <Pressable
          style={styles.content}
          onPress={() => {
            if (notification.onPress) {
              notification.onPress();
              handleManualDismiss();
            }
          }}
        >
          <Ionicons
            name={getIconName(notification.type)}
            size={24}
            color={colors.icon}
            style={styles.icon}
          />
          <Animated.View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {notification.title}
            </Text>
            {notification.message && (
              <Text style={styles.message} numberOfLines={2}>
                {notification.message}
              </Text>
            )}
          </Animated.View>
          <Pressable onPress={handleManualDismiss} hitSlop={10}>
            <Ionicons name="close" size={20} color="#888" />
          </Pressable>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  message: {
    fontSize: 13,
    color: "#aaa",
    marginTop: 2,
  },
});
