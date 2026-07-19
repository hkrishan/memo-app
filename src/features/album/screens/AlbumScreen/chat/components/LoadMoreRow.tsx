// Load more row for pagination

import React, { memo } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface LoadMoreRowProps {
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
}

const LoadMoreRow = memo<LoadMoreRowProps>(({ isLoading, hasError, onRetry }) => {
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#666" />
        <Text style={styles.loadingText}>Loading older messages...</Text>
      </View>
    );
  }

  if (hasError) {
    return (
      <Pressable
        onPress={onRetry}
        style={styles.container}
        accessibilityRole="button"
        accessibilityLabel="Retry loading older messages"
      >
        <Ionicons name="alert-circle-outline" size={20} color="#e53935" />
        <Text style={styles.errorText}>Failed to load. Tap to retry.</Text>
      </Pressable>
    );
  }

  return null;
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#666",
  },
  errorText: {
    fontSize: 13,
    color: "#e53935",
  },
});

export default LoadMoreRow;
