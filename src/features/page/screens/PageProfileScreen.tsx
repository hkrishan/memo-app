/**
 * PageProfileScreen — standalone view of a page (reached by tapping a
 * page-post header in the feed). It mirrors the album Pages-tab look:
 * blurred cover backdrop hero, cover photo + title + @handle + bio, then
 * the PostGrid. What renders on top depends on the viewer's relationship,
 * which the profile endpoint reports authoritatively as `myStatus`:
 *   - member → the full album-style page: create-post FAB + settings gear
 *   - follower → a "Following" / "Requested" button (tap to leave/withdraw)
 *   - anyone else → a "Follow" / "Request" button
 * plus a floating back chevron (this is a pushed route).
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassCircleButton } from "@/components/ui/GlassCircleButton";
import { ApiError } from "@/lib/api";
import { stableCacheKey } from "@/lib/imageCache";
import {
  useFollowPageMutation,
  useUnfollowPageMutation,
} from "@/features/feed/api/search.queries";
import type { PageFollowStatus } from "@/features/feed/types/search.types";
import { usePageProfileQuery } from "../api/page.queries";
import { Page, PageProfile } from "../types/page.types";
import PostGrid from "../components/PostGrid";

interface PageProfileScreenProps {
  albumId: string;
  pageId: string;
}

const PageProfileScreen: React.FC<PageProfileScreenProps> = ({
  albumId,
  pageId,
}) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: page, isLoading, isError, error, refetch } =
    usePageProfileQuery(albumId, pageId);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  // 404 (page gone / private) or 403 (lost access) → "isn't available".
  const status = error instanceof ApiError ? error.status : undefined;
  const isUnavailable = status === 404 || status === 403;

  if (isLoading) {
    return (
      <View style={styles.stateContainer}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (isUnavailable) {
    return (
      <UnavailableState
        onBack={handleBack}
        topInset={insets.top}
        message="This page isn't available"
      />
    );
  }

  if (isError || !page) {
    return (
      <View style={styles.stateContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#e53935" />
        <Text style={styles.errorText}>Couldn't load this page</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
        <FloatingBack onBack={handleBack} topInset={insets.top} />
      </View>
    );
  }

  return (
    <PageProfileContent
      albumId={albumId}
      pageId={pageId}
      page={page}
      topInset={insets.top}
      onBack={handleBack}
    />
  );
};

const PageProfileContent = ({
  albumId,
  pageId,
  page,
  topInset,
  onBack,
}: {
  albumId: string;
  pageId: string;
  page: PageProfile;
  topInset: number;
  onBack: () => void;
}) => {
  // Seeded from the server's authoritative status; kept in local state so
  // the button reflects taps immediately.
  const [followStatus, setFollowStatus] = useState<PageFollowStatus>(
    page.myStatus,
  );
  const followMutation = useFollowPageMutation();
  const unfollowMutation = useUnfollowPageMutation();
  const isPublic = page.isPublic;

  // Members see the full album-style page: create-post FAB + settings gear,
  // no follow button.
  const isMember = page.myStatus === "member";
  const router = useRouter();
  const handleCreatePost = useCallback(
    () => router.push(`/album/${albumId}/page/${pageId}/create-post`),
    [router, albumId, pageId],
  );
  const handleOpenSettings = useCallback(
    () => router.push(`/album/${albumId}/page/${pageId}/settings`),
    [router, albumId, pageId],
  );

  const follow = useCallback(() => {
    const prev = followStatus;
    setFollowStatus(isPublic ? "accepted" : "pending");
    followMutation.mutate(
      { albumId, pageId, isPublic, prevStatus: prev },
      {
        onSuccess: (result) => setFollowStatus(result.status),
        onError: () => setFollowStatus(prev),
      },
    );
  }, [albumId, pageId, isPublic, followStatus, followMutation]);

  const unfollow = useCallback(() => {
    const prev = followStatus;
    setFollowStatus("none");
    unfollowMutation.mutate(
      { albumId, pageId, isPublic, prevStatus: prev },
      { onError: () => setFollowStatus(prev) },
    );
  }, [albumId, pageId, isPublic, followStatus, unfollowMutation]);

  const handleFollowPress = useCallback(() => {
    if (followStatus === "none") {
      follow();
      return;
    }
    // "accepted" / "pending" → confirm before dropping the follow/request
    Alert.alert(
      followStatus === "pending" ? "Cancel request?" : "Unfollow page?",
      followStatus === "pending"
        ? "Your follow request will be withdrawn."
        : `You'll stop seeing posts from ${page.pageTitle || `@${page.pageHandle}`} in your feed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: followStatus === "pending" ? "Withdraw" : "Unfollow",
          style: "destructive",
          onPress: unfollow,
        },
      ],
    );
  }, [followStatus, follow, unfollow, page.pageTitle, page.pageHandle]);

  const coverUri =
    page.coverPhoto?.thumbnailUrl ?? page.coverPhoto?.url ?? null;

  // The header owns the top inset so the blurred-cover backdrop reaches the
  // very top and slides under the floating chrome.
  const headerComponent = useMemo(
    () => (
      <View style={[styles.headerSection, { paddingTop: topInset + 64 }]}>
        {coverUri != null && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <ExpoImage
              source={{ uri: coverUri, cacheKey: stableCacheKey(coverUri) }}
              style={styles.headerBackdropImage}
              contentFit="cover"
              blurRadius={45}
              transition={200}
              cachePolicy="memory-disk"
            />
            <View style={styles.headerBackdropFrost} />
          </View>
        )}
        <View style={styles.profileRow}>
          <PageCoverPhoto page={page} />
          <View style={styles.profileInfo}>
            <Text style={styles.pageTitle} numberOfLines={2}>
              {page.pageTitle || `@${page.pageHandle}`}
            </Text>
            <Text style={styles.pageHandle}>@{page.pageHandle}</Text>
          </View>
          {isMember && (
            <Pressable
              onPress={handleOpenSettings}
              style={styles.settingsButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#000" />
            </Pressable>
          )}
        </View>
        {!!page.bio && <Text style={styles.pageBio}>{page.bio}</Text>}
      </View>
    ),
    [page, coverUri, topInset, isMember, handleOpenSettings],
  );

  return (
    <View style={styles.container}>
      <PostGrid
        albumId={albumId}
        pageId={pageId}
        ListHeaderComponent={headerComponent}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* Floating chrome over the cover backdrop */}
      <FloatingBack onBack={onBack} topInset={topInset} />
      {/* Members get the album-style page (create-post FAB + settings gear
          above); everyone else gets a follow button */}
      {isMember ? (
        <Pressable onPress={handleCreatePost} style={styles.fab}>
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      ) : (
        <View style={[styles.followWrap, { top: topInset + 8 }]}>
          <FollowButton status={followStatus} onPress={handleFollowPress} />
        </View>
      )}
    </View>
  );
};

