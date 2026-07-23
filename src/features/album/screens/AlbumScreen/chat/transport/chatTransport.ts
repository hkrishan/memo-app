// Chat transport interface — backed by the Socket.IO implementation
// (see ./socketChatTransport.ts).

import {
  ChatMessage,
  FetchPageParams,
  FetchPageResult,
  SendMessageParams,
  TypingUser,
} from "../types/chat.types";
import { createSocketChatTransport } from "./socketChatTransport";

export interface ChatTransportSubscription {
  unsubscribe: () => void;
}

export interface ChatTransportCallbacks {
  onMessage: (message: ChatMessage) => void;
  onMessageUpdated: (message: ChatMessage) => void;
  onTypingChanged: (typingUsers: TypingUser[]) => void;
  onError: (error: Error) => void;
  /** Optional: real-time connection state (for "Connecting…" UI). */
  onConnectionChanged?: (connected: boolean) => void;
}

export interface ChatTransport {
  /**
   * Fetch a page of messages for an album (joins the room first if needed).
   * `cursor` is the id of the oldest message already loaded.
   */
  fetchPage(params: FetchPageParams): Promise<FetchPageResult>;

  /**
   * Send a message to an album chat. Resolves with the server-confirmed
   * message; rejects when the send is not acknowledged (offline, server
   * error, timeout) so the UI can mark the optimistic message as failed.
   */
  send(albumId: string, params: SendMessageParams): Promise<ChatMessage>;

  /**
   * Subscribe to real-time updates for an album chat.
   * Joins the room on subscribe; leaving/cleanup happens on unsubscribe.
   */
  subscribe(
    albumId: string,
    callbacks: ChatTransportCallbacks,
  ): ChatTransportSubscription;

  /**
   * Notify server about local typing state. Defaults to `typing: true`;
   * pass `false` when the composer is cleared/blurred.
   */
  sendTypingIndicator(albumId: string, typing?: boolean): Promise<void>;

  /**
   * Mark messages as read (not supported by the socket backend yet; no-op).
   */
  markAsRead(albumId: string, messageIds: string[]): Promise<void>;
}

// Singleton instance
let transportInstance: ChatTransport | null = null;

export function getChatTransport(): ChatTransport {
  if (!transportInstance) {
    transportInstance = createSocketChatTransport();
  }
  return transportInstance;
}

// For testing/DI
export function setChatTransport(transport: ChatTransport): void {
  transportInstance = transport;
}
