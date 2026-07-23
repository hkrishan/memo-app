// Socket.IO-backed implementation of ChatTransport.
//
// Server contract (memo-socket, see socket server repo):
//   emit "chat:join"    { albumId }                     ack { ok } | { ok:false, error }
//   emit "chat:leave"   { albumId }
//   emit "chat:history" { albumId, before?, limit? }    ack { ok, messages (newest first), hasMore }
//   emit "chat:send"    { albumId, content, clientId }  ack { ok, message }
//   emit "chat:typing"  { albumId, typing }
//   on   "chat:message" (message)  — room broadcast, includes our own sends
//   on   "chat:typing"  ({ albumId, user: { userId, name }, typing })

import type { Socket } from "socket.io-client";
import { getSocket, disconnectSocket } from "@/lib/socket/socketClient";
import type {
  ChatTransport,
  ChatTransportCallbacks,
  ChatTransportSubscription,
} from "./chatTransport";
import type {
  ChatMessage,
  FetchPageParams,
  FetchPageResult,
  SendMessageParams,
  TypingUser,
} from "../types/chat.types";

// --- Wire types ---------------------------------------------------------

interface WireChatMessage {
  messageId: string;
  albumId: string;
  userId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  createdAt: string; // ISO
  clientId?: string;
}

interface WireTypingEvent {
  albumId: string;
  user: { userId: string; name: string };
  typing: boolean;
}

type Ack<T extends object = {}> =
  | ({ ok: true } & T)
  | { ok: false; error?: string };

// --- Tunables -----------------------------------------------------------

const ACK_TIMEOUT_MS = 10000;
const CONNECT_TIMEOUT_MS = 10000;
const DEFAULT_PAGE_SIZE = 30;
const TYPING_THROTTLE_MS = 2000;
const TYPING_EXPIRE_MS = 7000; // local safety net; server expires at ~6s
const MAX_TRACKED_CLIENT_IDS = 200;

