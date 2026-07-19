// Chat transport interface - backend implementation to be added later

import {
  ChatMessage,
  FetchPageParams,
  FetchPageResult,
  SendMessageParams,
  TypingUser,
} from "../types/chat.types";

export interface ChatTransportSubscription {
  unsubscribe: () => void;
}

export interface ChatTransportCallbacks {
  onMessage: (message: ChatMessage) => void;
  onMessageUpdated: (message: ChatMessage) => void;
  onTypingChanged: (typingUsers: TypingUser[]) => void;
  onError: (error: Error) => void;
}

export interface ChatTransport {
  /**
   * Fetch a page of messages for an album
   * @throws NotImplementedError - Backend not implemented
   */
  fetchPage(params: FetchPageParams): Promise<FetchPageResult>;

  /**
   * Send a message to an album chat
   * @throws NotImplementedError - Backend not implemented
   */
  send(albumId: string, params: SendMessageParams): Promise<ChatMessage>;

  /**
   * Subscribe to real-time updates for an album chat
   * @throws NotImplementedError - Backend not implemented
   */
  subscribe(
    albumId: string,
    callbacks: ChatTransportCallbacks,
  ): ChatTransportSubscription;

  /**
   * Notify server that user is typing
   * @throws NotImplementedError - Backend not implemented
   */
  sendTypingIndicator(albumId: string): Promise<void>;

  /**
   * Mark messages as read
   * @throws NotImplementedError - Backend not implemented
   */
  markAsRead(albumId: string, messageIds: string[]): Promise<void>;
}

class NotImplementedError extends Error {
  constructor(method: string) {
    super(`ChatTransport.${method} is not implemented. Backend pending.`);
    this.name = "NotImplementedError";
  }
}

/**
 * Creates a stub chat transport.
 * All methods throw NotImplementedError - ready for backend implementation.
 */
export function createChatTransport(): ChatTransport {
  return {
    fetchPage: async (_params: FetchPageParams): Promise<FetchPageResult> => {
      throw new NotImplementedError("fetchPage");
    },

    send: async (
      _albumId: string,
      _params: SendMessageParams,
    ): Promise<ChatMessage> => {
      throw new NotImplementedError("send");
    },

    subscribe: (
      _albumId: string,
      _callbacks: ChatTransportCallbacks,
    ): ChatTransportSubscription => {
      // Return a no-op subscription for now
      console.warn("ChatTransport.subscribe: Backend not implemented");
      return {
        unsubscribe: () => {},
      };
    },

    sendTypingIndicator: async (_albumId: string): Promise<void> => {
      throw new NotImplementedError("sendTypingIndicator");
    },

    markAsRead: async (
      _albumId: string,
      _messageIds: string[],
    ): Promise<void> => {
      throw new NotImplementedError("markAsRead");
    },
  };
}

// Singleton instance
let transportInstance: ChatTransport | null = null;

export function getChatTransport(): ChatTransport {
  if (!transportInstance) {
    transportInstance = createChatTransport();
  }
  return transportInstance;
}

// For testing/DI
export function setChatTransport(transport: ChatTransport): void {
  transportInstance = transport;
}
