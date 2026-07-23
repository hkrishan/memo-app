// Chat controller hook - manages UI state and orchestrates chat operations
// via the ChatTransport (Socket.IO backed).

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ChatMessage,
  ChatState,
  MessageListItem,
  SendMessageParams,
  TypingUser,
  ChatUser,
} from "../types/chat.types";
import { ChatTransport, getChatTransport } from "../transport/chatTransport";
import { useBlockedUserIds } from "@/features/moderation/api/moderation.queries";

const INITIAL_PAGE_SIZE = 30;
const OLDER_PAGE_SIZE = 30;

// Generate unique client ids for optimistic messages
const generateClientId = () =>
  `c-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

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

interface UseChatControllerOptions {
  albumId: string;
  currentUser: ChatUser;
  /** Override the transport (testing/DI). Defaults to the socket transport. */
  transport?: ChatTransport;
}

export function useChatController({
  albumId,
  currentUser,
  transport,
}: UseChatControllerOptions) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Client-side block filtering: messages and typing indicators from users
  // the current user has blocked are hidden. While the block list is
  // loading (or errored) the set is empty — nothing is filtered.
  const blockedUserIds = useBlockedUserIds();

  const transportRef = useRef<ChatTransport>(transport ?? getChatTransport());

  // Refs mirroring state/props so async callbacks never go stale
  const stateRef = useRef(state);
  stateRef.current = state;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  /** Pagination cursor: id of the oldest message loaded so far. */
  const cursorRef = useRef<string | undefined>(undefined);
  /** Whether the initial page has ever loaded successfully. */
  const initialLoadedRef = useRef(false);
  /** Original params of in-flight/failed optimistic sends, for retry. */
  const pendingSendsRef = useRef(new Map<string, SendMessageParams>());

  // --- initial page + live subscription ---------------------------------

  const loadInitialPage = useCallback(async () => {
    try {
      const page = await transportRef.current.fetchPage({
        albumId,
        limit: INITIAL_PAGE_SIZE,
      });
      cursorRef.current = page.nextCursor;
      initialLoadedRef.current = true;
      dispatch({ type: "PREPEND_MESSAGES", messages: page.messages });
      dispatch({ type: "SET_HAS_OLDER", hasMore: page.hasMore });
      dispatch({ type: "SET_LOAD_OLDER_ERROR", error: false });
    } catch {
      // Will retry automatically when the connection (re)establishes
      dispatch({ type: "SET_LOAD_OLDER_ERROR", error: true });
    } finally {
      setIsInitialLoading(false);
    }
  }, [albumId]);

  useEffect(() => {
    let active = true;
    initialLoadedRef.current = false;
    cursorRef.current = undefined;
    setIsInitialLoading(true);

    const subscription = transportRef.current.subscribe(albumId, {
      onMessage: (message) => {
        if (!active || message.albumId !== albumId) return;
        dispatch({ type: "ADD_MESSAGE", message });
      },
      onMessageUpdated: (message) => {
        if (!active || message.albumId !== albumId) return;
        dispatch({ type: "UPDATE_MESSAGE", id: message.id, updates: message });
      },
      onTypingChanged: (users) => {
        if (!active) return;
        dispatch({
          type: "SET_TYPING_USERS",
          users: users.filter(
            (u) => u.userId !== currentUserRef.current.userId,
          ),
        });
      },
      onError: (error) => {
        if (__DEV__) console.warn("[Chat] transport error:", error.message);
      },
      onConnectionChanged: (connected) => {
        if (!active) return;
        setIsConnected(connected);
        // If the first page never loaded (e.g. opened while offline),
        // fetch it as soon as we're connected.
        if (connected && !initialLoadedRef.current) {
          void loadInitialPage();
        }
      },
    });

    void loadInitialPage();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [albumId, loadInitialPage]);

  // --- sending ----------------------------------------------------------

  const deliverMessage = useCallback(
    async (clientId: string, params: SendMessageParams) => {
      try {
        const sent = await transportRef.current.send(albumId, {
          ...params,
          clientId,
        });
        pendingSendsRef.current.delete(clientId);
        dispatch({
          type: "UPDATE_MESSAGE",
          id: clientId,
          updates: {
            id: sent.id,
            createdAt: sent.createdAt,
            status: "sent",
          },
        });
      } catch {
        dispatch({
          type: "UPDATE_MESSAGE",
          id: clientId,
          updates: { status: "failed" },
        });
      }
    },
    [albumId],
  );

  // Send message optimistically
  const sendMessage = useCallback(
    (params: SendMessageParams) => {
      const clientId = params.clientId ?? generateClientId();
      const user = currentUserRef.current;

      const optimisticMessage: ChatMessage = {
        id: clientId, // Replaced by the server id on ack
        clientId,
        albumId,
        senderId: user.userId,
        text: params.text.trim(),
        createdAt: new Date().toISOString(),
        status: "sending",
        type: "user",
        replyToMessageId: params.replyToMessageId,
        authorName: user.name,
        authorAvatarUrl: user.avatarUrl,
      };

      dispatch({ type: "ADD_MESSAGE", message: optimisticMessage });
      pendingSendsRef.current.set(clientId, {
        ...params,
        text: optimisticMessage.text,
      });

      void deliverMessage(clientId, params);
      return clientId;
    },
    [albumId, deliverMessage],
  );

  // Retry failed message
  const retryMessage = useCallback(
    (clientId: string) => {
      const params =
        pendingSendsRef.current.get(clientId) ??
        (() => {
          const message = stateRef.current.messages.find(
            (m) => m.clientId === clientId,
          );
          return message
            ? {
                text: message.text,
                replyToMessageId: message.replyToMessageId,
              }
            : null;
        })();

      if (!params) return;

      dispatch({ type: "RETRY_MESSAGE", clientId });
      void deliverMessage(clientId, params);
    },
    [deliverMessage],
  );

  // --- pagination -------------------------------------------------------

  const loadOlderMessages = useCallback(async () => {
    const current = stateRef.current;
    if (current.isLoadingOlder || !current.hasOlderMessages) return;
    if (!initialLoadedRef.current) {
      // First page never loaded — (re)try that instead of paging older
      await loadInitialPage();
      return;
    }

    dispatch({ type: "SET_LOADING_OLDER", loading: true });

    try {
      const page = await transportRef.current.fetchPage({
        albumId,
        cursor: cursorRef.current,
        limit: OLDER_PAGE_SIZE,
      });
      cursorRef.current = page.nextCursor ?? cursorRef.current;
      dispatch({ type: "PREPEND_MESSAGES", messages: page.messages });
      dispatch({ type: "SET_HAS_OLDER", hasMore: page.hasMore });
    } catch {
      dispatch({ type: "SET_LOAD_OLDER_ERROR", error: true });
    }
  }, [albumId, loadInitialPage]);

  // Retry loading older
  const retryLoadOlder = useCallback(() => {
    dispatch({ type: "SET_LOAD_OLDER_ERROR", error: false });
    void loadOlderMessages();
  }, [loadOlderMessages]);

  // --- typing (outgoing) ------------------------------------------------

  /**
   * Report local typing state. The transport throttles `true` to ~1 emit
   * per 2s and always forwards `false` (composer cleared/blurred/sent).
   */
  const setTyping = useCallback(
    (typing: boolean) => {
      transportRef.current.sendTypingIndicator(albumId, typing).catch(() => {});
    },
    [albumId],
  );

  // --- derived list -----------------------------------------------------

  const visibleMessages = useMemo(
    () =>
      blockedUserIds.size === 0
        ? state.messages
        : state.messages.filter((m) => !blockedUserIds.has(m.senderId)),
    [state.messages, blockedUserIds],
  );

  const visibleTypingUsers = useMemo(
    () =>
      blockedUserIds.size === 0
        ? state.typingUsers
        : state.typingUsers.filter((u) => !blockedUserIds.has(u.userId)),
    [state.typingUsers, blockedUserIds],
  );

  // Transform messages to list items with grouping and separators
  const listItems = useMemo((): MessageListItem[] => {
    const items: MessageListItem[] = [];
    const messages = visibleMessages;

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
    if (visibleTypingUsers.length > 0) {
      items.push({
        type: "typing",
        id: "typing-indicator",
      });
    }

    // Normal order (oldest → newest): the list renders from the bottom via
    // maintainVisibleContentPosition.startRenderingFromBottom, so the day
    // separators lead their day and the typing indicator sits last (bottom)
    return items;
  }, [visibleMessages, visibleTypingUsers, currentUser.userId]);

  // Check if we should show load more
  const showLoadMore = state.hasOlderMessages && !state.isLoadingOlder;
  const showLoadMoreError = state.loadOlderError;

  return {
    // State
    messages: visibleMessages,
    listItems,
    isLoadingOlder: state.isLoadingOlder,
    hasOlderMessages: state.hasOlderMessages,
    showLoadMore,
    showLoadMoreError,
    typingUsers: visibleTypingUsers,
    isEmpty: visibleMessages.length === 0,
    isConnected,
    isInitialLoading,

    // Actions
    sendMessage,
    retryMessage,
    loadOlderMessages,
    retryLoadOlder,
    setTyping,

    // For testing
    dispatch,
  };
}

export type ChatController = ReturnType<typeof useChatController>;
