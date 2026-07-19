import React, { useCallback, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  useGetAlbumMembersQuery,
  useGetAlbumPendingJoinRequestsQuery,
  useGetAlbumQuery,
  useHandleAlbumJoinRequestMutation,
} from "../api/album.queries";
import { useLocalSearchParams } from "expo-router";
import { AlbumJoinRequest, AlbumMember } from "../types/album.types";
import Avatar from "@/components/ui/Avatar";
import AlbumCodeBanner from "../components/AlbumCodeBanner";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type TabKey = "members" | "pending";

const TABS: { key: TabKey; label: string }[] = [
  { key: "members", label: "Members" },
  { key: "pending", label: "Pending" },
];

const AddAlbumMemberScreen = () => {
  const albumId = useLocalSearchParams().albumId as string;
  const insets = useSafeAreaInsets();
  const { data: album } = useGetAlbumQuery(albumId);
  const { data: members, isLoading } = useGetAlbumMembersQuery(albumId);
  const {
    data: pendingMembers,
    refetch: refetchPending,
    isRefetching: isRefetchingPending,
  } = useGetAlbumPendingJoinRequestsQuery(albumId);

  const [activeTab, setActiveTab] = useState<TabKey>("members");
  const scrollViewRef = useRef<ScrollView>(null);
  const indicatorPosition = useSharedValue(0);

  const handleAlbumJoinRequest = useHandleAlbumJoinRequestMutation(albumId);

  const handleTabPress = useCallback(
    (tab: TabKey, index: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveTab(tab);
      indicatorPosition.value = withTiming(index * (SCREEN_WIDTH / 2), {
        duration: 200,
      });
      scrollViewRef.current?.scrollTo({
        x: index * SCREEN_WIDTH,
        animated: true,
      });
    },
    [indicatorPosition],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / SCREEN_WIDTH);
      const tab = TABS[index]?.key ?? "members";

      // Update indicator position smoothly during scroll
      indicatorPosition.value = (offsetX / SCREEN_WIDTH) * (SCREEN_WIDTH / 2);

      if (tab !== activeTab) {
        setActiveTab(tab);
      }
    },
    [activeTab, indicatorPosition],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPosition.value }],
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header with invite code */}
      <View style={styles.header}>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "600",
            marginBottom: 4,
          }}
        >
          Invite Code
        </Text>
        <AlbumCodeBanner code={album?.albumCode ?? "N/A"} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab, index) => (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => handleTabPress(tab.key, index)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
            {tab.key === "members" && members && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{members.length}</Text>
              </View>
            )}
            {tab.key === "pending" &&
              pendingMembers &&
              pendingMembers.length > 0 && (
                <View
                  style={[styles.tabBadge, { backgroundColor: "#f59e0b20" }]}
                >
                  <Text style={[styles.tabBadgeText, { color: "#f59e0b" }]}>
                    {pendingMembers.length}
                  </Text>
                </View>
              )}
          </Pressable>
        ))}
        {/* Animated indicator */}
        <Animated.View style={[styles.tabIndicator, indicatorStyle]} />
      </View>

      {/* Swipeable content */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
      >
        {/* Members Tab */}
        <ScrollView
          style={styles.tabContent}
          contentContainerStyle={styles.tabContentContainer}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionTitle}>Album Members</Text>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#111" />
            </View>
          ) : members && members.length > 0 ? (
            <View style={styles.membersList}>
              {members.map((member) => (
                <MemberCard key={member.userId} member={member} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No members yet</Text>
              <Text style={styles.emptySubtext}>
                Share the invite code to add members
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Pending Tab */}
        <ScrollView
          style={styles.tabContent}
          contentContainerStyle={styles.tabContentContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetchingPending}
              onRefresh={refetchPending}
              tintColor="#111"
            />
          }
        >
          <Text style={styles.sectionTitle}>Pending Invites</Text>
          {pendingMembers && pendingMembers.length > 0 ? (
            <View style={styles.membersList}>
              {pendingMembers.map((request) => (
                <PendingMemberCard
                  key={request.requestId}
                  request={request}
                  onAccept={(requestId: string) => {
                    handleAlbumJoinRequest.mutate({
                      requestId,
                      action: "accept",
                    });
                  }}
                  onDecline={(requestId: string) => {
                    handleAlbumJoinRequest.mutate({
                      requestId,
                      action: "reject",
                    });
                  }}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="time-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No pending invites</Text>
              <Text style={styles.emptySubtext}>
                People who use your invite code will appear here until they join
              </Text>
            </View>
          )}
        </ScrollView>
      </ScrollView>
    </View>
  );
};

type MemberCardProps = {
  member: AlbumMember;
};

const MemberCard = ({ member }: MemberCardProps) => {
  const getRoleBadge = (role: string) => {
    switch (role) {
      case "owner":
        return { label: "Owner", color: "#6366f1" };
      case "contributor":
        return { label: "Contributor", color: "#22c55e" };
      case "viewer":
        return { label: "Viewer", color: "#888" };
      default:
        return { label: "Member", color: "#888" };
    }
  };

  const roleBadge = getRoleBadge(member.role);

  return (
    <View style={styles.memberCard}>
      <Avatar user={member} size={48} />
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{member.name}</Text>
        <View
          style={[
            styles.roleBadge,
            { backgroundColor: `${roleBadge.color}15` },
          ]}
        >
          <Text style={[styles.roleBadgeText, { color: roleBadge.color }]}>
            {roleBadge.label}
          </Text>
        </View>
      </View>
      <Pressable style={styles.moreButton}>
        <Ionicons name="ellipsis-horizontal" size={20} color="#888" />
      </Pressable>
    </View>
  );
};

type PendingMemberCardProps = {
  request: AlbumJoinRequest;
  onAccept?: (requestId: string) => void;
  onDecline?: (requestId: string) => void;
};

const PendingMemberCard = ({
  request,
  onAccept = () => {},
  onDecline = () => {},
}: PendingMemberCardProps) => {
  const requester = request.requester;

  return (
    <View style={styles.memberCard}>
      <Avatar
        user={
          requester ?? {
            userId: request.requesterId,
            name: "Unknown",
            avatarUrl: null,
          }
        }
        size={48}
      />
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>
          {requester?.name ?? "Unknown User"}
        </Text>
        <View style={[styles.roleBadge, { backgroundColor: "#f59e0b15" }]}>
          <Text style={[styles.roleBadgeText, { color: "#f59e0b" }]}>
            Pending
          </Text>
        </View>
      </View>
      <View style={styles.pendingActions}>
        <Pressable
          style={styles.acceptButton}
          onPress={() => {
            onAccept?.(request.requestId);
          }}
        >
          <Ionicons name="checkmark" size={20} color="#fff" />
        </Pressable>
        <Pressable
          style={styles.declineButton}
          onPress={() => {
            onDecline?.(request.requestId);
          }}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5e5",
    position: "relative",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 6,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#888",
  },
  tabTextActive: {
    color: "#111",
    fontWeight: "600",
  },
  tabBadge: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: SCREEN_WIDTH / 2,
    height: 2,
    backgroundColor: "#111",
  },
  tabContent: {
    width: SCREEN_WIDTH,
  },
  tabContentContainer: {
    padding: 20,
    minHeight: 300,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
    marginBottom: 20,
  },
  membersList: {
    gap: 12,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f8f8",
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  memberInfo: {
    flex: 1,
    gap: 4,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
  },
  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
    lineHeight: 20,
  },
  pendingActions: {
    flexDirection: "row",
    gap: 8,
  },
  acceptButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
  },
  declineButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default AddAlbumMemberScreen;
