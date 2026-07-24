/**
 * ActivityScreen — the notification/activity center. Modal screen opened
 * from the home top bar's bell: an infinite, pull-to-refresh list of the
 * user's notifications. Opening it marks everything read (which clears
 * the bell badge); rows that were unread on arrival keep their unread
 * styling for the rest of the visit.
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  View,
  Platform,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import SafeAreaView from "@/components/layout/SafeAreaView";
import { formatRelativeTime } from "@/features/album/components/photoSocial/socialUtils";
import { extractUrlFromNotificationData } from "@/features/notifications/push";
import { ActivityNotification } from "./activity.api";
import {
  useActivityFeedQuery,
  useMarkActivityReadMutation,
} from "./activity.queries";

// Cast FlashList to bypass type definition mismatch with installed version
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NotificationsFlashList = FlashList as any;

const iconForNotification = (
  data: Record<string, unknown> | null,
): keyof typeof Ionicons.glyphMap => {
  const type = typeof data?.type === "string" ? data.type : "";
  if (!type) return "notifications";
  if (type === "moment") return "flash";
  if (type.includes("comment")) return "chatbubble-ellipses";
  if (type.includes("chat")) return "chatbubble";
  if (type.includes("like")) return "heart";
  if (type.includes("member") || type.includes("join")) return "person-add";
  return "notifications";
};

interface ActivityRowProps {
  item: ActivityNotification;
  unread: boolean;
  onPress: (item: ActivityNotification) => void;
}

const ActivityRow = ({ item, unread, onPress }: ActivityRowProps) => {
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.row,
        unread && styles.rowUnread,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowIconWrap}>
        <Ionicons
          name={iconForNotification(item.data)}
          size={18}
          color="#111"
        />
      </View>
      <View style={styles.rowContent}>
        <Text
          style={[styles.rowTitle, unread && styles.rowTitleUnread]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        {!!item.body && (
          <Text style={styles.rowBody} numberOfLines={2}>
            {item.body}
          </Text>
        )}
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.rowTime}>{formatRelativeTime(item.createdAt)}</Text>
        {unread && <View style={styles.unreadDot} />}
      </View>
    </Pressable>
  );
};

const ActivityScreen = () => {
  const router = useRouter();
  const {
    data,
    refetch,
    isRefetching,
    isLoading,
    isError,
    isSuccess,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useActivityFeedQuery();
  const { mutate: markAllRead } = useMarkActivityReadMutation();

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.notifications) ?? [],
    [data],
  );

  // Once, after the first successful load: mark everything read so the
  // bell badge clears. Snapshot which loaded rows were unread first —
  // the mark-read invalidation refetches with readAt set, and the rows
  // the user came to see must not lose their unread styling mid-visit.
  const markedRef = useRef(false);
  const unreadOnArrivalRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isSuccess || markedRef.current) return;
    markedRef.current = true;
    unreadOnArrivalRef.current = new Set(
      items
        .filter((item) => item.readAt === null)
        .map((item) => item.notificationId),
    );
    markAllRead();
  }, [isSuccess, items, markAllRead]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleRowPress = useCallback(
    (item: ActivityNotification) => {
      const url = extractUrlFromNotificationData(item.data);
      if (!url) return;
      try {
        router.push(url as Parameters<typeof router.push>[0]);
      } catch (error) {
        if (__DEV__) {
          console.warn(
            "[activity] Failed to open notification url:",
            url,
            error,
          );
        }
      }
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ActivityNotification }) => (
      <ActivityRow
        item={item}
        unread={
          item.readAt === null ||
          unreadOnArrivalRef.current.has(item.notificationId)
        }
        onPress={handleRowPress}
      />
    ),
    [handleRowPress],
  );

  const keyExtractor = useCallback(
    (item: ActivityNotification) => item.notificationId,
    [],
  );

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const listEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#999" />
        </View>
      );
    }
    if (isError) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Couldn't load your activity</Text>
          <Pressable
            onPress={() => refetch()}
            style={({ pressed }) => pressed && styles.rowPressed}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.centered}>
        <Ionicons name="notifications-off-outline" size={36} color="#ccc" />
        <Text style={styles.emptyText}>No activity yet</Text>
      </View>
    );
  }, [isLoading, isError, refetch]);

  const listFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#999" />
      </View>
    );
  }, [isFetchingNextPage]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
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
          <Text style={styles.headerTitle}>Activity</Text>
        </View>

        <NotificationsFlashList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              // isRefetching also flips during fetchNextPage; only show
              // the pull spinner for genuine top refreshes
              refreshing={isRefetching && !isFetchingNextPage}
              onRefresh={refetch}
              tintColor="#999"
            />
          }
        />
      </SafeAreaView>
    </View>
  );
};

export default ActivityScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff",
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 20,
    marginBottom: 12,
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
  listContent: {
    paddingBottom: 32,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  rowUnread: {
    backgroundColor: "rgba(255, 59, 48, 0.05)",
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    color: "#000",
  },
  rowTitleUnread: {
    fontWeight: "700",
  },
  rowBody: {
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
    marginTop: 2,
  },
  rowMeta: {
    alignItems: "flex-end",
    gap: 5,
  },
  rowTime: {
    fontSize: 12,
    color: "#999",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
  },
  centered: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 64,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 15,
    color: "#999",
  },
  retryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
  },
  footer: {
    paddingVertical: 20,
    alignItems: "center",
  },
});