const FollowButton = ({
  status,
  onPress,
}: {
  status: PageFollowStatus;
  onPress: () => void;
}) => {
  const following = status === "accepted" || status === "member";
  const pending = status === "pending";
  const label = following ? "Following" : pending ? "Requested" : "Follow";
  const filled = status === "none";

  return (
    <Pressable
      onPress={onPress}
      style={[styles.followButton, filled ? styles.followFilled : styles.followOutline]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.followText, filled && styles.followTextFilled]}>
        {label}
      </Text>
    </Pressable>
  );
};

const FloatingBack = ({
  onBack,
  topInset,
}: {
  onBack: () => void;
  topInset: number;
}) => (
  <View style={[styles.backWrap, { top: topInset + 8 }]}>
    <GlassCircleButton onPress={onBack} label="Back" size={40} tint="dark">
      <Ionicons name="chevron-back" size={22} color="#fff" />
    </GlassCircleButton>
  </View>
);

const UnavailableState = ({
  onBack,
  topInset,
  message,
}: {
  onBack: () => void;
  topInset: number;
  message: string;
}) => (
  <View style={styles.stateContainer}>
    <Ionicons name="lock-closed-outline" size={44} color="#999" />
    <Text style={styles.unavailableText}>{message}</Text>
    <Pressable style={styles.retryButton} onPress={onBack}>
      <Text style={styles.retryText}>Go back</Text>
    </Pressable>
    <FloatingBack onBack={onBack} topInset={topInset} />
  </View>
);

// Rounded-square cover matching the album Pages-tab treatment (quiet
// placeholder, hairline edge; no gradient ring). Read-only here (no preview
// flight — the viewer just sees the page).
const COVER_SIZE = 72;
const COVER_RADIUS = 20;

const PageCoverPhoto = ({ page }: { page: Page }) => {
  const thumbUri = page.coverPhoto?.thumbnailUrl ?? page.coverPhoto?.url;
  return (
    <View style={styles.coverPhotoFrame}>
      {thumbUri ? (
        <ExpoImage
          source={{ uri: thumbUri, cacheKey: stableCacheKey(thumbUri) }}
          style={styles.coverPhotoImage}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={styles.coverPhotoFallback}>
          <Ionicons name="images-outline" size={24} color="#C7C7CC" />
        </View>
      )}
      <View style={styles.coverPhotoEdge} pointerEvents="none" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: "#fff",
  },
  stateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#fff",
  },
  errorText: {
    fontSize: 16,
    color: "#e53935",
  },
  unavailableText: {
    fontSize: 17,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#333",
  },
  retryButton: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: "#000",
  },
  retryText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  headerSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
    marginBottom: 2,
    overflow: "hidden",
  },
  headerBackdropImage: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ scale: 1.25 }],
  },
  headerBackdropFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.62)",
  },
  profileRow: {
    flexDirection: "row",
    gap: 16,
  },
  profileInfo: {
    flex: 1,
    justifyContent: "center",
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  fab: {
    position: "absolute",
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  pageTitle: {
    fontSize: 20,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
    marginBottom: 4,
  },
  pageHandle: {
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#666",
  },
  pageBio: {
    fontSize: 14,
    lineHeight: 20,
    color: "#333",
    marginTop: 12,
  },
  coverPhotoFrame: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: COVER_RADIUS,
    overflow: "hidden",
    backgroundColor: "#F1F1F3",
  },
  coverPhotoImage: {
    width: "100%",
    height: "100%",
  },
  coverPhotoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  coverPhotoEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: COVER_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.08)",
  },
  backWrap: {
    position: "absolute",
    left: 16,
  },
  followWrap: {
    position: "absolute",
    right: 16,
  },
  followButton: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  followFilled: {
    backgroundColor: "#000",
  },
  followOutline: {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.18)",
  },
  followText: {
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#111",
  },
  followTextFilled: {
    color: "#fff",
  },
});

export default PageProfileScreen;
