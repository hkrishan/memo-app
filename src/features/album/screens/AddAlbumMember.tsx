/**
 * Invite screen — the album's invite surface, centered on the QR ticket.
 * One scroll: the QR invite card (from the album's shareable invite link),
 * share / copy-link actions, the join code as a quiet fallback, requests
 * waiting for approval, and the member list.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  useAlbumInviteLinkQuery,
  useGetAlbumMembersQuery,
  useGetAlbumPendingJoinRequestsQuery,
  useGetAlbumQuery,
  useHandleAlbumJoinRequestMutation,
  useRevokeInviteMutation,
} from "../api/album.queries";
import { AlbumJoinRequest } from "../types/album.types";
import { selectUser, useAuthStore } from "@/features/auth/store/authStore";
import { notify } from "@/components/global";
import Avatar from "@/components/ui/Avatar";
import AlbumCodeBanner from "../components/AlbumCodeBanner";
import AlbumMembers from "../components/AlbumMembers";
import InviteQrCard from "../components/invite/InviteQrCard";

const PAGE_BG = "#F2F2F0";

const AddAlbumMemberScreen = () => {
  const albumId = useLocalSearchParams().albumId as string;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: album, refetch: refetchAlbum } = useGetAlbumQuery(albumId);
  const inviteLink = useAlbumInviteLinkQuery(albumId);
  const {
    data: members,
    isLoading: isLoadingMembers,
    refetch: refetchMembers,
  } = useGetAlbumMembersQuery(albumId);
  const { data: pendingRequests, refetch: refetchPending } =
    useGetAlbumPendingJoinRequestsQuery(albumId);

  const handleJoinRequest = useHandleAlbumJoinRequestMutation(albumId);
  const revokeInvite = useRevokeInviteMutation(albumId);
  const currentUser = useAuthStore(selectUser);
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isOwner =
    !!album && !!currentUser && album.ownerId === currentUser.id;

  const [linkCopied, setLinkCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const inviteUrl = inviteLink.data?.url ?? null;
  const albumTitle = album?.title ?? "";

  const handleShare = useCallback(async () => {
    if (!inviteUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const message = albumTitle
      ? `Join “${albumTitle}” on Memo`
      : "Join my album on Memo";
    try {
      await Share.share(
        Platform.OS === "ios"
          ? { message, url: inviteUrl }
          : { message: `${message}\n${inviteUrl}` },
      );
    } catch {
      // Share sheet dismissed — nothing to do
    }
  }, [inviteUrl, albumTitle]);

  const handleCopyLink = useCallback(async () => {
    if (!inviteUrl) return;
    await Clipboard.setStringAsync(inviteUrl);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLinkCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setLinkCopied(false), 2000);
  }, [inviteUrl]);

  const handleRequestDecision = useCallback(
    (requestId: string, action: "accept" | "reject") => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActingRequestId(requestId);
      handleJoinRequest.mutate(
        { requestId, action },
        { onSettled: () => setActingRequestId(null) },
      );
    },
    [handleJoinRequest],
  );

  const refetchInviteLink = inviteLink.refetch;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchAlbum(),
        refetchMembers(),
        refetchPending(),
        refetchInviteLink(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchAlbum, refetchMembers, refetchPending, refetchInviteLink]);

  const inviteId = inviteLink.data?.inviteId ?? null;

  const handleResetLink = useCallback(() => {
    if (!inviteId || revokeInvite.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    notify.popup({
      type: "warning",
      title: "Reset invite link?",
      message:
        "The current link and QR code will stop working. A new one is created right away.",
      primaryAction: {
        label: "Reset link",
        onPress: () => {
          revokeInvite.mutate(
            { inviteId },
            {
              onSuccess: () => {
                // Get-or-create mints a fresh link on refetch
                refetchInviteLink();
              },
              onError: () => {
                notify.error("Couldn't reset the link", "Please try again");
              },
            },
          );
        },
      },
      secondaryAction: {
        label: "Cancel",
        onPress: () => {},
      },
    });
  }, [inviteId, revokeInvite, refetchInviteLink]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Text style={styles.headerTitle}>Invite</Text>
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.closeButtonPressed,
          ]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close invite screen"
        >
          <Ionicons name="close" size={20} color="#111" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#111"
          />
        }
      >
        {/* QR ticket — the invite itself */}
        <InviteQrCard
          albumTitle={albumTitle}
          url={inviteUrl}
          isLoading={inviteLink.isPending || inviteLink.isFetching}
          isError={inviteLink.isError}
          onRetry={inviteLink.refetch}
        />

        {/* Link actions */}
        <View style={styles.actions}>
          <Pressable
            onPress={handleShare}
            disabled={!inviteUrl}
            style={({ pressed }) => [
              styles.sharePill,
              pressed && styles.sharePillPressed,
              !inviteUrl && styles.pillDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Share invite link"
            accessibilityState={{ disabled: !inviteUrl }}
          >
            <Ionicons name="arrow-redo-outline" size={18} color="#fff" />
            <Text style={styles.sharePillText}>Share invite link</Text>
          </Pressable>

          <Pressable
            onPress={handleCopyLink}
            disabled={!inviteUrl}
            style={({ pressed }) => [
              styles.copyPill,
              pressed && styles.copyPillPressed,
              !inviteUrl && styles.pillDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Copy invite link"
            accessibilityState={{ disabled: !inviteUrl }}
          >
            <Ionicons
              name={linkCopied ? "checkmark" : "link-outline"}
              size={18}
              color="#111"
            />
            <Text style={styles.copyPillText}>
              {linkCopied ? "Link copied" : "Copy link"}
            </Text>
          </Pressable>

          {inviteLink.data && (
            <Text style={styles.roleCaption}>
              Anyone with this link can join as a {inviteLink.data.role}
            </Text>
          )}

          {/* Owner-only: turn the current link off and mint a fresh one */}
          {isOwner && inviteId ? (
            <Pressable
              onPress={handleResetLink}
              disabled={revokeInvite.isPending}
              hitSlop={8}
              style={({ pressed }) => [
                styles.resetLink,
                pressed && styles.resetLinkPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Reset invite link"
              accessibilityState={{ disabled: revokeInvite.isPending }}
            >
              {revokeInvite.isPending ? (
                <ActivityIndicator size="small" color="#9C9C99" />
              ) : (
                <Text style={styles.resetLinkText}>Reset link</Text>
              )}
            </Pressable>
          ) : null}
        </View>

        {/* Join code fallback */}
        {album?.albumCode ? (
          <View style={styles.codeSection}>
            <AlbumCodeBanner code={album.albumCode} />
          </View>
        ) : null}

        {/* Requests waiting for approval */}
        {pendingRequests && pendingRequests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Waiting to join</Text>
            <View style={styles.requestGroup}>
              {pendingRequests.map((request, index) => (
                <RequestRow
                  key={request.requestId}
                  request={request}
                  isFirst={index === 0}
                  isActing={actingRequestId === request.requestId}
                  onApprove={() =>
                    handleRequestDecision(request.requestId, "accept")
                  }
                  onDecline={() =>
                    handleRequestDecision(request.requestId, "reject")
                  }
                />
              ))}
            </View>
          </View>
        )}

        {/* Members */}
        <View style={styles.section}>
          {isLoadingMembers ? (
            <View style={styles.membersLoading}>
              <ActivityIndicator size="small" color="#111" />
            </View>
          ) : (
            <AlbumMembers members={members ?? []} showInviteRow={false} />
          )}
        </View>
      </ScrollView>
    </View>
  );
};

type RequestRowProps = {
  request: AlbumJoinRequest;
  isFirst: boolean;
  isActing: boolean;
  onApprove: () => void;
  onDecline: () => void;
};

const RequestRow = ({
  request,
  isFirst,
  isActing,
  onApprove,
  onDecline,
}: RequestRowProps) => {
  const name = request.requester?.name ?? "Someone";

  return (
    <View style={[styles.requestRow, !isFirst && styles.requestRowDivided]}>
      <Avatar
        user={
          request.requester ?? {
            userId: request.requesterId,
            name: "Unknown",
            avatarUrl: null,
          }
        }
        size={44}
      />
      <View style={styles.requestInfo}>
        <Text style={styles.requestName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.requestSubtitle}>wants to join</Text>
      </View>
      <View style={styles.requestActions}>
        <Pressable
          onPress={onApprove}
          disabled={isActing}
          style={({ pressed }) => [
            styles.approveButton,
            pressed && styles.approveButtonPressed,
            isActing && styles.requestButtonActing,
          ]}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`Approve ${name}`}
          accessibilityState={{ disabled: isActing }}
        >
          <Ionicons name="checkmark" size={20} color="#fff" />
        </Pressable>
        <Pressable
          onPress={onDecline}
          disabled={isActing}
          style={({ pressed }) => [
            styles.declineButton,
            pressed && styles.declineButtonPressed,
            isActing && styles.requestButtonActing,
          ]}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`Decline ${name}`}
          accessibilityState={{ disabled: isActing }}
        >
          <Ionicons name="close" size={20} color="#111" />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#111",
    letterSpacing: -0.4,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E7E7E4",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonPressed: {
    backgroundColor: "#DBDBD8",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  actions: {
    marginTop: 20,
    gap: 10,
  },
  sharePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#000",
  },
  sharePillPressed: {
    backgroundColor: "#2A2A2A",
  },
  sharePillText: {
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#fff",
  },
  copyPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: "#111",
  },
  copyPillPressed: {
    backgroundColor: "#E7E7E4",
  },
  copyPillText: {
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#111",
  },
  pillDisabled: {
    opacity: 0.4,
  },
  roleCaption: {
    fontSize: 12,
    color: "#9C9C99",
    textAlign: "center",
    marginTop: 2,
  },
  resetLink: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
    marginTop: 4,
    paddingHorizontal: 8,
  },
  resetLinkPressed: {
    opacity: 0.5,
  },
  resetLinkText: {
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#9C9C99",
    textDecorationLine: "underline",
  },
  codeSection: {
    marginTop: 24,
  },
  section: {
    marginTop: 28,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#9C9C99",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  requestGroup: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
  },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  requestRowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECECEA",
  },
  requestInfo: {
    flex: 1,
    gap: 2,
  },
  requestName: {
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#111",
  },
  requestSubtitle: {
    fontSize: 13,
    color: "#9C9C99",
  },
  requestActions: {
    flexDirection: "row",
    gap: 8,
  },
  approveButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  approveButtonPressed: {
    backgroundColor: "#2A2A2A",
  },
  declineButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: "#D6D6D3",
    alignItems: "center",
    justifyContent: "center",
  },
  declineButtonPressed: {
    backgroundColor: "#E7E7E4",
  },
  requestButtonActing: {
    opacity: 0.4,
  },
  membersLoading: {
    paddingVertical: 32,
    alignItems: "center",
  },
});

export default AddAlbumMemberScreen;
