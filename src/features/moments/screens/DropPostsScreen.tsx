/**
 * DropPostsScreen — the posts feed for a single moment, with the BeReal
 * lock mechanic. Every fired drop (open or closed) is a section, newest
 * first: date header ("LIVE" while open), then each submission as a big
 * post card. Locked submissions (the viewer hasn't posted to that event)
 * keep the author's identity visible but hide the photo behind a dark
 * lock tile — a pinned "Post your Drop to see everyone's" CTA opens the
 * capture screen while the open event is still postable. Posting refetches
 * the moments query, which unlocks everything.
 */

import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import Avatar from "@/components/ui/Avatar";
import { useGetAlbumQuery } from "@/features/album/api/album.queries";
import { memberColor } from "@/features/album/memberColor";
import useUser from "@/features/user/hooks/useUser";
import { useGetMomentsQuery } from "../api/moments.queries";
import { dropCaptureRoute } from "../hooks/useDropTakeover";
import {
  LATE_WINDOW_MS,
  MomentEvent,
  MomentSubmission,
} from "../types/moment.types";
import { formatShortDate, useNow } from "../utils/time";

const ACCENT = "#FF9500";
const LIVE_RED = "#FF3B30";

/** "14:05" / "2:05 PM" — locale-aware clock time */
const formatClockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

/** When an event happened — fired events always carry one of these */
const eventWhen = (event: MomentEvent): string | null =>
  event.firedAt ?? event.scheduledAt;

