/**
 * Shared chrome for the live moment cards: white rounded surface, accent
 * icon badge, title/subtitle header, optional ellipsis menu, and
 * long-press-to-cancel for creators/owners.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface MomentCardShellProps {
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  title: string;
  subtitle?: string;
  canCancel: boolean;
  onRequestCancel: () => void;
  children: React.ReactNode;
}

const MomentCardShell: React.FC<MomentCardShellProps> = ({
  icon,
  accentColor,
  title,
  subtitle,
  canCancel,
  onRequestCancel,
  children,
}) => (
  <Pressable
    style={styles.card}
    onLongPress={canCancel ? onRequestCancel : undefined}
    delayLongPress={450}
  >
    <View style={styles.header}>
      <View style={[styles.iconBadge, { backgroundColor: `${accentColor}1A` }]}>
        <Ionicons name={icon} size={18} color={accentColor} />
      </View>
      <View style={styles.headerText}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {canCancel && (
        <Pressable
          onPress={onRequestCancel}
          style={styles.menuButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Moment options"
        >
          <Ionicons name="ellipsis-horizontal" size={18} color="#8E8E93" />
        </Pressable>
      )}
    </View>
    {children}
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.08)",
    padding: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  subtitle: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 1,
  },
  menuButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default MomentCardShell;
