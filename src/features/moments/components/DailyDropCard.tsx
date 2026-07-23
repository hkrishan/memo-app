/**
 * Live card for a Daily Drop moment. Idle: "the next drop is a surprise".
 * While a drop is OPEN: a ticking mm:ss countdown to the deadline (turning
 * red as it nears zero), a prominent Post now button, and a row of who
 * already posted. Late window (up to 60 min past deadline) still allows
 * posting, flagged as late.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import {
  DailyDropConfig,
  LATE_WINDOW_MS,
  MomentEvent,
  MomentSubmission,
} from "../types/moment.types";
import { MomentCardProps } from "../registry/registry.types";
import { formatMmSs, useNow } from "../utils/time";
import MomentCardShell from "./MomentCardShell";

const ACCENT = "#FF9500";
const URGENT = "#FF3B30";

const findPostableEvent = (
  events: MomentEvent[],
  now: number,
): MomentEvent | undefined =>
  events.find(
    (event) =>
      event.status === "open" &&
      new Date(event.deadlineAt).getTime() + LATE_WINDOW_MS > now,
  );

const SubmittersRow: React.FC<{ submissions: MomentSubmission[] }> = ({
  submissions,
}) => {
  if (submissions.length === 0) {
    return <Text style={styles.nobodyText}>No one has posted yet — be first</Text>;
  }
  const shown = submissions.slice(0, 6);
  const extra = submissions.length - shown.length;
  return (
    <View style={styles.submittersRow}>
      <View style={styles.thumbStack}>
        {shown.map((submission, index) => {
          // BeReal lock: the photo is hidden until the viewer posts — show
          // a dark lock tile instead of an image
          if (submission.photo == null) {
            return (
              <View
                key={submission.submissionId}
                style={[
                  styles.thumb,
                  styles.thumbLocked,
                  index > 0 && styles.thumbOverlap,
                ]}
                accessibilityLabel={`${submission.user.name}'s hidden photo — post to unlock`}
              >
                <Ionicons
                  name="lock-closed"
                  size={10}
                  color="rgba(255, 255, 255, 0.9)"
                />
              </View>
            );
          }
          // Video submissions must never fall back to the video URL as a
          // "thumbnail" (expo-image can't render it) — a poster-less video
          // gets a dark play-glyph tile instead of a broken image
          const isVideo = submission.photo.mediaType === "video";
          const thumbUri = isVideo
            ? submission.photo.thumbnailUrl
            : (submission.photo.thumbnailUrl ?? submission.photo.url);
          if (thumbUri == null) {
            return (
              <View
                key={submission.submissionId}
                style={[
                  styles.thumb,
                  styles.thumbVideoFallback,
                  index > 0 && styles.thumbOverlap,
                ]}
                accessibilityLabel={`${submission.user.name}'s video`}
              >
                <Ionicons
                  name="play"
                  size={10}
                  color="rgba(255, 255, 255, 0.9)"
                />
              </View>
            );
          }
          const front = submission.frontPhoto;
          return (
            <View
              key={submission.submissionId}
              style={[styles.thumbWrap, index > 0 && styles.thumbOverlap]}
            >
              <Image
                source={{ uri: thumbUri }}
                style={styles.thumb}
                contentFit="cover"
                transition={120}
                accessibilityLabel={`${submission.user.name}'s photo`}
              />
              {front && (
                <Image
                  source={{ uri: front.thumbnailUrl ?? front.url }}
                  style={styles.thumbPip}
                  contentFit="cover"
                  transition={120}
                />
              )}
            </View>
          );
        })}
        {extra > 0 && (
          <View style={[styles.thumb, styles.thumbOverlap, styles.thumbMore]}>
            <Text style={styles.thumbMoreText}>+{extra}</Text>
          </View>
        )}
      </View>
      <Text style={styles.submittersText}>
        {submissions.length === 1
          ? `${submissions[0].user.name} posted`
          : `${submissions.length} posted`}
      </Text>
    </View>
  );
};

const DailyDropCard: React.FC<MomentCardProps> = ({
  moment,
  currentUserId,
  canCancel,
  onPostNow,
  onRequestCancel,
  onOpenPosts,
}) => {
  const config = moment.config as DailyDropConfig;

  // Tick every second only while a drop could be live
  const hasOpen = moment.events.some((event) => event.status === "open");
  const now = useNow(1000, hasOpen);
  const openEvent = hasOpen ? findPostableEvent(moment.events, now) : undefined;

  const firedCount = moment.events.filter((e) => e.firedAt != null).length;
  const totalDrops = config.days * config.dropsPerDay;
  const progress =
    firedCount > 0 ? `Drop ${Math.min(firedCount, totalDrops)} of ${totalDrops}` : null;

  const alreadyPosted =
    !!openEvent &&
    !!currentUserId &&
    openEvent.submissions.some((s) => s.userId === currentUserId);

  let body: React.ReactNode;
  if (openEvent) {
    const remainingMs = new Date(openEvent.deadlineAt).getTime() - now;
    const isLate = remainingMs <= 0;
    const urgent = !isLate && remainingMs < 60 * 1000;
    const countdownMs = isLate ? remainingMs + LATE_WINDOW_MS : remainingMs;

    body = (
      <View style={styles.liveArea}>
        <View style={styles.liveHeader}>
          <View style={[styles.liveDot, isLate && styles.liveDotLate]} />
          <Text style={[styles.liveLabel, isLate && styles.liveLabelLate]}>
            {isLate ? "Late window — you can still sneak one in" : "Drop is live!"}
          </Text>
        </View>
        <Text
          style={[
            styles.countdown,
            urgent && styles.countdownUrgent,
            isLate && styles.countdownLate,
          ]}
        >
          {formatMmSs(countdownMs)}
        </Text>
        {alreadyPosted ? (
          <View style={[styles.postButton, styles.postedButton]}>
            <Ionicons name="checkmark-circle" size={18} color="#34C759" />
            <Text style={styles.postedLabel}>You posted</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.postButton, urgent && styles.postButtonUrgent]}
            onPress={() => onPostNow(openEvent)}
            accessibilityRole="button"
            accessibilityLabel="Post now"
          >
            <Ionicons name="flash" size={16} color="#fff" />
            <Text style={styles.postButtonLabel}>Post now</Text>
          </Pressable>
        )}
        <SubmittersRow submissions={openEvent.submissions} />
      </View>
    );
  } else {
    body = (
      <View style={styles.surpriseArea}>
        <View style={styles.surpriseIcon}>
          <Ionicons name="sparkles" size={16} color={ACCENT} />
        </View>
        <View style={styles.surpriseText}>
          <Text style={styles.surpriseTitle}>The next drop is a surprise</Text>
          <Text style={styles.surpriseHint}>
            When it fires, everyone gets {config.responseWindowMinutes} minutes
            to post
          </Text>
        </View>
      </View>
    );
  }

  return (
    <MomentCardShell
      icon="flash"
      accentColor={ACCENT}
      title={moment.title || "Daily Drop"}
      subtitle={progress ?? undefined}
      canCancel={canCancel}
      onRequestCancel={onRequestCancel}
    >
      {/* Body tap → the posts feed. The nested Post now button keeps its
          own press — an inner Pressable claims the touch first. */}
      <Pressable
        onPress={onOpenPosts ? () => onOpenPosts(moment) : undefined}
        disabled={!onOpenPosts}
        accessibilityRole={onOpenPosts ? "button" : undefined}
        accessibilityLabel={onOpenPosts ? "See everyone's posts" : undefined}
      >
        {body}
      </Pressable>
    </MomentCardShell>
  );
};