/** One BeReal-style post card: photo + front-camera PiP, or a lock tile */
const PostCard: React.FC<{
  submission: MomentSubmission;
  /** The author's album identity color (null until they picked one). */
  authorColor?: string | null;
}> = ({ submission, authorColor }) => {
  const photo = submission.photo;
  const front = submission.frontPhoto;
  // BeReal swap: tapping the PiP promotes it to the big frame
  const [swapped, setSwapped] = React.useState(false);
  const primary = swapped && front ? front : photo;
  const pip = photo != null && front != null ? (swapped ? photo : front) : null;
  // Video submissions must never fall back to the video URL as an image
  // source (expo-image can't render it) — poster-less videos get a dark
  // play tile instead of a broken image
  const isVideo = primary?.mediaType === "video";
  const mainUri =
    primary == null
      ? null
      : isVideo
        ? primary.thumbnailUrl
        : (primary.thumbnailUrl ?? primary.url);
  const pipUri =
    pip == null
      ? null
      : pip.mediaType === "video"
        ? pip.thumbnailUrl
        : (pip.thumbnailUrl ?? pip.url);

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <Avatar
          user={submission.user}
          size={32}
          ringColor={memberColor({ color: authorColor })}
        />
        <View style={styles.postHeaderText}>
          <Text style={styles.postAuthor} numberOfLines={1}>
            {submission.user.name}
          </Text>
          <Text style={styles.postTime}>
            {formatClockTime(submission.createdAt)}
          </Text>
        </View>
        {submission.late && (
          <View style={styles.lateTag}>
            <Ionicons name="time" size={10} color="#fff" />
            <Text style={styles.lateTagText}>LATE</Text>
          </View>
        )}
      </View>

      {photo == null ? (
        <View
          style={[styles.postPhoto, styles.postLocked]}
          accessibilityLabel={`${submission.user.name}'s photo is hidden — post to unlock`}
        >
          <View style={styles.lockBadge}>
            <Ionicons
              name="lock-closed"
              size={22}
              color="rgba(255, 255, 255, 0.9)"
            />
          </View>
          <Text style={styles.lockedCaption}>Post to unlock</Text>
        </View>
      ) : (
        <View style={styles.postPhoto}>
          {mainUri == null ? (
            <View style={[StyleSheet.absoluteFill, styles.videoFallback]}>
              <Ionicons name="play" size={34} color="rgba(255, 255, 255, 0.9)" />
            </View>
          ) : (
            <Image
              source={{ uri: mainUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={150}
              accessibilityLabel={`${submission.user.name}'s photo`}
            />
          )}
          {isVideo && mainUri != null && (
            <View style={styles.playBadge}>
              <Ionicons name="play" size={13} color="#fff" />
            </View>
          )}
          {pip && (
            <Pressable
              onPress={() => setSwapped((s) => !s)}
              style={styles.postPip}
              accessibilityRole="button"
              accessibilityLabel="Swap camera views"
              hitSlop={8}
            >
              {pipUri == null ? (
                <View style={[StyleSheet.absoluteFill, styles.videoFallback]}>
                  <Ionicons
                    name="play"
                    size={16}
                    color="rgba(255, 255, 255, 0.9)"
                  />
                </View>
              ) : (
                <Image
                  source={{ uri: pipUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={150}
                />
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
};

/** Section header + the event's submissions as a vertical feed */
const EventSection: React.FC<{
  event: MomentEvent;
  /** userId -> album identity color, from the album's members. */
  colorByUserId: Map<string, string | null>;
}> = ({ event, colorByUserId }) => {
  const when = eventWhen(event);
  const isLive = event.status === "open";
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionDate}>
          {when ? `${formatShortDate(when)} · ${formatClockTime(when)}` : "Drop"}
        </Text>
        {isLive && (
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTagText}>LIVE</Text>
          </View>
        )}
      </View>
      {event.submissions.length === 0 ? (
        <Text style={styles.sectionEmpty}>
          {isLive ? "No one has posted yet" : "No one posted for this drop"}
        </Text>
      ) : (
        event.submissions.map((submission) => (
          <PostCard
            key={submission.submissionId}
            submission={submission}
            authorColor={colorByUserId.get(submission.userId)}
          />
        ))
      )}
    </View>
  );
};

const DropPostsScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { albumId, momentId } = useLocalSearchParams<{
    albumId: string;
    momentId: string;
  }>();
  const { user } = useUser();
  const { data: album } = useGetAlbumQuery(albumId ?? "");
  const { data: moments, isLoading } = useGetMomentsQuery(albumId ?? "");

  const moment = useMemo(
    () => moments?.find((m) => m.momentId === momentId),
    [moments, momentId],
  );

  // Slow tick only while an event is open — just enough to retire the CTA
  // when the late window passes (the query itself polls every 15s then)
  const hasOpen = !!moment?.events.some((event) => event.status === "open");
  const now = useNow(30 * 1000, hasOpen);

  // Author identity colors — same album, members ride on the album query
  const colorByUserId = useMemo(() => {
    const map = new Map<string, string | null>();
    (album?.members ?? []).forEach((member) => {
      map.set(member.userId, member.color);
    });
    return map;
  }, [album?.members]);

  // Fired drops (open or closed), newest first
  const firedEvents = useMemo(() => {
    if (!moment) return [];
    return moment.events
      .filter((event) => event.status === "open" || event.status === "closed")
      .slice()
      .sort(
        (a, b) =>
          new Date(eventWhen(b) ?? b.deadlineAt).getTime() -
          new Date(eventWhen(a) ?? a.deadlineAt).getTime(),
      );
  }, [moment]);

  // The unlock CTA: an open event still within its late window that the
  // viewer hasn't posted to. Hidden once nothing is postable.
  const openEvent = moment?.events.find(
    (event) =>
      event.status === "open" &&
      new Date(event.deadlineAt).getTime() + LATE_WINDOW_MS > now,
  );
  const viewerPosted =
    !!openEvent &&
    !!user &&
    openEvent.submissions.some((s) => s.userId === user.userId);
  const showCta = !!openEvent && !viewerPosted;

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handlePostNow = useCallback(() => {
    if (!albumId || !moment || !openEvent) return;
    router.push(
      dropCaptureRoute({
        albumId,
        momentId: moment.momentId,
        eventId: openEvent.eventId,
        deadlineAt: openEvent.deadlineAt,
        albumTitle: album?.title,
      }) as Parameters<typeof router.push>[0],
    );
  }, [albumId, moment, openEvent, album?.title, router]);

  const totalSubmissions = firedEvents.reduce(
    (sum, event) => sum + event.submissions.length,
    0,
  );

  let body: React.ReactNode;
  if (isLoading && !moment) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  } else if (!moment) {
    body = (
      <View style={styles.center}>
        <Ionicons name="flash-off-outline" size={36} color="#C7C7CC" />
        <Text style={styles.emptyTitle}>This moment is gone</Text>
      </View>
    );
  } else if (firedEvents.length === 0) {
    body = (
      <View style={styles.center}>
        <View style={styles.emptyBadge}>
          <Ionicons name="sparkles" size={22} color={ACCENT} />
        </View>
        <Text style={styles.emptyTitle}>
          The first drop hasn&apos;t happened yet
        </Text>
        <Text style={styles.emptyHint}>
          When it fires, everyone&apos;s posts will show up here
        </Text>
      </View>
    );
  } else if (totalSubmissions === 0) {
    body = (
      <View style={styles.center}>
        <View style={styles.emptyBadge}>
          <Ionicons name="camera-outline" size={22} color={ACCENT} />
        </View>
        <Text style={styles.emptyTitle}>No one has posted yet — be the first</Text>
      </View>
    );
  } else {
    body = (
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: (showCta ? 96 : 24) + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {firedEvents.map((event) => (
          <EventSection
            key={event.eventId}
            event={event}
            colorByUserId={colorByUserId}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={handleBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={28} color="#000" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {moment?.title || "Daily Drop"}
          </Text>
          {!!album?.title && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {album.title}
            </Text>
          )}
        </View>
        <View style={styles.placeholder} />
      </View>

      {body}

      {showCta && (
        <View
          style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <Pressable
            style={styles.ctaButton}
            onPress={handlePostNow}
            accessibilityRole="button"
            accessibilityLabel="Post your Drop to see everyone's"
          >
            <Ionicons name="flash" size={16} color="#fff" />
            <Text style={styles.ctaLabel}>Post your Drop to see everyone&apos;s</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 1,
  },
  placeholder: {
    width: 40,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 149, 0, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 13,
    color: "#8E8E93",
    textAlign: "center",
    lineHeight: 18,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  section: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionDate: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: LIVE_RED,
  },
  liveTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: LIVE_RED,
    letterSpacing: 0.5,
  },
  sectionEmpty: {
    fontSize: 13,
    color: "#8E8E93",
    marginBottom: 14,
  },
  postCard: {
    marginBottom: 20,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  postHeaderText: {
    flex: 1,
  },
  postAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  postTime: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 1,
  },
  lateTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  lateTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },
  postPhoto: {
    aspectRatio: 3 / 4,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#F1F1F3",
  },
  // Tiny BeReal-style front-camera shot pinned to the photo's corner
  postPip: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 84,
    height: 112,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#F1F1F3",
    // Children are absoluteFill images — clip them to the rounded frame
    overflow: "hidden",
  },
  postLocked: {
    backgroundColor: "#1c1c1e",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  lockBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  lockedCaption: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.65)",
  },
  videoFallback: {
    backgroundColor: "#1c1c1e",
    alignItems: "center",
    justifyContent: "center",
  },
  playBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0, 0, 0, 0.08)",
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#000",
    borderRadius: 14,
    paddingVertical: 14,
  },
  ctaLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});

export default DropPostsScreen;
