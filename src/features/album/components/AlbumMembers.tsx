/**
 * AlbumMembers — the album's people, as a clean white group:
 * a "N members" header, an optional leading Invite row (person-add in a
 * dashed circle) that opens the invite screen, then one row per member —
 * avatar, name, role pill. The owner is listed first. Membership is
 * read-only here: the backend has no member removal.
 */

import React, { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AlbumMember, Role } from "../types/album.types";
import { memberColor } from "../memberColor";
import Avatar from "@/components/ui/Avatar";
import { selectUser, useAuthStore } from "@/features/auth/store/authStore";

interface AlbumMembersProps {
  members: AlbumMember[];
  /** Enables the leading Invite row, which opens the album's invite screen. */
  albumId?: string;
  /** Hide the Invite row (e.g. when already on the invite screen). */
  showInviteRow?: boolean;
}

const ROLE_ORDER: Record<Role, number> = { owner: 0, contributor: 1, viewer: 2 };

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  contributor: "Contributor",
  viewer: "Viewer",
};

const RolePill = ({ role }: { role: Role }) => {
  const filled = role === "owner";
  return (
    <View style={[styles.rolePill, filled ? styles.rolePillFilled : styles.rolePillOutlined]}>
      <Text
        style={[
          styles.rolePillText,
          filled ? styles.rolePillTextFilled : styles.rolePillTextOutlined,
        ]}
      >
        {ROLE_LABEL[role] ?? "Member"}
      </Text>
    </View>
  );
};

const MemberRow = ({
  member,
  isFirst,
  onPress,
}: {
  member: AlbumMember;
  isFirst: boolean;
  /** Opens the member's profile — undefined for the current user's own row. */
  onPress?: (member: AlbumMember) => void;
}) => (
  <Pressable
    onPress={onPress ? () => onPress(member) : undefined}
    disabled={!onPress}
    style={({ pressed }) => [
      styles.row,
      !isFirst && styles.rowDivided,
      pressed && onPress && styles.rowPressed,
    ]}
    accessible
    accessibilityRole={onPress ? "button" : undefined}
    accessibilityLabel={`${member.name ?? "Unknown"}, ${ROLE_LABEL[member.role] ?? "member"}`}
  >
    {/* Identity ring + color dot in the member's album color */}
    <View>
      <Avatar user={member} size={44} ringColor={memberColor(member)} />
      <View
        style={[styles.colorDot, { backgroundColor: memberColor(member) }]}
      />
    </View>
    <Text style={styles.memberName} numberOfLines={1}>
      {member.name ?? "Unknown"}
    </Text>
    <RolePill role={member.role} />
  </Pressable>
);

export const AlbumMembers: React.FC<AlbumMembersProps> = ({
  members,
  albumId,
  showInviteRow = true,
}) => {
  const router = useRouter();
  const currentUser = useAuthStore(selectUser);

  const sortedMembers = useMemo(
    () =>
      [...members].sort(
        (a, b) =>
          (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3) ||
          (a.name ?? "").localeCompare(b.name ?? ""),
      ),
    [members],
  );

  const handleInvite = useCallback(() => {
    if (albumId) router.push(`/album/${albumId}/add-members`);
  }, [albumId, router]);

  // Other members open their profile modal (report/block live there)
  const handleMemberPress = useCallback(
    (member: AlbumMember) => {
      router.push({
        pathname: "/user/[userId]",
        params: {
          userId: member.userId,
          name: member.name ?? "",
          avatarUrl: member.avatarUrl ?? "",
        },
      });
    },
    [router],
  );

  const inviteRowVisible = showInviteRow && !!albumId;

  return (
    <View>
      <Text style={styles.header}>
        {members.length} {members.length === 1 ? "member" : "members"}
      </Text>

      <View style={styles.group}>
        {inviteRowVisible && (
          <Pressable
            onPress={handleInvite}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel="Invite people to this album"
          >
            <View style={styles.inviteCircle}>
              <Ionicons name="person-add-outline" size={18} color="#111" />
            </View>
            <Text style={styles.inviteText}>Invite people</Text>
            <Ionicons name="chevron-forward" size={18} color="#B5B5B2" />
          </Pressable>
        )}

        {sortedMembers.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={36} color="#C9C9C6" />
            <Text style={styles.emptyText}>No members yet</Text>
            <Text style={styles.emptySubtext}>
              Share the invite link to bring people in
            </Text>
          </View>
        ) : (
          sortedMembers.map((member, index) => (
            <MemberRow
              key={member.userId}
              member={member}
              isFirst={index === 0 && !inviteRowVisible}
              onPress={
                member.userId !== currentUser?.id ? handleMemberPress : undefined
              }
            />
          ))
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#9C9C99",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  group: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECECEA",
  },
  rowPressed: {
    backgroundColor: "#F5F5F3",
  },
  inviteCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "#B5B5B2",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#111",
  },
  memberName: {
    flex: 1,
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#111",
  },
  colorDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#fff",
  },
  rolePill: {
    borderRadius: 13,
    paddingHorizontal: 11,
    height: 26,
    justifyContent: "center",
  },
  rolePillFilled: {
    backgroundColor: "#000",
  },
  rolePillOutlined: {
    borderWidth: 1,
    borderColor: "#D6D6D3",
  },
  rolePillText: {
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  rolePillTextFilled: {
    color: "#fff",
  },
  rolePillTextOutlined: {
    color: "#555",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 32,
    gap: 6,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#666",
  },
  emptySubtext: {
    fontFamily: "InstrumentSans_400Regular",
    fontWeight: "400",
    fontSize: 13,
    color: "#9C9C99",
    textAlign: "center",
  },
});

export default AlbumMembers;
