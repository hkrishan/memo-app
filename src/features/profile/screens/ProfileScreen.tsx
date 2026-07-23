import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { Button, Dialog, Portal, Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as Application from "expo-application";
import SafeAreaView from "@/components/layout/SafeAreaView";
import Avatar from "@/components/ui/Avatar";
import useUser from "@/features/user/hooks/useUser";
import useAuth from "@/features/auth/hooks/useAuth";
import {
  useGetAlbumsQuery,
  useJoinAlbumMutation,
} from "@/features/album/api/album.queries";
import { notify } from "@/components/global";
import { theme } from "@/lib/theme";

const FEEDBACK_URL = "mailto:hugo@pollflow.io?subject=Memo%20Feedback";

type SectionRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress?: () => void;
  right?: React.ReactNode;
  showChevron?: boolean;
};

const SectionRow = ({
  icon,
  title,
  onPress,
  right,
  showChevron = true,
}: SectionRowProps) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}
  >
    <View style={styles.rowIconContainer}>
      <Ionicons name={icon} size={18} color="#000" />
    </View>
    <Text style={styles.rowTitle}>{title}</Text>
    {right ??
      (showChevron && onPress ? (
        <Ionicons name="chevron-forward" size={18} color="#999" />
      ) : null)}
  </Pressable>
);

