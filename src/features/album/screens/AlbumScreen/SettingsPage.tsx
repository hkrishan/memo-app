import React, { useCallback } from "react";
import { View, ScrollView, StyleSheet, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGetPageQuery } from "@/features/page/api/page.queries";
import { notify } from "@/components/global";
import { useAuthStore } from "@/features/auth/store/authStore";
import {
  useDeleteAlbumMutation,
  useGetAlbumQuery,
  useLeaveAlbumMutation,
} from "../../api/album.queries";

interface SettingsPageProps {
  contentTop: number;
  albumId?: string;
}

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  showChevron?: boolean;
  destructive?: boolean;
}

const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  label,
  onPress,
  showChevron = true,
  destructive = false,
}) => (
  <Pressable style={styles.settingsRow} onPress={onPress}>
    <View style={styles.settingsRowLeft}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={20} color={destructive ? "#FF3B30" : "#000"} />
      </View>
      <Text
        style={[styles.settingsLabel, destructive && styles.destructiveLabel]}
      >
        {label}
      </Text>
    </View>
    {showChevron && (
      <Ionicons name="chevron-forward" size={20} color="#999" />
    )}
  </Pressable>
);

const SettingsPage: React.FC<SettingsPageProps> = ({ contentTop, albumId }) => {
  const router = useRouter();
  const { data: page } = useGetPageQuery(albumId ?? "");
  const { data: album } = useGetAlbumQuery(albumId!);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const deleteAlbumMutation = useDeleteAlbumMutation();
  const leaveAlbumMutation = useLeaveAlbumMutation();

  // Until the album loads, neither danger row shows (brief and harmless)
  const isOwner =
    !!album && !!currentUserId && album.ownerId === currentUserId;

  const handleOpenActivity = useCallback(() => {
    if (albumId) {
      router.push(`/album/${albumId}/activity`);
    }
  }, [albumId, router]);

  const handleOpenMap = useCallback(() => {
    if (albumId) {
      router.push(`/album/${albumId}/map`);
    }
  }, [albumId, router]);

  const handleOpenPageSettings = useCallback(() => {
    if (albumId && page) {
      router.push(`/album/${albumId}/page/${page.pageId}/settings`);
    }
  }, [albumId, page, router]);

  const handleOpenMembers = useCallback(() => {
    if (albumId) {
      router.push(`/album/${albumId}/add-members`);
    }
  }, [albumId, router]);

  const handleOpenNotifications = useCallback(() => {
    if (albumId) {
      router.push(`/album/${albumId}/notifications`);
    }
  }, [albumId, router]);

  const handleOpenAlbumSettings = useCallback(() => {
    if (albumId) {
      router.push(`/album/${albumId}/edit`);
    }
  }, [albumId, router]);

  const handleLeaveAlbum = useCallback(() => {
    if (!albumId) return;
    notify.popup({
      type: "warning",
      title: "Leave this album?",
      message: `You'll lose access to "${album?.title ?? "this album"}" until someone invites you back.`,
      primaryAction: {
        label: "Leave album",
        onPress: () => {
          leaveAlbumMutation.mutate(albumId, {
            onSuccess: () => {
              notify.success("You left the album");
              router.replace("/");
            },
            onError: () => {
              notify.error("Couldn't leave the album", "Please try again");
            },
          });
        },
      },
      secondaryAction: {
        label: "Stay",
        onPress: () => {},
      },
      dismissable: true,
    });
  }, [albumId, album?.title, leaveAlbumMutation, router]);

  const handleDeleteAlbum = useCallback(() => {
    if (!albumId) return;
    notify.popup({
      type: "warning",
      title: "Delete this album?",
      message: `"${album?.title ?? "This album"}" and all its photos will be permanently deleted for everyone. This can't be undone.`,
      primaryAction: {
        label: "Delete album",
        onPress: () => {
          deleteAlbumMutation.mutate(albumId, {
            onSuccess: () => {
              notify.success("Album deleted");
              router.replace("/");
            },
            onError: () => {
              notify.error("Couldn't delete the album", "Please try again");
            },
          });
        },
      },
      secondaryAction: {
        label: "Keep it",
        onPress: () => {},
      },
      dismissable: true,
    });
  }, [albumId, album?.title, deleteAlbumMutation, router]);

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
          {isOwner && (
            <SettingsRow
              icon="create-outline"
              label="Album Settings"
              onPress={handleOpenAlbumSettings}
            />
          )}
          <SettingsRow
            icon="pulse-outline"
            label="Activity"
            onPress={handleOpenActivity}
          />
          <SettingsRow
            icon="map-outline"
            label="Map"
            onPress={handleOpenMap}
          />
          <SettingsRow
            icon="people-outline"
            label="Members"
            onPress={handleOpenMembers}
          />
          <SettingsRow
            icon="notifications-outline"
            label="Notifications"
            onPress={handleOpenNotifications}
          />
        </View>

        {page && (
          <>
            <Text style={styles.sectionTitle}>Public Page</Text>

            <View style={styles.settingsGroup}>
              <SettingsRow
                icon="globe-outline"
                label="Page Settings"
                onPress={handleOpenPageSettings}
              />
            </View>
          </>
        )}

        {album && (
          <>
            <Text style={styles.sectionTitle}>Danger Zone</Text>

            <View style={styles.settingsGroup}>
              {/* Owners delete; everyone else leaves */}
              {isOwner ? (
                <SettingsRow
                  icon="trash-outline"
                  label="Delete Album"
                  onPress={handleDeleteAlbum}
                  showChevron={false}
                  destructive
                />
              ) : (
                <SettingsRow
                  icon="log-out-outline"
                  label="Leave Album"
                  onPress={handleLeaveAlbum}
                  showChevron={false}
                  destructive
                />
              )}
            </View>
          </>
        )}
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
    fontFamily: "InstrumentSans_400Regular",
    fontWeight: "400",
    fontSize: 16,
    color: "#000",
  },
  destructiveLabel: {
    color: "#FF3B30",
  },
});

export default SettingsPage;
