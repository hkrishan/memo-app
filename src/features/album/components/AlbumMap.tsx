/**
 * AlbumMap Component
 * Placeholder for map view showing photo locations
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";

interface AlbumMapProps {
  photoCount?: number;
}

export const AlbumMap: React.FC<AlbumMapProps> = ({ photoCount = 0 }) => {
  return <View style={styles.container}></View>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f8f8",
    minHeight: 400,
  },
  placeholderContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#333",
  },
  subtitle: {
    fontSize: 15,
    color: "#888",
    textAlign: "center",
  },
  photoCount: {
    fontSize: 13,
    color: "#999",
    marginTop: 4,
  },
  comingSoonBadge: {
    marginTop: 16,
    backgroundColor: "#e8e8e8",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  comingSoonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
});

export default AlbumMap;
