/**
 * AddAlbumSheetB — the editorial "Add an album" sheet (albums-tab A/B,
 * "editorial" arm). Replaces the classic modal's choice step: a black
 * "Create an album" card, a hairline "Join with a code" card, and — when
 * the caller has outbound join requests waiting on an owner — a quiet
 * status row so those requests aren't a black hole.
 */

import React, { memo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import Sheet from "@/components/ui/Sheet";
import { CachedImage } from "@/components/ui/CachedImage";
import { color, font, radius, scriptType, type } from "@/lib/tokens";
import { useGetMyPendingJoinRequestsQuery } from "../api/album.queries";
import { MyPendingAlbumJoinRequest } from "../types/album.types";

interface AddAlbumSheetBProps {
  visible: boolean;
  onClose: () => void;
  onCreate: () => void;
  onJoin: () => void;
}

/** "Annas 30-årsfest" / "Annas 30-årsfest and 1 more" */
const pendingAlbumsLabel = (requests: MyPendingAlbumJoinRequest[]): string => {
  const first = requests[0]?.album?.title ?? "an album";
  if (requests.length === 1) return first;
  return `${first} and ${requests.length - 1} more`;
};

const PendingRequestsRow = memo<{ requests: MyPendingAlbumJoinRequest[] }>(
  ({ requests }) => (
    <View style={styles.pendingRow}>
      <View style={styles.pendingCovers}>
        {requests.slice(0, 2).map((request, i) => (
          <View
            key={request.requestId}
            style={[styles.pendingCover, i > 0 && styles.pendingCoverOverlap]}
          >
            {request.album?.coverPhotoUrl ? (
              <CachedImage
                uri={request.album.coverPhotoUrl}
                style={styles.pendingCoverImage}
                showPlaceholder={false}
              />
            ) : (
              <View style={styles.pendingCoverEmpty} />
            )}
          </View>
        ))}
      </View>
      <View style={styles.pendingTextWrap}>
        <Text style={styles.pendingTitle}>
          {requests.length} pending{" "}
          {requests.length === 1 ? "request" : "requests"}
        </Text>
        <Text style={styles.pendingSubtitle} numberOfLines={1}>
          Waiting on {pendingAlbumsLabel(requests)}
        </Text>
      </View>
      <Ionicons
        name="hourglass-outline"
        size={18}
        color={color.textTertiary}
      />
    </View>
  ),
);
PendingRequestsRow.displayName = "PendingRequestsRow";

export const AddAlbumSheetB: React.FC<AddAlbumSheetBProps> = ({
  visible,
  onClose,
  onCreate,
  onJoin,
}) => {
  // Cheap and cached — most users have zero pending requests and never
  // see the row. A failed fetch just hides it.
  const { data: pendingRequests } = useGetMyPendingJoinRequestsQuery();
  const pending = (pendingRequests ?? []).filter(
    (request) => request.status === "pending",
  );

  const handleCreate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCreate();
  }, [onCreate]);

  const handleJoin = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onJoin();
  }, [onJoin]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.content}>
        <Text style={styles.title}>
          Add an <Text style={styles.titleScript}>album</Text>
        </Text>
        <Text style={styles.subtitle}>
          Start something new, or join one you were invited to.
        </Text>

        <Pressable
          onPress={handleCreate}
          style={({ pressed }) => [
            styles.createCard,
            pressed && styles.cardPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create an album"
        >
          <View style={styles.createIconWell}>
            <Ionicons name="add" size={22} color={color.textInverse} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.createCardTitle}>Create an album</Text>
            <Text style={styles.createCardSubtitle}>
              Invite people, or keep it just for you
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color="rgba(255, 255, 255, 0.55)"
          />
        </Pressable>

        <Pressable
          onPress={handleJoin}
          style={({ pressed }) => [
            styles.joinCard,
            pressed && styles.cardPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Join with a code"
        >
          <View style={styles.joinIconWell}>
            <Ionicons name="key-outline" size={20} color={color.textPrimary} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.joinCardTitle}>Join with a code</Text>
            <Text style={styles.joinCardSubtitle}>
              Enter an album code or paste an invite link
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={color.textTertiary}
          />
        </Pressable>

        {pending.length > 0 && <PendingRequestsRow requests={pending} />}
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  title: {
    fontSize: 26,
    ...font.bold,
    color: color.textPrimary,
  },
  titleScript: {
    ...scriptType(26),
    color: color.textPrimary,
  },
  subtitle: {
    ...type.bodySm,
    color: color.textSecondary,
    marginTop: 6,
    marginBottom: 20,
  },
  createCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: color.textPrimary,
    borderRadius: radius.xl,
    padding: 16,
  },
  joinCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.16)",
    padding: 16,
    marginTop: 12,
  },
  cardPressed: {
    opacity: 0.8,
  },
  createIconWell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  joinIconWell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTextWrap: {
    flex: 1,
    gap: 2,
  },
  createCardTitle: {
    fontSize: 16,
    ...font.semibold,
    color: color.textInverse,
  },
  createCardSubtitle: {
    fontSize: 13,
    ...font.regular,
    color: "rgba(255, 255, 255, 0.6)",
  },
  joinCardTitle: {
    fontSize: 16,
    ...font.semibold,
    color: color.textPrimary,
  },
  joinCardSubtitle: {
    fontSize: 13,
    ...font.regular,
    color: color.textSecondary,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
  pendingCovers: {
    flexDirection: "row",
  },
  pendingCover: {
    width: 34,
    height: 34,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: color.bg,
    backgroundColor: color.surface2,
  },
  pendingCoverOverlap: {
    marginLeft: -12,
  },
  pendingCoverImage: {
    width: "100%",
    height: "100%",
  },
  pendingCoverEmpty: {
    flex: 1,
    backgroundColor: color.surface2,
  },
  pendingTextWrap: {
    flex: 1,
    gap: 1,
  },
  pendingTitle: {
    fontSize: 14,
    ...font.semibold,
    color: color.textPrimary,
  },
  pendingSubtitle: {
    fontSize: 12.5,
    ...font.regular,
    color: color.textSecondary,
  },
});

export default AddAlbumSheetB;
