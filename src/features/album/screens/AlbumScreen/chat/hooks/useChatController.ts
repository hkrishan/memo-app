// Chat controller hook - manages UI state and orchestrates chat operations

import { useCallback, useMemo, useReducer, useRef } from "react";
import {
  ChatMessage,
  ChatState,
  MessageListItem,
  SendMessageParams,
  TypingUser,
  ChatUser,
} from "../types/chat.types";

// Generate unique IDs
const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// Check if two dates are the same day
const isSameDay = (d1: Date, d2: Date): boolean =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

// Format date for separator
const formatDateSeparator = (date: Date): string => {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, now)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

// Check if messages should be grouped (same sender within 2 minutes)
const shouldGroupMessages = (
  current: ChatMessage,
  previous: ChatMessage | null,
): boolean => {
  if (!previous) return false;
  if (current.senderId !== previous.senderId) return false;
  if (current.type === "system" || previous.type === "system") return false;

  const currentTime = new Date(current.createdAt).getTime();
  const previousTime = new Date(previous.createdAt).getTime();
  const diffMinutes = Math.abs(currentTime - previousTime) / 60000;

  return diffMinutes <= 2;
};

// Action types
type ChatAction =
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "UPDATE_MESSAGE"; id: string; updates: Partial<ChatMessage> }
  | { type: "PREPEND_MESSAGES"; messages: ChatMessage[] }
  | { type: "SET_LOADING_OLDER"; loading: boolean }
  | { type: "SET_HAS_OLDER"; hasMore: boolean }
  | { type: "SET_LOAD_OLDER_ERROR"; error: boolean }
  | { type: "SET_TYPING_USERS"; users: TypingUser[] }
  | { type: "RETRY_MESSAGE"; clientId: string };

// Initial state
const initialState: ChatState = {
  messages: [],
  isLoadingOlder: false,
  hasOlderMessages: true,
  loadOlderError: false,
  typingUsers: [],
};

// Reducer
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ADD_MESSAGE": {
      // Dedupe by id or clientId
      const exists = state.messages.some(
        (m) =>
          m.id === action.message.id ||
          (action.message.clientId && m.clientId === action.message.clientId),
      );
      if (exists) return state;

      return {
        ...state,
        messages: [...state.messages, action.message].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
      };
    }

    case "UPDATE_MESSAGE": {
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id || m.clientId === action.id
            ? { ...m, ...action.updates }
            : m,
        ),
      };
    }

    case "PREPEND_MESSAGES": {
      // Dedupe
      const existingIds = new Set(state.messages.map((m) => m.id));
      const newMessages = action.messages.filter(
        (m) => !existingIds.has(m.id),
      );

      return {
        ...state,
        messages: [...newMessages, ...state.messages].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
        isLoadingOlder: false,
        loadOlderError: false,
      };
    }

    case "SET_LOADING_OLDER":
      return { ...state, isLoadingOlder: action.loading };

    case "SET_HAS_OLDER":
      return { ...state, hasOlderMessages: action.hasMore };

    case "SET_LOAD_OLDER_ERROR":
      return { ...state, loadOlderError: action.error, isLoadingOlder: false };

    case "SET_TYPING_USERS":
      return { ...state, typingUsers: action.users };

    case "RETRY_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.clientId === action.clientId ? { ...m, status: "sending" } : m,
        ),
      };

    default:
      return state;
  }
}

// Generate mock messages for pagination simulation
const generateMockMessages = (
  albumId: string,
  currentUserId: string,
  count: number,
  beforeDate: Date,
): ChatMessage[] => {
  const messages: ChatMessage[] = [];
  const senders = [currentUserId, "user-2", "user-3"];
  const texts = [
    "Hey everyone!",
    "Great photos from the trip!",
    "Can't wait for the next one",
    "This is amazing",
    "Love it!",
    "When are we going again?",
    "The sunset was incredible",
    "Best vacation ever",
    "Thanks for organizing!",
    "See you all soon!",
  ];

  let currentDate = new Date(beforeDate);

  for (let i = 0; i < count; i++) {
    // Go back 5-30 minutes for each message
    currentDate = new Date(
      currentDate.getTime() - (5 + Math.random() * 25) * 60000,
    );

    messages.push({
      id: `mock-${generateId()}`,
      albumId,
      senderId: senders[Math.floor(Math.random() * senders.length)],
      text: texts[Math.floor(Math.random() * texts.length)],
      createdAt: currentDate.toISOString(),
      status: "sent",
      type: "user",
    });
  }

  return messages.reverse(); // Oldest first
};

interface UseChatControllerOptions {
  albumId: string;
  currentUser: ChatUser;
  simulateFailure?: boolean; // For testing failed sends
}

