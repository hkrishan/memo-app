// Socket.IO client singleton
//
// Lazily created, manually connected (autoConnect: false). The auth token is
// resolved from secure token storage on every connection attempt, so token
// refreshes are picked up automatically on reconnect without any extra wiring.

import { Platform } from "react-native";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { env } from "@/lib/env";
import { tokenStorage } from "@/lib/api/tokenStorage";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(env.socketUrl, {
      autoConnect: false,
      // Android: start with polling, then upgrade to WebSocket if possible.
      // Some Android devices fail direct WebSocket handshakes (e.g. via
      // proxies with HTTP/2 ALPN); polling-first is the safe default there.
      transports:
        Platform.OS === "android"
          ? ["polling", "websocket"]
          : ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // Called for every (re)connection attempt -> always sends a fresh JWT.
      auth: (cb) => {
        tokenStorage
          .getAccessToken()
          .then((token) => cb({ token: token ?? "" }))
          .catch(() => cb({ token: "" }));
      },
    });
  }
  return socket;
};

/**
 * Holders that need the connection to stay up (e.g. the drop-takeover hook
 * keeps a hold for the whole authenticated session). While any hold is
 * registered, disconnectSocket() is a no-op — chat teardown no longer kills
 * the app-wide realtime connection.
 */
const holds = new Set<string>();

/** Registers a holder and ensures the socket is connected. Idempotent. */
export const holdSocket = (holderId: string): Socket => {
  holds.add(holderId);
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
};

/** Releases a holder; disconnects when no holder remains. */
export const releaseSocket = (holderId: string): void => {
  holds.delete(holderId);
  if (holds.size === 0) disconnectSocket();
};

export const disconnectSocket = (): void => {
  if (holds.size > 0) return; // a holder still needs the connection
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
