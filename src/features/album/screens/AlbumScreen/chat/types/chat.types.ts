// Chat type definitions

export type SendStatus = "sending" | "sent" | "failed";

export type MessageType = "user" | "system";

export interface ChatUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface ChatMessage {
  id: string;
  clientId?: string; // For optimistic updates before server confirms
  albumId: string;
  senderId: string;
  text: string;
  createdAt: string; // ISO string
  status: SendStatus;
  type: MessageType;
  replyToMessageId?: string;
  // Author info carried on the wire message (preferred over the members
  // list when rendering, so messages from ex-members still show correctly).
  authorName?: string;
  authorAvatarUrl?: string | null;
}

export interface AlbumMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: "owner" | "contributor" | "viewer";
}

export interface ChatAlbum {
  id: string;
  title: string;
  members: AlbumMember[];
}

// For list rendering - includes grouping metadata
export interface MessageListItem {
  type: "message" | "day-separator" | "typing" | "load-more";
  id: string;
  message?: ChatMessage;
  date?: string;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  showAvatar?: boolean;
  showTimestamp?: boolean;
}

export interface TypingUser {
  userId: string;
  name: string;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoadingOlder: boolean;
  hasOlderMessages: boolean;
  loadOlderError: boolean;
  typingUsers: TypingUser[];
}

export interface SendMessageParams {
  text: string;
  replyToMessageId?: string;
  /**
   * Stable client-generated id for optimistic updates / retries.
   * The transport echoes it so broadcasts of our own send can be deduped.
   */
  clientId?: string;
}

export interface FetchPageParams {
  albumId: string;
  cursor?: string;
  limit?: number;
}

export interface FetchPageResult {
  messages: ChatMessage[];
  nextCursor?: string;
  hasMore: boolean;
}

// Action sheet actions
export type MessageAction = "copy" | "reply" | "react" | "report" | "block";
