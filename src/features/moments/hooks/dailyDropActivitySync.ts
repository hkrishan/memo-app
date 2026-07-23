/**
 * Single source of truth for the iOS daily-drop Live Activity (lock screen /
 * Dynamic Island countdown). Fed the open-drops list (all albums) by the
 * global takeover hook whenever it refetches — app start, foregrounding,
 * moment pushes, and the query's slow poll — so the widget's own timer
 * counts down natively between updates.
 *
 * Started event ids are tracked module-wide so re-renders and re-mounts
 * never re-request an activity for the same drop. The native module keeps
 * at most one activity (start replaces), so ending is all-or-nothing:
 * once no drop we started remains open, everything is torn down.
 */
import { Platform } from "react-native";

import {
  endDailyDropActivities,
  startDailyDropActivity,
} from "../../../../modules/daily-drop-activity";
import type { OpenDrop } from "../types/moment.types";

const startedEventIds = new Set<string>();

export function syncDailyDropActivities(drops: OpenDrop[]): void {
  if (Platform.OS !== "ios") return;

  const now = Date.now();
  const liveDrops = drops.filter(
    (drop) =>
      drop.momentType === "daily_drop" &&
      new Date(drop.deadlineAt).getTime() > now,
  );

  if (liveDrops.length === 0) {
    if (startedEventIds.size > 0) {
      endDailyDropActivities();
      startedEventIds.clear();
    }
    return;
  }

  for (const drop of liveDrops) {
    if (startedEventIds.has(drop.eventId)) continue;
    const deadlineMs = new Date(drop.deadlineAt).getTime();
    if (startDailyDropActivity(drop.albumId, drop.albumTitle, deadlineMs)) {
      startedEventIds.add(drop.eventId);
    }
  }

  // Forget ids that are no longer live — a later drop's start already
  // replaced their activity, so no explicit end is needed here
  const liveIds = new Set(liveDrops.map((drop) => drop.eventId));
  for (const id of Array.from(startedEventIds)) {
    if (!liveIds.has(id)) startedEventIds.delete(id);
  }
}
