// Unread-message count for an album's chat, shown as a badge on the album
// screen's chat button.
//
// Shares the singleton chat transport with the chat screen: the transport
// keeps a Set of subscriber callbacks per album, joins the room once, and
// leaves only when the last subscriber unsubscribes — so this hook can
// subscribe alongside the chat screen without touching its behavior.
//
// Best-effort by design: while offline or when history can't load, the
// count is simply 0. No errors are surfaced from here.

import { useCallback, useEffect, useRef, useState } from "react";
import { selectUser, useAuthStore } from "@/features/auth";
import { useBlockedUserIds } from "@/features/moderation/api/moderation.queries";
import { getChatTransport } from "../transport/chatTransport";
import type { ChatMessage } from "../types/chat.types";
import { getLastRead, subscribeToLastRead } from "./lastRead";

const HISTORY_LIMIT = 50;
/** Display cap — the badge renders "99+" at this value. */
export const UNREAD_CAP = 99;

export function useAlbumChatUnread(albumId: string | undefined): number {
  const authUser = useAuthStore(selectUser);
  const blockedUserIds = useBlockedUserIds();

  const [count, setCount] = useState(0);

  /** Known messages (recent history page + live), deduped by id. */
  const messagesRef = useRef(new Map<string, ChatMessage>());
  const lastReadRef = useRef(0);
  /** Suppress counting until the stored watermark has loaded (no flash). */
  const lastReadReadyRef = useRef(false);

  // Refs mirroring reactive values so the transport callbacks never go stale
  const currentUserIdRef = useRef(authUser?.id);
  currentUserIdRef.current = authUser?.id;
  const blockedRef = useRef(blockedUserIds);
  blockedRef.current = blockedUserIds;

  const recompute = useCallback(() => {
    if (!lastReadReadyRef.current) {
      setCount(0);
      return;
    }
    let unread = 0;
    for (const message of messagesRef.current.values()) {
      if (message.senderId === currentUserIdRef.current) continue;
      if (blockedRef.current.has(message.senderId)) continue;
      if (new Date(message.createdAt).getTime() <= lastReadRef.current) {
        continue;
      }
      unread++;
    }
    setCount(Math.min(unread, UNREAD_CAP));
  }, []);

  // Re-filter when the block list or the signed-in user changes.
  useEffect(() => {
    recompute();
  }, [blockedUserIds, authUser?.id, recompute]);

  // Last-read watermark: load the stored value and follow updates from the
  // chat screen (opening chat marks read -> this fires -> badge clears).
  useEffect(() => {
    if (!albumId) return;

    let active = true;
    lastReadRef.current = 0;
    lastReadReadyRef.current = false;

    void getLastRead(albumId).then((timestampMs) => {
      if (!active) return;
      lastReadRef.current = Math.max(lastReadRef.current, timestampMs);
      lastReadReadyRef.current = true;
      recompute();
    });

    const unsubscribe = subscribeToLastRead(albumId, (timestampMs) => {
      lastReadRef.current = Math.max(lastReadRef.current, timestampMs);
      lastReadReadyRef.current = true;
      recompute();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [albumId, recompute]);

  // Transport subscription + most recent history page.
  useEffect(() => {
    if (!albumId) return;

    let active = true;
    let historyLoaded = false;
    let historyInFlight = false;
    messagesRef.current = new Map();
    setCount(0);

    const transport = getChatTransport();

    const loadHistory = async () => {
      if (historyLoaded || historyInFlight) return;
      historyInFlight = true;
      try {
        const page = await transport.fetchPage({
          albumId,
          limit: HISTORY_LIMIT,
        });
        if (!active) return;
        historyLoaded = true;
        for (const message of page.messages) {
          messagesRef.current.set(message.id, message);
        }
        recompute();
      } catch {
        // Offline / join failed — badge stays at 0; retried on reconnect.
      } finally {
        historyInFlight = false;
      }
    };

    const subscription = transport.subscribe(albumId, {
      onMessage: (message) => {
        if (!active || message.albumId !== albumId) return;
        messagesRef.current.set(message.id, message);
        recompute();
      },
      onMessageUpdated: () => {},
      onTypingChanged: () => {},
      onError: () => {
        // Badge is best-effort; errors surface in the chat screen instead.
      },
      onConnectionChanged: (connected) => {
        if (active && connected && !historyLoaded) void loadHistory();
      },
    });

    void loadHistory();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [albumId, recompute]);

  return count;
}
