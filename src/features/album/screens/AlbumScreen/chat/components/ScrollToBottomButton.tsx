// Floating scroll to bottom button

import React, { memo } from "react";
import { StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ScrollToBottomButtonProps {
  visible: boolean;
  onPress: () => void;
  unreadCount?: number;
}

const ScrollToBottomButton = memo<ScrollToBottomButtonProps>(
  ({ visible, onPress, unreadCount = 0 }) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
      scale.value = withSpring(0.9);
    };

    const handlePressOut = () => {
      scale.value = withSpring(1);
    };

    if (!visible) return null;

    return (
      <Animated.View
        entering={FadeIn.duration(200).springify()}
        exiting={FadeOut.duration(150)}
        style={styles.container}
      >
        <AnimatedPressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[styles.button, animatedStyle]}
          accessibilityRole="button"
          accessibilityLabel={
            unreadCount > 0
              ? `Scroll to bottom, ${unreadCount} new messages`
              : "Scroll to bottom"
          }
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-down" size={24} color="#000" />
        </AnimatedPressable>
        {unreadCount > 0 && (
          <Animated.View
            entering={FadeIn.duration(150)}
            style={styles.badge}
          >
            <Animated.Text style={styles.badgeText}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </Animated.Text>
          </Animated.View>
        )}
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 16,
    bottom: 16,
    alignItems: "center",
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  badge: {
    position: "absolute",
    top: -8,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
});

export default ScrollToBottomButton;
