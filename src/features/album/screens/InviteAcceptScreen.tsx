import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { notify } from "@/components/global";
import { ApiError, isTransientError } from "@/lib/api/errors";
import {
  useAcceptInviteMutation,
  useInviteInfoQuery,
} from "../api/album.queries";

/** Playful polaroid tilt on the preview card — straightens softly on load */
const CARD_TILT = "-2deg";

const InviteAcceptScreen = () => {
  const { inviteId } = useLocalSearchParams<{ inviteId: string }>();
  const router = useRouter();

  const {
    data: invite,
    isLoading,
    isError,
    error,
    refetch,
  } = useInviteInfoQuery(inviteId ?? null);
  const acceptMutation = useAcceptInviteMutation();

  // A fetch that never completed (offline, timeout, server down) says
  // nothing about the invite — telling the user "this invite isn't valid"
  // would send them chasing a new link they don't need.
  const connectionFailed = isError && isTransientError(error);

  // A 410 on accept means the link died between preview and tap
  const [expiredOnAccept, setExpiredOnAccept] = useState(false);

  const tilt = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (invite) {
      Animated.spring(tilt, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }).start();
    }
  }, [invite, tilt]);

  const rotate = tilt.interpolate({
    inputRange: [0, 1],
    outputRange: [CARD_TILT, "0deg"],
  });

  const handleNotNow = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [router]);

  const handleJoin = useCallback(async () => {
    if (!invite || !inviteId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (invite.alreadyMember && invite.album) {
      router.replace(`/album/${invite.album.albumId}`);
      return;
    }
    // (A missing album on an active invite falls through to accept —
    // idempotent on the server, and its response carries the albumId)

    try {
      const { albumId } = await acceptMutation.mutateAsync({ inviteId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/album/${albumId}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) {
        setExpiredOnAccept(true);
        return;
      }
      notify.error("Couldn't join album", "Please try again");
    }
  }, [invite, inviteId, acceptMutation, router]);

  const expired = expiredOnAccept || invite?.status === "expired";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" />

      <Image
        source={require("../../../../assets/logo-black.png")}
        style={styles.logo}
        contentFit="contain"
        accessibilityLabel="Memo"
      />

      <View style={styles.body}>
        {isLoading ? (
          <InviteSkeleton />
        ) : connectionFailed && !invite ? (
          <InvalidState
            icon="cloud-offline-outline"
            title="Couldn't load this invite"
            message="Check your internet connection and try again — the invite itself is fine."
            retryLabel="Try again"
            onRetry={refetch}
          />
        ) : isError || !invite ? (
          <InvalidState
            title="This invite isn't valid"
            message="The link may be broken or the invite was removed. Ask a member of the album to send you a new one."
          />
        ) : expired || !invite.album || !invite.inviter ? (
          <InvalidState
            title="This invite has expired"
            message="Invite links stop working after 30 days or when a member turns them off. Ask someone in the album for a fresh link."
          />
        ) : (
          <>
            <Text style={styles.eyebrow}>You're invited to</Text>

            <Animated.View
              style={[styles.card, { transform: [{ rotate }] }]}
            >
              {invite.album.coverPhotoUrl ? (
                <Image
                  source={{ uri: invite.album.coverPhotoUrl }}
                  style={styles.cover}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={[styles.cover, styles.coverFallback]}>
                  <Ionicons name="images-outline" size={40} color="#bbb" />
                </View>
              )}

              <View style={styles.cardBody}>
                <Text style={styles.albumTitle} numberOfLines={2}>
                  {invite.album.title}
                </Text>
                <Text style={styles.memberCount}>
                  {invite.album.memberCount}{" "}
                  {invite.album.memberCount === 1 ? "member" : "members"}
                </Text>

                <View style={styles.inviterRow}>
                  <View style={styles.inviterAvatar}>
                    {invite.inviter.avatarUrl ? (
                      <Image
                        source={{ uri: invite.inviter.avatarUrl }}
                        style={styles.inviterAvatarImage}
                        contentFit="cover"
                      />
                    ) : (
                      <Ionicons name="person" size={13} color="#999" />
                    )}
                  </View>
                  <Text style={styles.inviterText} numberOfLines={1}>
                    Invited by {invite.inviter.name}
                  </Text>
                </View>
              </View>
            </Animated.View>
          </>
        )}
      </View>

      <View style={styles.footer}>
        {!isLoading && !isError && invite && !expired && (
          <Pressable
            style={({ pressed }) => [
              styles.joinButton,
              pressed && styles.joinButtonPressed,
            ]}
            onPress={handleJoin}
            disabled={acceptMutation.isPending}
            accessibilityRole="button"
          >
            {acceptMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.joinButtonText}>
                {invite.alreadyMember ? "Open album" : "Join album"}
              </Text>
            )}
          </Pressable>
        )}

        <Pressable
          style={styles.notNowButton}
          onPress={handleNotNow}
          accessibilityRole="button"
          hitSlop={12}
        >
          <Text style={styles.notNowText}>Not now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

