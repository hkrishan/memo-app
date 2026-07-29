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
import { color, radius, scriptType, type } from "@/lib/tokens";

const FEEDBACK_URL = "mailto:hugo@pollflow.io?subject=Memo%20Feedback";

type SectionRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress?: () => void;
  right?: React.ReactNode;
  showChevron?: boolean;
};

// The list language: bare outline icon, title, hairline underneath —
// no card fills or icon tiles.
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
    <Ionicons name={icon} size={22} color={color.textPrimary} />
    <Text style={styles.rowTitle}>{title}</Text>
    {right ??
      (showChevron && onPress ? (
        <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
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

  const handleOpenPremium = useCallback(() => {
    router.push("/premium");
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
          "Request sent",
          "The album owner will review your request",
        );
      },
      onError: () => {
        notify.error("Couldn't join", "Check the code and try again");
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
              notify.success("Cache cleared", "Freed up local storage");
            } catch {
              notify.error("Couldn't clear cache", "Please try again");
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
      notify.error("Couldn't open mail", "Please try again");
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
        <SafeAreaView edges={Platform.OS === "android" ? ["top", "bottom"] : ["bottom"]} style={styles.safeArea}>
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
              <Ionicons name="chevron-down" size={26} color={color.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Profile</Text>
          </View>
          <View style={styles.rule} />

          {/* Profile row — flat, bounded by rules */}
          <Pressable
            onPress={handleOpenUser}
            style={({ pressed }) => [
              styles.profileRow,
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
            <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
          </Pressable>
          <View style={styles.rule} />

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              {albumsQuery.isLoading ? (
                <ActivityIndicator size="small" color={color.textTertiary} style={styles.statSpinner} />
              ) : (
                <Text style={styles.statNumber}>{albumCount ?? "–"}</Text>
              )}
              <Text style={styles.statLabel}>Albums</Text>
            </View>
            <View style={styles.statRule} />
            <View style={styles.statCell}>
              {albumsQuery.isLoading ? (
                <ActivityIndicator size="small" color={color.textTertiary} style={styles.statSpinner} />
              ) : (
                <Text style={styles.statNumber}>{friendCount ?? "–"}</Text>
              )}
              <Text style={styles.statLabel}>Friends</Text>
            </View>
          </View>
          <View style={styles.rule} />

          {/* Upgrade — the one dark, floating moment on the page */}
          <Pressable
            onPress={handleOpenPremium}
            style={({ pressed }) => [
              styles.premiumBanner,
              pressed && styles.rowPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Upgrade to Memo Premium"
          >
            <Ionicons name="sparkles" size={20} color="#fff" />
            <View style={styles.premiumText}>
              {/* Wordmark: "Memo" in the app face, "Premium" in serif italic */}
              <Text style={styles.premiumTitle}>
                Memo <Text style={styles.premiumTitleAccent}>Premium</Text>
              </Text>
              <Text style={styles.premiumSubtitle}>
                Unlock full access — upgrade now
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color="rgba(255,255,255,0.55)"
            />
          </Pressable>

          {/* Memories */}
          <Text style={styles.sectionLabel}>Memories</Text>
          <SectionRow
            icon="add-circle-outline"
            title="New album"
            onPress={handleNewAlbum}
          />
          <View style={styles.rule} />
          <SectionRow
            icon="key-outline"
            title="Join with code"
            onPress={handleOpenJoinDialog}
          />
          <View style={styles.rule} />

          {/* Privacy */}
          <Text style={styles.sectionLabel}>Privacy</Text>
          <SectionRow
            icon="ban-outline"
            title="Blocked users"
            onPress={handleOpenBlockedUsers}
          />
          <View style={styles.rule} />

          {/* App */}
          <Text style={styles.sectionLabel}>App</Text>
          <SectionRow
            icon="trash-outline"
            title="Clear image cache"
            onPress={handleClearCache}
          />
          <View style={styles.rule} />
          <SectionRow
            icon="mail-outline"
            title="Send feedback"
            onPress={handleSendFeedback}
          />
          <View style={styles.rule} />
          <SectionRow
            icon="information-circle-outline"
            title="Version"
            right={
              <Text style={styles.versionText}>
                {Application.nativeApplicationVersion ?? "dev"}
              </Text>
            }
          />
          <View style={styles.rule} />

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
              <ActivityIndicator size="small" color={color.danger} />
            ) : (
              <Ionicons
                name="log-out-outline"
                size={20}
                color={color.danger}
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
              <ActivityIndicator size="small" color={color.textTertiary} />
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
              <Button onPress={handleCloseJoinDialog} textColor={color.textSecondary}>
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

const GUTTER = 24;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: GUTTER,
  },
  safeArea: {
    flexGrow: 1,
  },
  spacer: {
    flexGrow: 1,
  },
  // The structural device of the page: one hairline, everywhere
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...type.title,
    color: color.textPrimary,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    gap: 16,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 24,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    letterSpacing: -0.4,
    color: color.textPrimary,
  },
  profileEmail: {
    fontSize: 14,
    color: color.textSecondary,
    marginTop: 3,
  },
  profileEmailMuted: {
    color: color.textTertiary,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
  },
  statRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: color.separator,
  },
  statNumber: {
    fontSize: 26,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    letterSpacing: -0.5,
    color: color.textPrimary,
  },
  statSpinner: {
    height: 31,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: color.textTertiary,
    marginTop: 6,
  },
  premiumBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: radius.xl,
    backgroundColor: color.bgDark,
    // Only element on the page that floats
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  premiumText: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: 16,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
  },
  premiumTitleAccent: {
    ...scriptType(16),
    color: "#fff",
  },
  premiumSubtitle: {
    fontSize: 12.5,
    color: color.onDarkSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    ...type.overline,
    color: color.textTertiary,
    marginTop: 36,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 14,
  },
  rowPressed: {
    opacity: 0.5,
  },
  rowTitle: {
    flex: 1,
    fontSize: 16,
    color: color.textPrimary,
  },
  versionText: {
    fontSize: 15,
    color: color.textTertiary,
  },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 32,
    marginBottom: 4,
    paddingVertical: 14,
  },
  signOutText: {
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: color.danger,
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
    color: color.textTertiary,
    textDecorationLine: "underline",
  },
  dialog: {
    backgroundColor: color.bg,
    borderRadius: radius.lg,
  },
  dialogKeyboardAvoider: {
    flex: 1,
    justifyContent: "center",
  },
  dialogHelper: {
    fontSize: 12,
    color: color.textTertiary,
    marginTop: 6,
  },
});
