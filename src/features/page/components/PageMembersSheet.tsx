/**
 * PageMembersSheet — bottom sheet listing the album members behind a page
 * (the feed's "who's in this" surface). Same dark SocialBottomSheet chrome
 * as the comments sheet. Members' identity colors render as avatar RINGS
 * only — never on the name text (app-wide convention).
 *
 * Data is viewer-accessible: the endpoint shares the page's own access
 * rule, so followers of a private page (and anyone, for public pages) can
 * see the group without being album members.
 */

import React, { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import SocialAvatar from "@/features/album/components/photoSocial/SocialAvatar";
import SocialBottomSheet from "@/features/album/components/photoSocial/SocialBottomSheet";
import type { AlbumMember } from "@/features/album/types/album.types";
import { usePageMembersQuery } from "../api/page.queries";

export type PageMembersSheetProps = {
  albumId: string;
  pageId: string;
  visible: boolean;
  onClose: () => void;
};

const MemberRow: React.FC<{ member: AlbumMember }> = ({ member }) => (
  <View
    style={styles.memberRow}
    accessibilityLabel={
      member.role === "owner" ? `${member.name}, owner` : member.name
    }
  >
    <SocialAvatar
      name={member.name}
      avatarUrl={member.avatarUrl}
      size={38}
      borderColor={member.color ?? undefined}
    />
    <Text style={styles.memberName} numberOfLines={1}>
      {member.name}
    </Text>
    {member.role === "owner" && (
      <View style={styles.ownerPill}>
        <Text style={styles.ownerPillText}>Owner</Text>
      </View>
    )}
  </View>
);

export const PageMembersSheet: React.FC<PageMembersSheetProps> = ({
  albumId,
  pageId,
  visible,
  onClose,
}) => {
  const membersQuery = usePageMembersQuery(albumId, pageId, visible);
  const members = membersQuery.data ?? [];

  const renderMember = useCallback(
    ({ item }: { item: AlbumMember }) => <MemberRow member={item} />,
    [],
  );

  return (
    <SocialBottomSheet
      visible={visible}
      onClose={onClose}
      title={members.length > 0 ? `Members · ${members.length}` : "Members"}
      heightFraction={0.55}
    >
      {membersQuery.isLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color="rgba(255,255,255,0.6)" />
        </View>
      ) : membersQuery.isError ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="cloud-offline-outline"
            size={36}
            color="rgba(255, 255, 255, 0.35)"
          />
          <Text style={styles.emptyText}>{"Couldn't load members"}</Text>
          <Pressable
            onPress={() => membersQuery.refetch()}
            style={styles.retryButton}
            accessibilityRole="button"
            accessibilityLabel="Retry loading members"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(member) => member.userId}
          renderItem={renderMember}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SocialBottomSheet>
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
  },
  memberName: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  ownerPill: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ownerPillText: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 11,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 44,
    gap: 10,
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 14,
  },
  retryButton: {
    marginTop: 2,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  retryText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
});

export default PageMembersSheet;
