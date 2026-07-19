import React, { useCallback } from "react";
import { View, ScrollView, StyleSheet, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

interface SettingsPageProps {
  contentTop: number;
  albumId?: string;
}

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  showChevron?: boolean;
}

const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  label,
  onPress,
  showChevron = true,
}) => (
  <Pressable style={styles.settingsRow} onPress={onPress}>
    <View style={styles.settingsRowLeft}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={20} color="#000" />
      </View>
      <Text style={styles.settingsLabel}>{label}</Text>
    </View>
    {showChevron && (
      <Ionicons name="chevron-forward" size={20} color="#999" />
    )}
  </Pressable>
);

const SettingsPage: React.FC<SettingsPageProps> = ({ contentTop, albumId }) => {
  const router = useRouter();

  const handleOpenActivity = useCallback(() => {
    if (albumId) {
      router.push(`/album/${albumId}/activity`);
    }
  }, [albumId, router]);

  return (
    <View style={styles.pagePlain}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: contentTop,
          paddingBottom: 100,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Album</Text>

        <View style={styles.settingsGroup}>
          <SettingsRow
            icon="pulse-outline"
            label="Activity"
            onPress={handleOpenActivity}
          />
          <SettingsRow
            icon="people-outline"
            label="Members"
            onPress={() => {}}
          />
          <SettingsRow
            icon="notifications-outline"
            label="Notifications"
            onPress={() => {}}
          />
        </View>

        <Text style={styles.sectionTitle}>Danger Zone</Text>

        <View style={styles.settingsGroup}>
          <SettingsRow
            icon="log-out-outline"
            label="Leave Album"
            onPress={() => {}}
          />
          <SettingsRow
            icon="trash-outline"
            label="Delete Album"
            onPress={() => {}}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  pagePlain: {
    flex: 1,
    backgroundColor: "#fff",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 24,
  },
  settingsGroup: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    overflow: "hidden",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  settingsRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconContainer: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsLabel: {
    fontSize: 16,
    color: "#000",
  },
});

export default SettingsPage;