const ProfileScreen = () => {
  const router = useRouter();
  const { user } = useUser();
  const auth = useAuth();
  const albumsQuery = useGetAlbumsQuery();
  const joinAlbum = useJoinAlbumMutation();

  const [joinDialogVisible, setJoinDialogVisible] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  const albumCount = albumsQuery.data?.length;

  const friendCount = useMemo(() => {
    // Wait for BOTH queries — without the current userId we'd count self
    if (!albumsQuery.data || !user?.userId) return undefined;
    const ids = new Set<string>();
    for (const album of albumsQuery.data) {
      for (const member of album.members ?? []) {
        if (member.userId !== user.userId) {
          ids.add(member.userId);
        }
      }
    }
    return ids.size;
  }, [albumsQuery.data, user?.userId]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleOpenUser = useCallback(() => {
    router.push("/user");
  }, [router]);

  const handleNewAlbum = useCallback(() => {
    router.push("/album/create");
  }, [router]);

  const handleOpenJoinDialog = useCallback(() => {
    setJoinDialogVisible(true);
  }, []);

  const handleCloseJoinDialog = useCallback(() => {
    setJoinDialogVisible(false);
    setJoinCode("");
  }, []);

  const handleJoinCodeChange = useCallback((text: string) => {
    // Pasted codes arrive with any casing/punctuation — normalize like the
    // create-album join step does
    setJoinCode(
      text
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase()
        .slice(0, 8),
    );
  }, []);

  const handleJoin = useCallback(() => {
    joinAlbum.mutate(joinCode, {
      onSuccess: () => {
        setJoinDialogVisible(false);
        setJoinCode("");
        notify.success(
          "Request Sent",
          "The album owner will review your request",
        );
      },
      onError: () => {
        notify.error("Couldn't Join", "Check the code and try again");
      },
    });
  }, [joinAlbum, joinCode]);

  const handleOpenBlockedUsers = useCallback(() => {
    router.push("/blocked-users");
  }, [router]);

  const handleClearCache = useCallback(() => {
    Alert.alert(
      "Clear Cache?",
      "Photos will re-download the next time you view them.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await Image.clearDiskCache();
              await Image.clearMemoryCache();
              notify.success("Cache Cleared", "Freed up local storage");
            } catch {
              notify.error("Couldn't Clear Cache", "Please try again");
            }
          },
        },
      ],
    );
  }, []);

  const handleSendFeedback = useCallback(async () => {
    try {
      await Linking.openURL(FEEDBACK_URL);
    } catch {
      notify.error("Couldn't Open Mail", "Please try again");
    }
  }, []);

  const handleSignOut = useCallback(() => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: auth.logout },
    ]);
  }, [auth.logout]);

  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      "Delete Account?",
      "This permanently deletes your account, your photos, and albums only you are in. Shared albums you own are handed over to another member. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            // Second, unmissable confirmation — deletion is irreversible
            Alert.alert(
              "Are you absolutely sure?",
              "Your account and photos will be gone forever.",
              [
                { text: "Keep my account", style: "cancel" },
                {
                  text: "Delete forever",
                  style: "destructive",
                  onPress: async () => {
                    setDeletingAccount(true);
                    try {
                      await auth.deleteAccount();
                    } catch {
                      // Error already surfaced by the hook; session intact
                    } finally {
                      setDeletingAccount(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [auth]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={handleClose}
              hitSlop={8}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.rowPressed,
              ]}
            >
              <Ionicons name="chevron-down" size={26} color="#000" />
            </Pressable>
            <Text style={styles.headerTitle}>Profile</Text>
          </View>

          {/* Profile card */}
          <Pressable
            onPress={handleOpenUser}
            style={({ pressed }) => [
              styles.profileCard,
              pressed && styles.rowPressed,
            ]}
          >
            <Avatar user={user} size={64} />
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {user?.name ?? ""}
              </Text>
              <Text
                style={[
                  styles.profileEmail,
                  !user?.email && styles.profileEmailMuted,
                ]}
                numberOfLines={1}
              >
                {user?.email ?? "Add your email"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#999" />
          </Pressable>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statTile}>
              {albumsQuery.isLoading ? (
                <ActivityIndicator size="small" color="#999" style={styles.statSpinner} />
              ) : (
                <Text style={styles.statNumber}>{albumCount ?? "–"}</Text>
              )}
              <Text style={styles.statLabel}>Albums</Text>
            </View>
            <View style={styles.statTile}>
              {albumsQuery.isLoading ? (
                <ActivityIndicator size="small" color="#999" style={styles.statSpinner} />
              ) : (
                <Text style={styles.statNumber}>{friendCount ?? "–"}</Text>
              )}
              <Text style={styles.statLabel}>Friends</Text>
            </View>
          </View>

          {/* Memories */}
          <Text style={styles.sectionLabel}>MEMORIES</Text>
          <View style={styles.sectionCard}>
            <SectionRow
              icon="add-circle-outline"
              title="New album"
              onPress={handleNewAlbum}
            />
            <View style={styles.rowDivider} />
            <SectionRow
              icon="key-outline"
              title="Join with code"
              onPress={handleOpenJoinDialog}
            />
          </View>

          {/* Privacy */}
          <Text style={styles.sectionLabel}>PRIVACY</Text>
          <View style={styles.sectionCard}>
            <SectionRow
              icon="ban-outline"
              title="Blocked users"
              onPress={handleOpenBlockedUsers}
            />
          </View>

          {/* App */}
          <Text style={styles.sectionLabel}>APP</Text>
          <View style={styles.sectionCard}>
            <SectionRow
              icon="trash-outline"
              title="Clear image cache"
              onPress={handleClearCache}
            />
            <View style={styles.rowDivider} />
            <SectionRow
              icon="mail-outline"
              title="Send feedback"
              onPress={handleSendFeedback}
            />
            <View style={styles.rowDivider} />
            <SectionRow
              icon="information-circle-outline"
              title="Version"
              right={
                <Text style={styles.versionText}>
                  {Application.nativeApplicationVersion ?? "dev"}
                </Text>
              }
            />
          </View>

          {/* Push sign-out to the bottom on tall screens */}
          <View style={styles.spacer} />

          {/* Sign out */}
          <Pressable
            onPress={handleSignOut}
            disabled={auth.isLoading}
            style={({ pressed }) => [
              styles.signOutRow,
              pressed && styles.rowPressed,
            ]}
          >
            {auth.isLoading ? (
              <ActivityIndicator size="small" color={theme.colors.error} />
            ) : (
              <Ionicons
                name="log-out-outline"
                size={20}
                color={theme.colors.error}
              />
            )}
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>

          {/* Delete account — deliberately subdued next to sign out */}
          <Pressable
            onPress={handleDeleteAccount}
            disabled={deletingAccount || auth.isLoading}
            style={({ pressed }) => [
              styles.deleteAccountRow,
              pressed && styles.rowPressed,
            ]}
            accessibilityRole="button"
          >
            {deletingAccount ? (
              <ActivityIndicator size="small" color="#999" />
            ) : (
              <Text style={styles.deleteAccountText}>Delete account</Text>
            )}
          </Pressable>
        </SafeAreaView>
      </ScrollView>

      {/* Join with code dialog */}
      <Portal>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.dialogKeyboardAvoider}
          pointerEvents="box-none"
        >
          <Dialog
            visible={joinDialogVisible}
            onDismiss={handleCloseJoinDialog}
            style={styles.dialog}
          >
            <Dialog.Title>Join album</Dialog.Title>
            <Dialog.Content>
              <TextInput
                mode="outlined"
                value={joinCode}
                onChangeText={handleJoinCodeChange}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
                placeholder="ABCD1234"
              />
              <Text style={styles.dialogHelper}>
                Enter the 8-character album code
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={handleCloseJoinDialog} textColor="#666">
                Cancel
              </Button>
              <Button
                onPress={handleJoin}
                disabled={joinCode.length !== 8 || joinAlbum.isPending}
                loading={joinAlbum.isPending}
              >
                Join
              </Button>
            </Dialog.Actions>
          </Dialog>
        </KeyboardAvoidingView>
      </Portal>
    </View>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  safeArea: {
    flexGrow: 1,
  },
  spacer: {
    flexGrow: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    marginBottom: 20,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "BowlbyOneSC",
    fontSize: 28,
    color: "#000",
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
  },
  profileEmail: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  profileEmailMuted: {
    color: "#999",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  statTile: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: "#000",
  },
  statSpinner: {
    height: 29,
  },
  statLabel: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 12,
    color: "#999",
    letterSpacing: 1.2,
    fontWeight: "600",
    marginTop: 28,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#e9e9e9",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    color: "#000",
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e0e0e0",
    marginLeft: 64,
  },
  versionText: {
    fontSize: 15,
    color: "#999",
  },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 32,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#f5f5f5",
  },
  signOutText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.error,
  },
  deleteAccountRow: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 8,
    minHeight: 40,
    justifyContent: "center",
  },
  deleteAccountText: {
    fontSize: 13,
    color: "#999",
    textDecorationLine: "underline",
  },
  dialog: {
    backgroundColor: "#fff",
    borderRadius: 16,
  },
  dialogKeyboardAvoider: {
    flex: 1,
    justifyContent: "center",
  },
  dialogHelper: {
    fontSize: 12,
    color: "#999",
    marginTop: 6,
  },
});