/** Pulsing placeholder mirroring the invite card while the preview loads */
const InviteSkeleton = () => {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={{ opacity: pulse, width: "100%" }}>
      <View style={styles.skeletonEyebrow} />
      <View style={[styles.card, { transform: [{ rotate: CARD_TILT }] }]}>
        <View style={[styles.cover, styles.skeletonBlock]} />
        <View style={styles.cardBody}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonLine} />
          <View style={styles.inviterRow}>
            <View style={[styles.inviterAvatar, styles.skeletonBlock]} />
            <View style={styles.skeletonLineShort} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const InvalidState = ({
  title,
  message,
  icon = "time-outline",
  retryLabel,
  onRetry,
}: {
  title: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  retryLabel?: string;
  onRetry?: () => void;
}) => (
  <View style={styles.invalidContainer}>
    <View style={styles.invalidIconCircle}>
      <Ionicons name={icon} size={30} color="#111" />
    </View>
    <Text style={styles.invalidTitle}>{title}</Text>
    <Text style={styles.invalidMessage}>{message}</Text>
    {onRetry && (
      <Pressable
        style={({ pressed }) => [
          styles.retryButton,
          pressed && styles.retryButtonPressed,
        ]}
        onPress={onRetry}
        accessibilityRole="button"
      >
        <Text style={styles.retryButtonText}>{retryLabel ?? "Try again"}</Text>
      </Pressable>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 24,
  },
  logo: {
    alignSelf: "center",
    width: 40,
    height: 28,
    marginTop: 12,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  eyebrow: {
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#888",
    marginBottom: 16,
    textAlign: "center",
  },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ececec",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  cover: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#f2f2f2",
  },
  coverFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    padding: 20,
    gap: 4,
  },
  albumTitle: {
    fontSize: 24,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#111",
    letterSpacing: -0.3,
  },
  memberCount: {
    fontSize: 14,
    color: "#888",
  },
  inviterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  inviterAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  inviterAvatarImage: {
    width: 24,
    height: 24,
  },
  inviterText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "InstrumentSans_500Medium",
    fontWeight: "500",
    color: "#444",
  },
  footer: {
    paddingBottom: 8,
    gap: 4,
  },
  joinButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  joinButtonPressed: {
    backgroundColor: "#333",
  },
  joinButtonText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
  notNowButton: {
    alignSelf: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  notNowText: {
    fontSize: 15,
    fontFamily: "InstrumentSans_500Medium",
    fontWeight: "500",
    color: "#999",
  },
  // Invalid / expired
  invalidContainer: {
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  invalidIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f4f4f4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  invalidTitle: {
    fontSize: 22,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#111",
    textAlign: "center",
  },
  invalidMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: "#777",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  retryButtonPressed: {
    backgroundColor: "#f4f4f4",
  },
  retryButtonText: {
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#111",
  },
  // Skeleton
  skeletonEyebrow: {
    alignSelf: "center",
    width: 130,
    height: 15,
    borderRadius: 8,
    backgroundColor: "#ededed",
    marginBottom: 16,
  },
  skeletonBlock: {
    backgroundColor: "#ededed",
  },
  skeletonTitle: {
    width: "70%",
    height: 22,
    borderRadius: 8,
    backgroundColor: "#ededed",
    marginBottom: 6,
  },
  skeletonLine: {
    width: "35%",
    height: 13,
    borderRadius: 7,
    backgroundColor: "#ededed",
  },
  skeletonLineShort: {
    width: "45%",
    height: 13,
    borderRadius: 7,
    backgroundColor: "#ededed",
  },
});

export default InviteAcceptScreen;
