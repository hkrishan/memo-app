import React from "react";
import { View, ScrollView, StyleSheet, Pressable, Switch } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { notify } from "@/components/global";
import {
  useAlbumNotificationSettingsQuery,
  useUpdateAlbumNotificationSettingsMutation,
} from "../api/notificationSettings.queries";
import { AlbumNotificationSettings } from "../api/notificationSettings.api";

type ToggleKey = keyof AlbumNotificationSettings;

const TOGGLES: {
  key: ToggleKey;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
}[] = [
  {
    key: "photoUploaded",
    icon: "image-outline",
    label: "New photos",
    description: "When members add photos to the album",
  },
  {
    key: "memberJoined",
    icon: "person-add-outline",
    label: "New members",
    description: "When someone joins the album",
  },
  {
    key: "comments",
    icon: "chatbubble-outline",
    label: "Comments",
    description: "When someone comments on your photos",
  },
  {
    key: "likes",
    icon: "heart-outline",
    label: "Likes",
    description: "When someone likes your photos",
  },
  {
    key: "moments",
    icon: "flash-outline",
    label: "Moments",
    description: "Daily drops, challenges and reminders",
  },
];

const AlbumNotificationSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { albumId } = useLocalSearchParams<{ albumId: string }>();

  const { data: settings } = useAlbumNotificationSettingsQuery(albumId ?? "");
  const updateSettings = useUpdateAlbumNotificationSettingsMutation(
    albumId ?? "",
  );

  const handleBack = () => {
    router.back();
  };

  const handleToggle = (key: ToggleKey, value: boolean) => {
    Haptics.selectionAsync();
    updateSettings.mutate(
      { [key]: value },
      {
        // A silently-failed toggle leaves the user believing notifications
        // are off when they're on — always say so
        onError: () => {
          notify.error("Couldn't update", "Please try again");
        },
      },
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={handleBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color="#000" />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Push Notifications</Text>

        <View style={styles.settingsGroup}>
          {TOGGLES.map((toggle) => (
            <View key={toggle.key} style={styles.settingsRow}>
              <View style={styles.iconContainer}>
                <Ionicons name={toggle.icon} size={20} color="#000" />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{toggle.label}</Text>
                <Text style={styles.rowDescription}>{toggle.description}</Text>
              </View>
              <Switch
                value={settings?.[toggle.key] ?? true}
                onValueChange={(value) => handleToggle(toggle.key, value)}
                disabled={!settings}
                trackColor={{ true: "#000" }}
              />
            </View>
          ))}
        </View>

        <Text style={styles.footnote}>
          These preferences only apply to this album.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  iconContainer: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    color: "#000",
  },
  rowDescription: {
    fontSize: 12,
    color: "#888",
    marginTop: 1,
  },
  footnote: {
    fontSize: 12,
    color: "#888",
    marginTop: 12,
    marginHorizontal: 4,
  },
});

export default AlbumNotificationSettingsScreen;