const styles = StyleSheet.create({
  liveArea: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 4,
  },
  liveHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: URGENT,
  },
  liveDotLate: {
    backgroundColor: ACCENT,
  },
  liveLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: URGENT,
  },
  liveLabelLate: {
    color: ACCENT,
  },
  countdown: {
    fontSize: 44,
    fontWeight: "700",
    color: "#000",
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 12,
  },
  countdownUrgent: {
    color: URGENT,
  },
  countdownLate: {
    color: ACCENT,
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
  },
  postButtonUrgent: {
    backgroundColor: URGENT,
  },
  postButtonLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  postedButton: {
    backgroundColor: "#F2F2F7",
  },
  postedLabel: {
    color: "#000",
    fontSize: 15,
    fontWeight: "600",
  },
  submittersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    alignSelf: "flex-start",
  },
  thumbStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#F1F1F3",
  },
  thumbWrap: {
    width: 28,
    height: 28,
  },
  // Tiny BeReal-style front-camera shot pinned to the submitter's thumb
  thumbPip: {
    position: "absolute",
    top: -1,
    left: -1,
    width: 12,
    height: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "#F1F1F3",
  },
  thumbVideoFallback: {
    backgroundColor: "#1c1c1e",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbLocked: {
    backgroundColor: "#1c1c1e",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbOverlap: {
    marginLeft: -9,
  },
  thumbMore: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbMoreText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#666",
  },
  submittersText: {
    fontSize: 13,
    color: "#8E8E93",
  },
  nobodyText: {
    fontSize: 13,
    color: "#8E8E93",
    marginTop: 14,
    alignSelf: "flex-start",
  },
  surpriseArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    backgroundColor: "#FAFAFA",
    borderRadius: 14,
    padding: 14,
  },
  surpriseIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 149, 0, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  surpriseText: {
    flex: 1,
  },
  surpriseTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  surpriseHint: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 2,
    lineHeight: 16,
  },
});

export default DailyDropCard;
