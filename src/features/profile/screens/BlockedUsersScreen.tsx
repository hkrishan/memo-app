/**
 * BlockedUsersScreen — manage the current user's block list (App Store 1.2).
 * Modal screen reached from Profile → Privacy → Blocked users: one row per
 * blocked user (avatar + name) with an Unblock button.
 */

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  Platform,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import SafeAreaView from "@/components/layout/SafeAreaView";
import Avatar from "@/components/ui/Avatar";
import { notify } from "@/components/global";
import {
  BlockedUser,
  useBlockedUsers,
  useUnblockUser,
} from "@/features/moderation";
import { color, radius, type } from "@/lib/tokens";

const BlockedUsersScreen = () => {
  const router = useRouter();
  const { data: blocked, isLoading, isError, refetch } = useBlockedUsers();
  const unblockUser = useUnblockUser();

  // Only the tapped row shows a spinner
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleUnblock = useCallback(
    (user: BlockedUser) => {
      if (unblockUser.isPending) return;
      setUnblockingId(user.userId);
      unblockUser.mutate(user.userId, {
        onSuccess: () => {
          notify.success("Unblocked", `${user.name || "User"} has been unblocked`);
        },
        onError: () => {
          notify.error("Couldn't unblock", "Please try again");
        },
        onSettled: () => {
          setUnblockingId(null);
        },
      });
    },
    [unblockUser],
  );

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
            <Text style={styles.headerTitle}>Blocked</Text>
          </View>

          <Text style={styles.helperText}>
            Blocked people can't interact with you, and you won't see their
            messages, photos, or comments.
          </Text>

          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" color="#999" />
            </View>
          ) : isError ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Couldn't load blocked users</Text>
              <Pressable
                onPress={() => refetch()}
                style={({ pressed }) => pressed && styles.rowPressed}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : !blocked || blocked.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="ban-outline" size={36} color="#ccc" />
              <Text style={styles.emptyText}>You haven't blocked anyone</Text>
            </View>
          ) : (
            <View>
              {blocked.map((user, index) => (
                <View key={user.userId}>
                  {index > 0 && <View style={styles.rowDivider} />}
                  <View style={styles.row}>
                    <Avatar
                      user={{
                        userId: user.userId,
                        name: user.name,
                        avatarUrl: user.avatarUrl,
                      }}
                      size={44}
                    />
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {user.name || "Unknown"}
                    </Text>
                    <Pressable
                      onPress={() => handleUnblock(user)}
                      disabled={unblockUser.isPending}
                      style={({ pressed }) => [
                        styles.unblockButton,
                        pressed && styles.rowPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Unblock ${user.name || "user"}`}
                    >
                      {unblockingId === user.userId ? (
                        <ActivityIndicator size="small" color="#666" />
                      ) : (
                        <Text style={styles.unblockLabel}>Unblock</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </SafeAreaView>
      </ScrollView>
    </View>
  );
};

export default BlockedUsersScreen;

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
    paddingHorizontal: 24,
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
    ...type.title,
    color: color.textPrimary,
  },
  helperText: {
    fontSize: 13,
    color: color.textTertiary,
    lineHeight: 18,
    marginBottom: 12,
  },
  centered: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    color: "#999",
  },
  retryText: {
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
    textDecorationLine: "underline",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 14,
    minHeight: 64,
  },
  rowPressed: {
    opacity: 0.5,
  },
  rowTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: color.textPrimary,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
  },
  unblockButton: {
    minWidth: 76,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: color.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  unblockLabel: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: color.textPrimary,
  },
});
