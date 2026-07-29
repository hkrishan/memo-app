import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  ZoomIn,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ProgressRing } from "@/components/ui/ProgressRing";
import {
  dismissUploadBatch,
  isBatchSettled,
  retryFailedUploads,
  useUploadManagerStore,
} from "@/features/album/store/uploadManager";

const SHOW_SPRING = { damping: 14, stiffness: 260, mass: 0.7 };
const HIDE_SPRING = { damping: 20, stiffness: 260, mass: 0.6 };

const PILL_SIZE = 52;
const GREEN = "#34d399";
const RED = "#ef4444";

/**
 * Global floating upload progress. While a batch exists, a small dark
 * circular pill floats bottom-right with a live progress ring and the
 * remaining count. Tapping it opens a fullscreen "Upload" modal with the
 * big ring, counts, album title and — after a batch settles with
 * failures — retry/dismiss controls.
 *
 * Rendered once in the root layout, next to the other global hosts.
 * Only the 52pt pill itself is touchable; it sits below the notification
 * toasts (zIndex 9997 < NotificationManager's 9999).
 */
export default function UploadProgressHost() {
  const insets = useSafeAreaInsets();
  const batch = useUploadManagerStore((s) => s.batch);
  const [expanded, setExpanded] = useState(false);

  // Keep the pill mounted while it animates out, then drop it entirely
  const [rendered, setRendered] = useState(batch !== null);

  const progress = useSharedValue(0);
  const pillScale = useSharedValue(0.5);
  const pillOpacity = useSharedValue(0);

  const hasBatch = batch !== null;
  const total = batch?.total ?? 0;
  const completed = batch?.completed ?? 0;
  const failedCount = batch?.failedAssets.length ?? 0;
  const done = batch?.status === "done";
  const settled = batch ? isBatchSettled(batch) : false;
  const failed = settled && failedCount > 0 && !done;
  const remaining = Math.max(total - completed - failedCount, 0);

  // Pill spring-in / fade-out
  useEffect(() => {
    if (hasBatch) {
      setRendered(true);
      pillScale.value = withSpring(1, SHOW_SPRING);
      pillOpacity.value = withTiming(1, { duration: 160 });
    } else {
      setExpanded(false);
      pillScale.value = withSpring(0.5, HIDE_SPRING);
      pillOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) {
          runOnJS(setRendered)(false);
        }
      });
      progress.value = 0;
    }
  }, [hasBatch, pillScale, pillOpacity, progress]);

  // Ring fill: honest fraction of settled photos, with a sliver of fill at
  // the start so the ring reads as "in progress" before the first one lands
  useEffect(() => {
    if (!hasBatch) return;
    const fraction = total > 0 ? (completed + failedCount) / total : 0;
    const target = done ? 1 : Math.max(fraction, 0.04);
    progress.value = withTiming(target, {
      duration: 250,
      easing: Easing.out(Easing.cubic),
    });
  }, [hasBatch, completed, failedCount, total, done, progress]);

  // Live percent for the big ring (mirrors the old AddPhotosScreen
  // overlay). Only read inside the expanded modal — while it's closed
  // (99% of the time) the reaction must not commit React state: each
  // progress tween crossed every integer percent and re-rendered this
  // always-mounted host per step.
  const [displayPercent, setDisplayPercent] = useState(0);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const commitPercent = useCallback((percent: number) => {
    if (expandedRef.current) setDisplayPercent(percent);
  }, []);
  const expandedSv = useSharedValue(expanded);
  useEffect(() => {
    expandedSv.value = expanded;
    // Snap the label current the moment the sheet opens
    if (expanded) {
      setDisplayPercent(
        Math.round(Math.min(Math.max(progress.value, 0), 1) * 100),
      );
    }
  }, [expanded, expandedSv, progress]);
  useAnimatedReaction(
    () => Math.round(Math.min(Math.max(progress.value, 0), 1) * 100),
    (percent, previous) => {
      if (percent !== previous && expandedSv.value) {
        runOnJS(commitPercent)(percent);
      }
    },
  );

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pillScale.value }],
    opacity: pillOpacity.value,
  }));

  if (!rendered) {
    return null;
  }

  const ringColor = failed ? RED : done ? GREEN : "#fff";

  return (
    <>
      {/* Floating pill — the wrapper is exactly pill-sized, so touches
          anywhere around it pass straight through to the app */}
      <Animated.View
        style={[
          styles.pillWrapper,
          { bottom: insets.bottom + 88 },
          pillStyle,
        ]}
      >
        <Pressable
          style={styles.pill}
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          accessibilityLabel="Show upload progress"
        >
          <ProgressRing
            progress={progress}
            size={38}
            strokeWidth={3}
            trackColor="rgba(255,255,255,0.18)"
            color={ringColor}
          >
            {done ? (
              <Animated.View entering={ZoomIn.springify().damping(12)}>
                <Ionicons name="checkmark" size={18} color={GREEN} />
              </Animated.View>
            ) : failed ? (
              <Ionicons name="alert" size={16} color={RED} />
            ) : (
              <Text style={styles.pillCount} numberOfLines={1}>
                {remaining}
              </Text>
            )}
          </ProgressRing>
        </Pressable>
      </Animated.View>

      {/* Expanded "Upload" screen */}
      <Modal
        visible={expanded && hasBatch}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setExpanded(false)}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Upload</Text>
            <Pressable
              style={styles.closeButton}
              onPress={() => setExpanded(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="chevron-down" size={20} color="#111" />
            </Pressable>
          </View>

          <View style={styles.sheetBody}>
            <ProgressRing progress={progress} size={156} strokeWidth={7}>
              {done ? (
                <Animated.View entering={ZoomIn.springify().damping(12)}>
                  <Ionicons name="checkmark" size={52} color="#111" />
                </Animated.View>
              ) : (
                <Text style={styles.sheetPercent}>{displayPercent}%</Text>
              )}
            </ProgressRing>

            <Text style={styles.sheetStatus}>
              {done
                ? total === 1
                  ? "Photo added"
                  : `${total} photos added`
                : failed
                  ? "Upload finished with errors"
                  : "Uploading to album…"}
            </Text>
            <Text style={styles.sheetCount}>
              {completed} of {total} photo{total !== 1 ? "s" : ""}
            </Text>
            {batch?.albumTitle ? (
              <Text style={styles.sheetAlbum} numberOfLines={1}>
                {batch.albumTitle}
              </Text>
            ) : null}

            {failed && (
              <View style={styles.failedCard}>
                <View style={styles.failedRow}>
                  <Ionicons name="alert-circle" size={18} color={RED} />
                  <Text style={styles.failedText}>
                    {failedCount} photo{failedCount !== 1 ? "s" : ""} didn't
                    make it
                  </Text>
                </View>
                <View style={styles.failedActions}>
                  <Pressable
                    style={styles.retryPill}
                    onPress={retryFailedUploads}
                    accessibilityRole="button"
                  >
                    <Ionicons name="refresh" size={15} color="#fff" />
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                  <Pressable
                    style={styles.dismissButton}
                    onPress={() => {
                      setExpanded(false);
                      dismissUploadBatch();
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.dismissText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pillWrapper: {
    position: "absolute",
    right: 16,
    width: PILL_SIZE,
    height: PILL_SIZE,
    // Below NotificationManager (9999) and the top upload capsule (9998)
    zIndex: 9997,
  },
  pill: {
    width: PILL_SIZE,
    height: PILL_SIZE,
    borderRadius: PILL_SIZE / 2,
    backgroundColor: "rgba(20,20,20,0.94)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  pillCount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    fontVariant: ["tabular-nums"],
  },
  sheet: {
    flex: 1,
    backgroundColor: "#fff",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 8,
  },
  sheetPercent: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.5,
  },
  sheetStatus: {
    marginTop: 14,
    fontSize: 17,
    fontWeight: "600",
    color: "#111",
  },
  sheetCount: {
    fontSize: 14,
    color: "#98989e",
    fontVariant: ["tabular-nums"],
  },
  sheetAlbum: {
    fontSize: 14,
    color: "#98989e",
    maxWidth: "80%",
  },
  failedCard: {
    marginTop: 24,
    alignSelf: "stretch",
    borderRadius: 16,
    backgroundColor: "rgba(239,68,68,0.08)",
    padding: 16,
    gap: 14,
  },
  failedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  failedText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#b91c1c",
    flexShrink: 1,
  },
  failedActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  retryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#111",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  dismissButton: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#98989e",
  },
});