const generateClientId = () =>
  `c-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

function mapWireMessage(wire: WireChatMessage): ChatMessage {
  return {
    id: wire.messageId,
    clientId: wire.clientId,
    albumId: wire.albumId,
    senderId: wire.userId,
    text: wire.content,
    createdAt: wire.createdAt,
    status: "sent",
    type: "user",
    authorName: wire.authorName,
    authorAvatarUrl: wire.authorAvatarUrl,
  };
}

function ackError(ack: Ack | undefined, fallback: string): Error {
  const message =
    ack && ack.ok === false && ack.error ? ack.error : fallback;
  return new Error(message);
}

interface TypingEntry {
  user: TypingUser;
  timer: ReturnType<typeof setTimeout>;
}

// --- Transport ----------------------------------------------------------

export class SocketChatTransport implements ChatTransport {
  /** Albums we want to be joined to (re-joined on reconnect). */
  private joinedAlbums = new Set<string>();
  private joinPromises = new Map<string, Promise<void>>();

  /** Subscriber callbacks, per album. */
  private subscribers = new Map<string, Set<ChatTransportCallbacks>>();

  /** clientIds of sends issued from this device — used to dedupe the
   *  room broadcast of our own message (the send ack already delivered it). */
  private ownClientIds = new Set<string>();

  /** Aggregated remote typers per album, with local expiry timers. */
  private typingByAlbum = new Map<string, Map<string, TypingEntry>>();

  /** Outgoing typing throttle state. */
  private typingActive = false;
  private lastTypingEmitAt = 0;

  /** Socket instance the listeners are currently attached to. */
  private listeningSocket: Socket | null = null;

  // --- socket plumbing --------------------------------------------------

  private socket(): Socket {
    const socket = getSocket();
    if (this.listeningSocket !== socket) {
      this.attachListeners(socket);
      this.listeningSocket = socket;
    }
    return socket;
  }

  private attachListeners(socket: Socket): void {
    socket.on("connect", () => {
      // Re-join every active album after (re)connect. Join promises from the
      // previous connection are stale — clear them so joins actually re-fire.
      this.joinPromises.clear();
      for (const albumId of this.joinedAlbums) {
        void this.ensureJoined(albumId).catch((error: Error) => {
          this.emitToAlbum(albumId, (cb) => cb.onError(error));
        });
      }
      this.emitToAll((cb) => cb.onConnectionChanged?.(true));
    });

    socket.on("disconnect", () => {
      this.emitToAll((cb) => cb.onConnectionChanged?.(false));
    });

    socket.on("connect_error", (error: Error) => {
      this.emitToAll((cb) => {
        cb.onConnectionChanged?.(false);
        cb.onError(
          new Error(`Chat connection error: ${error.message || "unknown"}`),
        );
      });
    });

    socket.on("chat:message", (wire: WireChatMessage) => {
      if (!wire?.messageId || !wire.albumId) return;
      // Our own send comes back as a room broadcast too; the ack already
      // delivered it to the UI, so drop it here.
      if (wire.clientId && this.ownClientIds.has(wire.clientId)) return;
      const message = mapWireMessage(wire);
      this.emitToAlbum(wire.albumId, (cb) => cb.onMessage(message));
    });

    socket.on("chat:typing", (event: WireTypingEvent) => {
      if (!event?.albumId || !event.user?.userId) return;
      this.handleTypingEvent(event);
    });
  }

  private emitToAlbum(
    albumId: string,
    fn: (cb: ChatTransportCallbacks) => void,
  ): void {
    const callbacks = this.subscribers.get(albumId);
    if (!callbacks) return;
    callbacks.forEach((cb) => {
      try {
        fn(cb);
      } catch {
        // Never let a subscriber error break transport dispatch
      }
    });
  }

  private emitToAll(fn: (cb: ChatTransportCallbacks) => void): void {
    this.subscribers.forEach((_set, albumId) => this.emitToAlbum(albumId, fn));
  }

  private waitForConnect(socket: Socket): Promise<void> {
    if (socket.connected) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        socket.off("connect", onConnect);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Chat connection timed out"));
      }, CONNECT_TIMEOUT_MS);
      socket.once("connect", onConnect);
      socket.connect();
    });
  }

  /** Connect (if needed) and join the album room, memoizing the join ack. */
  private ensureJoined(albumId: string): Promise<void> {
    this.joinedAlbums.add(albumId);
    const existing = this.joinPromises.get(albumId);
    if (existing) return existing;

    const socket = this.socket();
    const promise = this.waitForConnect(socket)
      .then(() =>
        socket
          .timeout(ACK_TIMEOUT_MS)
          .emitWithAck("chat:join", { albumId }) as Promise<Ack>,
      )
      .then((ack) => {
        if (!ack || ack.ok !== true) {
          throw ackError(ack, "Failed to join chat");
        }
      });

    // Drop failed joins from the cache so the next call retries.
    promise.catch(() => {
      if (this.joinPromises.get(albumId) === promise) {
        this.joinPromises.delete(albumId);
      }
    });

    this.joinPromises.set(albumId, promise);
    return promise;
  }

  private trackOwnClientId(clientId: string): void {
    this.ownClientIds.add(clientId);
    if (this.ownClientIds.size > MAX_TRACKED_CLIENT_IDS) {
      const oldest = this.ownClientIds.values().next().value;
      if (oldest) this.ownClientIds.delete(oldest);
    }
  }

  // --- typing (incoming) ------------------------------------------------

  private handleTypingEvent(event: WireTypingEvent): void {
    let albumTypers = this.typingByAlbum.get(event.albumId);
    if (!albumTypers) {
      albumTypers = new Map();
      this.typingByAlbum.set(event.albumId, albumTypers);
    }

    const existing = albumTypers.get(event.user.userId);
    if (existing) clearTimeout(existing.timer);

    if (event.typing) {
      const timer = setTimeout(() => {
        const typers = this.typingByAlbum.get(event.albumId);
        if (typers?.delete(event.user.userId)) {
          this.notifyTypingChanged(event.albumId);
        }
      }, TYPING_EXPIRE_MS);
      albumTypers.set(event.user.userId, {
        user: { userId: event.user.userId, name: event.user.name },
        timer,
      });
    } else {
      albumTypers.delete(event.user.userId);
    }

    this.notifyTypingChanged(event.albumId);
  }

  private notifyTypingChanged(albumId: string): void {
    const typers = this.typingByAlbum.get(albumId);
    const users = typers ? [...typers.values()].map((t) => t.user) : [];
    this.emitToAlbum(albumId, (cb) => cb.onTypingChanged(users));
  }

  private clearTypingForAlbum(albumId: string): void {
    const typers = this.typingByAlbum.get(albumId);
    if (!typers) return;
    typers.forEach((entry) => clearTimeout(entry.timer));
    this.typingByAlbum.delete(albumId);
  }

  // --- ChatTransport ----------------------------------------------------

  async fetchPage(params: FetchPageParams): Promise<FetchPageResult> {
    const { albumId, cursor, limit = DEFAULT_PAGE_SIZE } = params;
    await this.ensureJoined(albumId);

    const socket = this.socket();
    const ack = (await socket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck("chat:history", {
        albumId,
        before: cursor,
        limit,
      })) as Ack<{ messages: WireChatMessage[]; hasMore: boolean }>;

    if (!ack || ack.ok !== true) {
      throw ackError(ack, "Failed to load messages");
    }

    // Server returns newest first; oldest is the cursor for the next page.
    const wireMessages = ack.messages ?? [];
    const oldest = wireMessages[wireMessages.length - 1];

    return {
      messages: wireMessages.map(mapWireMessage).reverse(), // oldest first
      nextCursor: ack.hasMore && oldest ? oldest.messageId : undefined,
      hasMore: ack.hasMore === true,
    };
  }

  async send(albumId: string, params: SendMessageParams): Promise<ChatMessage> {
    const clientId = params.clientId ?? generateClientId();
    this.trackOwnClientId(clientId);

    const socket = this.socket();
    // Deliberately no queueing: fail fast so the UI's failed/retry flow runs.
    if (!socket.connected) {
      throw new Error("Not connected to chat");
    }

    // Sending implies we stopped typing.
    this.emitTypingState(albumId, false);

    const ack = (await socket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck("chat:send", {
        albumId,
        content: params.text,
        clientId,
      })) as Ack<{ message: WireChatMessage }>;

    if (!ack || ack.ok !== true || !ack.message) {
      throw ackError(ack, "Failed to send message");
    }

    return mapWireMessage(ack.message);
  }

  subscribe(
    albumId: string,
    callbacks: ChatTransportCallbacks,
  ): ChatTransportSubscription {
    let albumSubscribers = this.subscribers.get(albumId);
    if (!albumSubscribers) {
      albumSubscribers = new Set();
      this.subscribers.set(albumId, albumSubscribers);
    }
    albumSubscribers.add(callbacks);

    const socket = this.socket();
    callbacks.onConnectionChanged?.(socket.connected);

    void this.ensureJoined(albumId).catch((error: Error) => {
      callbacks.onError(error);
    });

    let unsubscribed = false;
    return {
      unsubscribe: () => {
        if (unsubscribed) return;
        unsubscribed = true;

        const subs = this.subscribers.get(albumId);
        subs?.delete(callbacks);

        if (!subs || subs.size === 0) {
          this.subscribers.delete(albumId);
          this.clearTypingForAlbum(albumId);
          this.joinedAlbums.delete(albumId);
          this.joinPromises.delete(albumId);

          const current = this.listeningSocket;
          if (current?.connected) {
            this.emitTypingState(albumId, false);
            current.emit("chat:leave", { albumId });
          }
        }

        // Tear the socket down only when nothing uses it anymore.
        if (this.subscribers.size === 0) {
          this.listeningSocket = null;
          disconnectSocket();
        }
      },
    };
  }

  /**
   * Notify the server about local typing state.
   * `typing: true` is throttled to one emit per ~2s; `typing: false` is sent
   * immediately (when we previously reported typing).
   */
  async sendTypingIndicator(albumId: string, typing = true): Promise<void> {
    this.emitTypingState(albumId, typing);
  }

  private emitTypingState(albumId: string, typing: boolean): void {
    const socket = this.listeningSocket ?? this.socket();
    if (!socket.connected) {
      this.typingActive = false;
      return;
    }

    if (typing) {
      const now = Date.now();
      if (this.typingActive && now - this.lastTypingEmitAt < TYPING_THROTTLE_MS) {
        return;
      }
      this.typingActive = true;
      this.lastTypingEmitAt = now;
      socket.emit("chat:typing", { albumId, typing: true });
    } else {
      if (!this.typingActive) return;
      this.typingActive = false;
      socket.emit("chat:typing", { albumId, typing: false });
    }
  }

  async markAsRead(_albumId: string, _messageIds: string[]): Promise<void> {
    // No read-receipt support in the socket contract yet.
  }
}

export function createSocketChatTransport(): ChatTransport {
  return new SocketChatTransport();
}
