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

// One black pill for every type — only the icon carries the accent
// (green check for success, iOS-style)
const getIconColor = (type: NotificationType): string => {
  switch (type) {
    case "success":
      return "#30D158";
    case "error":
      return "#FF6961";
    case "warning":
      return "#FFD60A";
    case "info":
    default:
      return "#64A8FF";
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
  const iconColor = getIconColor(notification.type);

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

  const wrapperStyle = [
    styles.wrapper,
    {
      [isTop ? "top" : "bottom"]: isTop ? insets.top + 10 : insets.bottom + 10,
    },
  ];

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[wrapperStyle, animatedStyle]}
        pointerEvents="box-none"
      >
        {/* Compact black pill; a tap runs the action (if any) or dismisses */}
        <Pressable
          style={styles.pill}
          onPress={() => {
            if (notification.onPress) {
              notification.onPress();
            }
            handleManualDismiss();
          }}
        >
          <Ionicons
            name={getIconName(notification.type)}
            size={18}
            color={iconColor}
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
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 24,
    right: 24,
    alignItems: "center",
    zIndex: 9999,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    maxWidth: "100%",
    backgroundColor: "rgba(22, 22, 24, 0.97)",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },
  textContainer: {
    flexShrink: 1,
  },
  title: {
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#fff",
  },
  message: {
    fontSize: 12.5,
    color: "#a9a9b0",
    marginTop: 1,
  },
});
