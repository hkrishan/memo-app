/**
 * PageSearchScreen — page discovery for the feed. Search public pages by
 * handle/title; private pages are shown too but can only be requested (the
 * page's members approve). The trailing button reflects the viewer's
 * relationship and drives follow / request / unfollow.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import SafeAreaView from "@/components/layout/SafeAreaView";
import { notify } from "@/components/global";
import { stableCacheKey } from "@/lib/imageCache";
import {
  useFollowPageMutation,
  usePageSearchQuery,
  useUnfollowPageMutation,
} from "../api/search.queries";
import { PageSearchResult } from "../types/search.types";

const DEBOUNCE_MS = 300;

const PageSearchScreen: React.FC = () => {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  // Debounce the network query off the raw input
  useEffect(() => {
    const id = setTimeout(() => setQuery(input), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [input]);

  const trimmed = query.trim();
  const { data, isLoading, isError, refetch } = usePageSearchQuery(trimmed);
  const follow = useFollowPageMutation();
  const unfollow = useUnfollowPageMutation();

  const results = data?.results ?? [];

  const handleAction = useCallback(
    (page: PageSearchResult) => {
      const vars = {
        albumId: page.albumId,
        pageId: page.pageId,
        isPublic: page.isPublic,
        prevStatus: page.myStatus,
      };
      switch (page.myStatus) {
        case "none":
          follow.mutate(vars,
        {
          onError: () => {
            notify.error("Couldn't update follow", "Please try again");
          },
        },
      );
          break;
        case "accepted":
          Alert.alert("Unfollow page?", `Stop following @${page.pageHandle}?`, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Unfollow",
              style: "destructive",
              onPress: () =>
                unfollow.mutate(vars,
        {
          onError: () => {
            notify.error("Couldn't update follow", "Please try again");
          },
        },
      ),
            },
          ]);
          break;
        case "pending":
          Alert.alert(
            "Cancel request?",
            `Withdraw your follow request to @${page.pageHandle}?`,
            [
              { text: "Keep", style: "cancel" },
              {
                text: "Cancel request",
                style: "destructive",
                onPress: () =>
                unfollow.mutate(vars,
        {
          onError: () => {
            notify.error("Couldn't update follow", "Please try again");
          },
        },
      ),
              },
            ],
          );
          break;
        case "member":
          break;
      }
    },
    [follow, unfollow],
  );

  const handleOpen = useCallback(
    (page: PageSearchResult) => {
      // Anyone who can view the page (member, accepted follower, or any
      // public page) opens the standalone page view — it adapts its chrome
      // to the viewer (members get the full FAB/settings version). Private
      // pages you don't follow have nothing to open; the Request button is
      // the interaction.
      const viewable =
        page.isPublic ||
        page.myStatus === "member" ||
        page.myStatus === "accepted";
      if (viewable) {
        router.push(`/page/${page.albumId}/${page.pageId}`);
      }
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: PageSearchResult }) => (
      <PageRow item={item} onAction={handleAction} onOpen={handleOpen} />
    ),
    [handleAction, handleOpen],
  );

  const keyExtractor = useCallback((item: PageSearchResult) => item.pageId, []);

  const listEmpty = useMemo(() => {
    if (trimmed.length < 2) {
      return (
        <View style={styles.stateWrap}>
          <View style={styles.stateIcon}>
            <Ionicons name="search" size={26} color="#8e8e93" />
          </View>
          <Text style={styles.stateTitle}>Find pages</Text>
          <Text style={styles.stateBody}>
            Search public pages, or request to follow private ones.
          </Text>
        </View>
      );
    }
    if (isLoading) {
      return (
        <View style={styles.stateWrap}>
          <ActivityIndicator color="#8e8e93" />
        </View>
      );
    }
    if (isError) {
      return (
        <View style={styles.stateWrap}>
          <Text style={styles.stateTitle}>Couldn&apos;t search</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.stateWrap}>
        <Text style={styles.stateTitle}>No pages found</Text>
        <Text style={styles.stateBody}>Try a different name or @handle.</Text>
      </View>
    );
  }, [trimmed, isLoading, isError, refetch]);

  return (
    <SafeAreaView
      edges={Platform.OS === "android" ? ["top", "bottom"] : ["bottom"]}
      style={styles.safeArea}
    >
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#8e8e93" />
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Search pages"
            placeholderTextColor="#9a9aa0"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {input.length > 0 && (
            <Pressable onPress={() => setInput("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#8e8e93" />
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>

      <FlatList
        data={results}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={
          results.length === 0 ? styles.emptyContent : styles.listContent
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </SafeAreaView>
  );
};

// --- Row ---------------------------------------------------------------

const ACTION_LABEL: Record<
  PageSearchResult["myStatus"],
  { label: string; primary: boolean }
> = {
  none: { label: "Follow", primary: true }, // overridden for private below
  accepted: { label: "Following", primary: false },
  pending: { label: "Requested", primary: false },
  member: { label: "Member", primary: false },
};

const PageRow = React.memo<{
  item: PageSearchResult;
  onAction: (item: PageSearchResult) => void;
  onOpen: (item: PageSearchResult) => void;
}>(({ item, onAction, onOpen }) => {
  const title = item.pageTitle?.trim() || item.pageHandle;
  const action =
    item.myStatus === "none" && !item.isPublic
      ? { label: "Request", primary: true }
      : ACTION_LABEL[item.myStatus];
  const disabled = item.myStatus === "member";

  return (
    <Pressable style={styles.row} onPress={() => onOpen(item)}>
      {item.coverUrl ? (
        <Image
          source={{ uri: item.coverUrl, cacheKey: stableCacheKey(item.coverUrl) }}
          style={styles.cover}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Ionicons name="albums" size={20} color="#8e8e93" />
        </View>
      )}

      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowHandle} numberOfLines={1}>
          @{item.pageHandle}
        </Text>
        <View style={styles.metaRow}>
          {!item.isPublic && (
            <View style={styles.privateTag}>
              <Ionicons name="lock-closed" size={10} color="#8e8e93" />
              <Text style={styles.privateLabel}>Private</Text>
            </View>
          )}
          <Text style={styles.followers}>
            {item.followerCount}{" "}
            {item.followerCount === 1 ? "follower" : "followers"}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => onAction(item)}
        disabled={disabled}
        hitSlop={6}
        style={[
          styles.actionBtn,
          action.primary ? styles.actionPrimary : styles.actionSecondary,
          disabled && styles.actionDisabled,
        ]}
      >
        <Text
          style={[
            styles.actionLabel,
            action.primary ? styles.actionLabelPrimary : styles.actionLabelSec,
          ]}
        >
          {action.label}
        </Text>
      </Pressable>
    </Pressable>
  );
});
PageRow.displayName = "PageRow";

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F1F1F3",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  input: {
    flex: 1,
    color: "#111",
    fontSize: 16,
    padding: 0,
  },
  cancel: {
    color: "#6e6e73",
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  listContent: {
    paddingBottom: 32,
  },
  emptyContent: {
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cover: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#F1F1F3",
  },
  coverFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    justifyContent: "center",
  },
  rowTitle: {
    color: "#111",
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  rowHandle: {
    color: "#8e8e93",
    fontSize: 13,
    marginTop: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },
  privateTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  privateLabel: {
    color: "#6e6e73",
    fontSize: 11,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  followers: {
    color: "#8e8e93",
    fontSize: 12,
  },
  actionBtn: {
    minWidth: 92,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  actionPrimary: {
    backgroundColor: "#111",
  },
  actionSecondary: {
    backgroundColor: "#E9E9EB",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.08)",
  },
  actionDisabled: {
    opacity: 0.6,
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
  actionLabelPrimary: {
    color: "#fff",
  },
  actionLabelSec: {
    color: "#111",
  },
  stateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 48,
    paddingTop: 120,
  },
  stateIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#F1F1F3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  stateTitle: {
    color: "#111",
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    marginBottom: 6,
  },
  stateBody: {
    color: "#8e8e93",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: "#E9E9EB",
  },
  retryLabel: {
    color: "#111",
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
});

export default PageSearchScreen;
