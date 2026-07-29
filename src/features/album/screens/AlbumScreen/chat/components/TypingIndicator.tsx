// Animated typing indicator with bouncing dots

import React, { memo, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { TypingUser } from "../types/chat.types";

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
}

const Dot = memo<{ delay: number }>(({ delay }) => {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-4, { duration: 300 }),
          withTiming(0, { duration: 300 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
});

const TypingIndicator = memo<TypingIndicatorProps>(({ typingUsers }) => {
  if (typingUsers.length === 0) return null;

  const typingText =
    typingUsers.length === 1
      ? `${typingUsers[0].name} is typing`
      : typingUsers.length === 2
        ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing`
        : `${typingUsers[0].name} and ${typingUsers.length - 1} others are typing`;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.container}
    >
      <View style={styles.bubble}>
        <View style={styles.dotsContainer}>
          <Dot delay={0} />
          <Dot delay={150} />
          <Dot delay={300} />
        </View>
      </View>
      <Text style={styles.typingText}>{typingText}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 40, // Align with message bubbles
  },
  bubble: {
    backgroundColor: "#f0f0f0",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#888",
  },
  typingText: {
    fontFamily: "InstrumentSans_400Regular",
    fontWeight: "400",
    fontSize: 12,
    color: "#888",
    marginLeft: 8,
  },
});

export default TypingIndicator;
