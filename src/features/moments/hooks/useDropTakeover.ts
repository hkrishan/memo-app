/**
 * App-entry drop takeover — the BeReal moment. Mounted ONCE in the
 * authenticated layout: whenever the app opens, foregrounds, or a moment
 * push lands while foregrounded, the open-drops query is refreshed; if the
 * user still owes a post to an open drop, the capture screen takes over
 * full-screen. Dismissing it (the X) parks that event in a module-level
 * set — persisted to AsyncStorage so an app relaunch doesn't nag either;
 * posting removes it from the query.
 *
 * The same fetch feeds the iOS Live Activity (dailyDropActivitySync), so
 * the lock-screen countdown starts wherever the app happens to be — not
 * just on the Moments tab.
 */
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { usePathname, useRouter } from "expo-router";

import {
  selectIsAuthenticated,
  useAuthStore,
} from "@/features/auth/store/authStore";
import { holdSocket, releaseSocket } from "@/lib/socket/socketClient";
import { useOpenDropsQuery } from "../api/moments.queries";
import { OpenDrop } from "../types/moment.types";
import { syncDailyDropActivities } from "./dailyDropActivitySync";

/**
 * Events the user explicitly closed the capture screen for. Persisted so a
 * dismissal survives an app relaunch — insertion order is dismissal order,
 * and only the most recent DISMISSED_STORE_LIMIT ids are kept (events are
 * short-lived, so old ids are dead weight).
 */
const dismissedEventIds = new Set<string>();

const DISMISSED_STORAGE_KEY = "moments:dismissedDropEventIds";
const DISMISSED_STORE_LIMIT = 30;

/** Resolves once the persisted dismissals are loaded into the set */
let hydrationPromise: Promise<void> | null = null;

function hydrateDismissedEventIds(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = AsyncStorage.getItem(DISMISSED_STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const ids: unknown = JSON.parse(raw);
        if (!Array.isArray(ids)) return;
        for (const id of ids) {
          if (typeof id === "string") dismissedEventIds.add(id);
        }
      })
      .catch(() => {
        // Unreadable store — worst case the takeover shows once more
      });
  }
  return hydrationPromise;
}

function persistDismissedEventIds(): void {
  const recent = [...dismissedEventIds].slice(-DISMISSED_STORE_LIMIT);
  AsyncStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(recent)).catch(
    () => {
      // Best-effort — in-memory set still covers this session
    },
  );
}

/** True while a takeover push is on screen — never present twice */
let currentlyPresenting = false;

/**
 * Called by the capture screen when it goes away (X, missed-state close,
 * or after a successful post — harmless then, the query drops the event).
 * Write-through: the dismissal also lands in AsyncStorage so relaunching
 * the app doesn't re-open the takeover for the same event.
 */
export function dismissDropTakeover(eventId: string): void {
  dismissedEventIds.add(eventId);
  currentlyPresenting = false;
  persistDismissedEventIds();
}

/** The drop capture route, with optional context the screen can't fetch */
export function dropCaptureRoute(drop: {
  albumId: string;
  momentId: string;
  eventId: string;
  deadlineAt?: string;
  albumTitle?: string;
}): string {
  const query = [
    drop.deadlineAt && `deadlineAt=${encodeURIComponent(drop.deadlineAt)}`,
    drop.albumTitle && `albumTitle=${encodeURIComponent(drop.albumTitle)}`,
  ]
    .filter(Boolean)
    .join("&");
  return (
    `/drop/${drop.albumId}/${drop.momentId}/${drop.eventId}` +
    (query ? `?${query}` : "")
  );
}

export function useDropTakeover(): void {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const { data: drops, refetch } = useOpenDropsQuery();

  // Gate: the takeover must never fire before the persisted dismissals are
  // in the set, or a relaunch would re-open an already-dismissed event
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void hydrateDismissedEventIds().then(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ref mirror so the takeover effect reads the route it would fire on
  // without re-running on every navigation
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Refresh triggers beyond the query's own mount fetch / slow poll:
  // foregrounding, a moment push received while the app is open, and the
  // realtime `moment:drop` broadcast from memo-socket (the cron relays a
  // fired drop to every member's personal room, so an open app reacts
  // within a second — no poll or push latency).
  useEffect(() => {
    if (!isAuthenticated) return;

    // Keep the socket up for the whole authenticated session (survives
    // chat teardown via the hold refcount)
    const socket = holdSocket("drop-takeover");
    const onDropFired = () => void refetch();
    socket.on("moment:drop", onDropFired);

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        // iOS suspends the socket in the background; make sure it comes
        // back before relying on it
        if (!socket.connected) socket.connect();
        void refetch();
      }
    });
    const notificationSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        if (notification.request.content.data?.type === "moment") {
          void refetch();
        }
      },
    );
    return () => {
      socket.off("moment:drop", onDropFired);
      releaseSocket("drop-takeover");
      appStateSub.remove();
      notificationSub.remove();
    };
  }, [isAuthenticated, refetch]);

  // Fresh drops → sync the Live Activity, then take over if one is owed
  useEffect(() => {
    if (!isAuthenticated || !drops) return;

    syncDailyDropActivities(drops);

    if (!hydrated) return;
    if (drops.length === 0) return;
    const drop: OpenDrop =
      drops.find((d) => d.momentType === "daily_drop") ?? drops[0];
    if (dismissedEventIds.has(drop.eventId)) return;
    if (currentlyPresenting) return;
    if (pathnameRef.current?.startsWith("/drop/")) return;

    currentlyPresenting = true;
    router.push(
      dropCaptureRoute({
        albumId: drop.albumId,
        momentId: drop.momentId,
        eventId: drop.eventId,
        deadlineAt: drop.deadlineAt,
        albumTitle: drop.albumTitle,
      }) as Parameters<typeof router.push>[0],
    );
  }, [isAuthenticated, drops, hydrated, router]);
}
