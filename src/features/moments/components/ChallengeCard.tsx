/**
 * Live card for a Challenge moment: the prompt front and center, a coarse
 * countdown to the deadline, submission thumbnails (pending = spinner
 * badge, rejected = tappable ✕ badge with the reason), and a post button
 * while the event is open.
 */

import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { notify } from "@/components/global";
import { stableCacheKey } from "@/lib/imageCache";
import {
  ChallengeConfig,
  LATE_WINDOW_MS,
  MomentSubmission,
} from "../types/moment.types";
import { MomentCardProps } from "../registry/registry.types";
import { formatCoarseRemaining, useNow } from "../utils/time";
import MomentCardShell from "./MomentCardShell";

const ACCENT = "#5E5CE6";

const SubmissionThumb: React.FC<{ submission: MomentSubmission }> = ({
  submission,
}) => {
  const { validationStatus, validationReason } = submission;

  const handlePress = () => {
    if (validationStatus === "rejected") {
      notify.popup({
        type: "error",
        title: "Photo rejected",
        message:
          validationReason ?? "This photo didn't match the challenge prompt.",
        dismissable: true,
      });
    }
  };

  // Video submissions must never fall back to the video URL as a
  // "thumbnail" (expo-image can't render it) — poster-less videos get a
  // dark play-glyph tile instead of a broken image. A null photo means the
  // submission is locked for the viewer — a lock tile, never a crash.
  const isVideo = submission.photo?.mediaType === "video";
  const thumbUri = isVideo
    ? submission.photo?.thumbnailUrl
    : (submission.photo?.thumbnailUrl ?? submission.photo?.url);

  return (
    <Pressable
      onPress={validationStatus === "rejected" ? handlePress : undefined}
      style={styles.thumbWrap}
      accessibilityLabel={`${submission.user.name}'s submission`}
    >
      {submission.photo == null ? (
        <View style={[styles.thumb, styles.thumbVideoFallback]}>
          <Ionicons
            name="lock-closed"
            size={18}
            color="rgba(255, 255, 255, 0.9)"
          />
        </View>
      ) : thumbUri == null ? (
        <View
          style={[
            styles.thumb,
            styles.thumbVideoFallback,
            validationStatus === "rejected" && styles.thumbRejected,
          ]}
        >
          <Ionicons name="play" size={18} color="rgba(255, 255, 255, 0.9)" />
        </View>
      ) : (
        <Image
          source={{ uri: thumbUri, cacheKey: stableCacheKey(thumbUri) }}
          style={[
            styles.thumb,
            validationStatus === "rejected" && styles.thumbRejected,
          ]}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
        />
      )}
      {validationStatus === "pending" && (
        <View style={styles.badge}>
          <ActivityIndicator
            size="small"
            color="#fff"
            style={styles.badgeSpinner}
          />
        </View>
      )}
      {validationStatus === "rejected" && (
        <View style={[styles.badge, styles.badgeRejected]}>
          <Ionicons name="close" size={10} color="#fff" />
        </View>
      )}
      {submission.late && validationStatus !== "rejected" && (
        <View style={[styles.badge, styles.badgeLate]}>
          <Ionicons name="time" size={9} color="#fff" />
        </View>
      )}
    </Pressable>
  );
};

const ChallengeCard: React.FC<MomentCardProps> = ({
  moment,
  currentUserId,
  canCancel,
  onPostNow,
  onRequestCancel,
}) => {
  const config = moment.config as ChallengeConfig;
  // A challenge is one long event; coarse countdown only needs a slow tick
  const event = moment.events.find((e) => e.status === "open") ?? moment.events[0];
  const now = useNow(30 * 1000, moment.status === "active");

  const deadlineMs = new Date(config.deadlineAt).getTime();
  const remainingMs = deadlineMs - now;
  const urgent = remainingMs > 0 && remainingMs < 60 * 60 * 1000;

  const canPost =
    !!event &&
    event.status === "open" &&
    new Date(event.deadlineAt).getTime() + LATE_WINDOW_MS > now;
  const alreadyPosted =
    !!event &&
    !!currentUserId &&
    event.submissions.some((s) => s.userId === currentUserId);

  const submissions = event?.submissions ?? [];

  return (
    <MomentCardShell
      icon="trophy"
      accentColor={ACCENT}
      title={moment.title || "Challenge"}
      canCancel={canCancel}
      onRequestCancel={onRequestCancel}
    >
      <Text style={styles.prompt}>{config.prompt}</Text>

      <View style={styles.deadlineRow}>
        <Ionicons
          name="hourglass-outline"
          size={14}
          color={urgent ? "#FF3B30" : "#8E8E93"}
        />
        <Text style={[styles.deadlineText, urgent && styles.deadlineUrgent]}>
          {formatCoarseRemaining(remainingMs)}
        </Text>
      </View>

      {submissions.length > 0 && (
        <View style={styles.thumbRow}>
          {submissions.map((submission) => (
            <SubmissionThumb
              key={submission.submissionId}
              submission={submission}
            />
          ))}
        </View>
      )}

      {canPost &&
        (alreadyPosted ? (
          <View style={[styles.postButton, styles.postedButton]}>
            <Ionicons name="checkmark-circle" size={18} color="#34C759" />
            <Text style={styles.postedLabel}>Your shot is in</Text>
          </View>
        ) : (
          <Pressable
            style={styles.postButton}
            onPress={() => event && onPostNow(event)}
            accessibilityRole="button"
            accessibilityLabel="Post your shot"
          >
            <Ionicons name="camera" size={16} color="#fff" />
            <Text style={styles.postButtonLabel}>Post your shot</Text>
          </Pressable>
        ))}
    </MomentCardShell>
  );
};

const styles = StyleSheet.create({
  prompt: {
    fontSize: 21,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#000",
    lineHeight: 28,
    marginTop: 14,
  },
  deadlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  deadlineText: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#8E8E93",
  },
  deadlineUrgent: {
    color: "#FF3B30",
  },
  thumbRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  thumbWrap: {
    position: "relative",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#F1F1F3",
  },
  thumbRejected: {
    opacity: 0.45,
  },
  thumbVideoFallback: {
    backgroundColor: "#1c1c1e",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#8E8E93",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  badgeSpinner: {
    transform: [{ scale: 0.5 }],
  },
  badgeRejected: {
    backgroundColor: "#FF3B30",
  },
  badgeLate: {
    backgroundColor: "#FF9500",
  },
  postButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    backgroundColor: "#000",
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 16,
  },
  postButtonLabel: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
  postedButton: {
    backgroundColor: "#F2F2F7",
  },
  postedLabel: {
    color: "#000",
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
});

export default ChallengeCard;
