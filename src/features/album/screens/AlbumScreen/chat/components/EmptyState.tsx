// Empty state for when there are no messages

import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";

interface EmptyStateProps {
  albumTitle?: string;
}

const EmptyState = memo<EmptyStateProps>(({ albumTitle }) => (
  <Animated.View
    entering={FadeIn.duration(300).delay(200)}
    style={styles.container}
  >
    <View style={styles.iconContainer}>
      <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
    </View>
    <Text style={styles.title}>Start the conversation</Text>
    <Text style={styles.subtitle}>
      {albumTitle
        ? `Be the first to say something in "${albumTitle}"`
        : "Be the first to say something"}
    </Text>
  </Animated.View>
));

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 80, // Account for composer
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
});

export default EmptyState;