export function useChatController({
  albumId,
  currentUser,
  simulateFailure = false,
}: UseChatControllerOptions) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const failureToggle = useRef(simulateFailure);
  const oldestMessageDate = useRef<Date>(new Date());

  // Send message optimistically
  const sendMessage = useCallback(
    (params: SendMessageParams) => {
      const clientId = generateId();
      const now = new Date().toISOString();

      const optimisticMessage: ChatMessage = {
        id: clientId, // Will be replaced by server ID
        clientId,
        albumId,
        senderId: currentUser.userId,
        text: params.text.trim(),
        createdAt: now,
        status: "sending",
        type: "user",
        replyToMessageId: params.replyToMessageId,
      };

      dispatch({ type: "ADD_MESSAGE", message: optimisticMessage });

      // Simulate send completion (local only - no actual network call)
      // In real implementation, this would call transport.send()
      setTimeout(() => {
        const shouldFail = failureToggle.current && Math.random() < 0.3;

        if (shouldFail) {
          dispatch({
            type: "UPDATE_MESSAGE",
            id: clientId,
            updates: { status: "failed" },
          });
        } else {
          dispatch({
            type: "UPDATE_MESSAGE",
            id: clientId,
            updates: {
              status: "sent",
              id: `server-${clientId}`, // Simulate server ID
            },
          });
        }
      }, 500);

      return clientId;
    },
    [albumId, currentUser.userId],
  );

  // Retry failed message
  const retryMessage = useCallback((clientId: string) => {
    dispatch({ type: "RETRY_MESSAGE", clientId });

    // Simulate retry
    setTimeout(() => {
      dispatch({
        type: "UPDATE_MESSAGE",
        id: clientId,
        updates: { status: "sent" },
      });
    }, 500);
  }, []);

  // Load older messages (simulated with local generation)
  const loadOlderMessages = useCallback(() => {
    if (state.isLoadingOlder || !state.hasOlderMessages) return;

    dispatch({ type: "SET_LOADING_OLDER", loading: true });

    // Simulate loading delay
    setTimeout(() => {
      const shouldFail = failureToggle.current && Math.random() < 0.2;

      if (shouldFail) {
        dispatch({ type: "SET_LOAD_OLDER_ERROR", error: true });
        return;
      }

      const mockMessages = generateMockMessages(
        albumId,
        currentUser.userId,
        15,
        oldestMessageDate.current,
      );

      if (mockMessages.length > 0) {
        oldestMessageDate.current = new Date(mockMessages[0].createdAt);
      }

      // Simulate running out of messages after a few pages
      const hasMore = state.messages.length < 60;

      dispatch({ type: "PREPEND_MESSAGES", messages: mockMessages });
      dispatch({ type: "SET_HAS_OLDER", hasMore });
    }, 800);
  }, [
    albumId,
    currentUser.userId,
    state.isLoadingOlder,
    state.hasOlderMessages,
    state.messages.length,
  ]);

  // Retry loading older
  const retryLoadOlder = useCallback(() => {
    dispatch({ type: "SET_LOAD_OLDER_ERROR", error: false });
    loadOlderMessages();
  }, [loadOlderMessages]);

  // Toggle failure simulation
  const toggleFailureSimulation = useCallback((enabled: boolean) => {
    failureToggle.current = enabled;
  }, []);

  // Transform messages to list items with grouping and separators
  const listItems = useMemo((): MessageListItem[] => {
    const items: MessageListItem[] = [];
    const messages = state.messages;

    if (messages.length === 0) {
      return [];
    }

    let currentDate: string | null = null;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const prevMessage = i > 0 ? messages[i - 1] : null;
      const nextMessage = i < messages.length - 1 ? messages[i + 1] : null;

      const messageDate = new Date(message.createdAt);
      const dateKey = messageDate.toDateString();

      // Add day separator if date changed
      if (dateKey !== currentDate) {
        currentDate = dateKey;
        items.push({
          type: "day-separator",
          id: `separator-${dateKey}`,
          date: formatDateSeparator(messageDate),
        });
      }

      // Determine grouping
      const isGroupedWithPrevious = shouldGroupMessages(message, prevMessage);
      const isGroupedWithNext = nextMessage
        ? shouldGroupMessages(nextMessage, message)
        : false;

      const isFirstInGroup = !isGroupedWithPrevious;
      const isLastInGroup = !isGroupedWithNext;

      items.push({
        type: "message",
        id: message.id,
        message,
        isFirstInGroup,
        isLastInGroup,
        showAvatar: isFirstInGroup && message.senderId !== currentUser.userId,
        showTimestamp: isLastInGroup,
      });
    }

    // Add typing indicator if users are typing
    if (state.typingUsers.length > 0) {
      items.push({
        type: "typing",
        id: "typing-indicator",
      });
    }

    // Reverse for inverted list
    return items.reverse();
  }, [state.messages, state.typingUsers, currentUser.userId]);

  // Check if we should show load more
  const showLoadMore = state.hasOlderMessages && !state.isLoadingOlder;
  const showLoadMoreError = state.loadOlderError;

  return {
    // State
    messages: state.messages,
    listItems,
    isLoadingOlder: state.isLoadingOlder,
    hasOlderMessages: state.hasOlderMessages,
    showLoadMore,
    showLoadMoreError,
    typingUsers: state.typingUsers,
    isEmpty: state.messages.length === 0,

    // Actions
    sendMessage,
    retryMessage,
    loadOlderMessages,
    retryLoadOlder,
    toggleFailureSimulation,

    // For testing
    dispatch,
  };
}

export type ChatController = ReturnType<typeof useChatController>;
