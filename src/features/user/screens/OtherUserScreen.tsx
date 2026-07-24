/**
 * OtherUserScreen — modal profile for ANOTHER user (opened e.g. from an
 * album's member list). Shows their avatar/name plus the App Store 1.2
 * safety actions: report user, and block/unblock with confirmation.
 * The user's identity arrives via route params (there is no public
 * get-user-by-id endpoint).
 */

import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  Platform,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import SafeAreaView from "@/components/layout/SafeAreaView";
import Avatar from "@/components/ui/Avatar";
import { notify } from "@/components/global";
import {
  ReportContentSheet,
  useBlockedUsers,
  useBlockUser,
  useUnblockUser,
} from "@/features/moderation";
import { theme } from "@/lib/theme";

const AVATAR_SIZE = 140;

const firstParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const OtherUserScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{
    userId: string;
    name?: string;
    avatarUrl?: string;
  }>();

  const userId = firstParam(params.userId) ?? "";
  const name = firstParam(params.name) ?? "Member";
  const avatarUrl = firstParam(params.avatarUrl);

  const { data: blockedUsers, isLoading: isLoadingBlocks } = useBlockedUsers();
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();

  const [reportOpen, setReportOpen] = useState(false);

  const isBlocked = useMemo(
    () => (blockedUsers ?? []).some((u) => u.userId === userId),
    [blockedUsers, userId],
  );

  const avatarUser = useMemo(
    () => ({ userId, name, avatarUrl: avatarUrl ?? null }),
    [userId, name, avatarUrl],
  );

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleOpenReport = useCallback(() => setReportOpen(true), []);
  const handleCloseReport = useCallback(() => setReportOpen(false), []);

  const handleBlock = useCallback(() => {
    if (blockUser.isPending) return;
    Alert.alert(
      `Block ${name}?`,
      "You won't see their messages, photos, or comments anymore, and they won't be able to interact with you. They won't be notified.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            blockUser.mutate(
              { userId, name, avatarUrl },
              {
                onSuccess: () => {
                  notify.success("Blocked", `${name} has been blocked`);
                },
                onError: () => {
                  notify.error("Couldn't Block", "Please try again");
                },
              },
            );
          },
        },
      ],
    );
  }, [blockUser, userId, name, avatarUrl]);

  const handleUnblock = useCallback(() => {
    if (unblockUser.isPending) return;
    unblockUser.mutate(userId, {
      onSuccess: () => {
        notify.success("Unblocked", `${name} has been unblocked`);
      },
      onError: () => {
        notify.error("Couldn't Unblock", "Please try again");
      },
    });
  }, [unblockUser, userId, name]);

  const blockPending = blockUser.isPending || unblockUser.isPending;

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
              <Ionicons name="chevron-down" size={26} color="#000" />
            </Pressable>
            <Text style={styles.headerTitle}>Profile</Text>
          </View>

          {/* Avatar + name */}
          <View style={styles.avatarSection}>
            <Avatar user={avatarUser} size={AVATAR_SIZE} />
            <Text
              style={styles.name}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {name}
            </Text>
            {isBlocked && (
              <View style={styles.blockedBadge}>
                <Ionicons name="ban" size={13} color="#fff" />
                <Text style={styles.blockedBadgeText}>Blocked</Text>
              </View>
            )}
          </View>

          {/* Safety */}
          <Text style={styles.sectionLabel}>SAFETY</Text>
          <View style={styles.sectionCard}>
            <Pressable
              onPress={handleOpenReport}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Report ${name}`}
            >
              <View style={styles.rowIconContainer}>
                <Ionicons name="flag-outline" size={18} color="#000" />
              </View>
              <Text style={styles.rowTitle}>Report user</Text>
              <Ionicons name="chevron-forward" size={18} color="#999" />
            </Pressable>
            <View style={styles.rowDivider} />
            <Pressable
              onPress={isBlocked ? handleUnblock : handleBlock}
              disabled={blockPending || isLoadingBlocks}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel={
                isBlocked ? `Unblock ${name}` : `Block ${name}`
              }
            >
              <View style={styles.rowIconContainer}>
                <Ionicons
                  name="ban-outline"
                  size={18}
                  color={isBlocked ? "#000" : theme.colors.error}
                />
              </View>
              <Text
                style={[styles.rowTitle, !isBlocked && styles.rowTitleDanger]}
              >
                {isBlocked ? "Unblock user" : "Block user"}
              </Text>
              {(blockPending || isLoadingBlocks) && (
                <ActivityIndicator size="small" color="#999" />
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </ScrollView>

      <ReportContentSheet
        visible={reportOpen}
        target={{ targetType: "user", targetId: userId }}
        onClose={handleCloseReport}
      />
    </View>
  );
};

export default OtherUserScreen;

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
    fontSize: 22,
    fontWeight: "700",
    color: "#000",
  },
  avatarSection: {
    alignItems: "center",
    marginTop: 8,
  },
  name: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 10,
    color: "#000",
  },
  blockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#999",
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 24,
    marginTop: 8,
  },
  blockedBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
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
    minHeight: 64,
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
  rowTitleDanger: {
    color: theme.colors.error,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e0e0e0",
    marginLeft: 64,
  },
});
