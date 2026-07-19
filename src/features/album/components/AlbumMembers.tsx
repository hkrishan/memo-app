/**
 * AlbumMembers Component
 * Displays album members list (placeholder for future implementation)
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { AlbumMember } from "../types/album.types";
import { CachedImage } from "@/components/ui/CachedImage";

interface AlbumMembersProps {
  members: AlbumMember[];
}

interface MemberItemProps {
  member: AlbumMember;
}

const MemberItem: React.FC<MemberItemProps> = ({ member }) => {
  return (
    <View style={styles.memberItem}>
      {member.avatarUrl ? (
        <CachedImage
          uri={member.avatarUrl}
          style={styles.avatar}
          showPlaceholder={false}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Ionicons name="person" size={24} color="#999" />
        </View>
      )}
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{member.name ?? "Unknown"}</Text>
        {member.userId && (
          <Text style={styles.memberRole}>Member</Text>
        )}
      </View>
    </View>
  );
};

export const AlbumMembers: React.FC<AlbumMembersProps> = ({ members }) => {
  if (members.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="people-outline" size={48} color="#ccc" />
        <Text style={styles.emptyText}>No members</Text>
        <Text style={styles.emptySubtext}>
          Invite people to join this album
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Members</Text>
        <Text style={styles.headerCount}>{members.length}</Text>
      </View>
      <View style={styles.membersList}>
        {members.map((member) => (
          <MemberItem key={member.userId} member={member} />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  headerCount: {
    fontSize: 14,
    fontWeight: "500",
    color: "#888",
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  membersList: {
    gap: 12,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: "#f8f8f8",
    borderRadius: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    backgroundColor: "#e0e0e0",
    alignItems: "center",
    justifyContent: "center",
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  memberRole: {
    fontSize: 13,
    color: "#888",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});

export default AlbumMembers;
