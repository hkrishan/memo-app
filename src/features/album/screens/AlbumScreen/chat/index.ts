// Chat module exports

export { default as AlbumChatScreen } from "./AlbumChatScreen";
export { default as ChatMessageList } from "./components/ChatMessageList";
export { default as ChatComposer } from "./components/ChatComposer";
export { default as MessageBubble } from "./components/MessageBubble";
export { default as TypingIndicator } from "./components/TypingIndicator";
export { default as DaySeparator } from "./components/DaySeparator";
export { default as ScrollToBottomButton } from "./components/ScrollToBottomButton";
export { default as EmptyState } from "./components/EmptyState";
export { default as LoadMoreRow } from "./components/LoadMoreRow";

export { useChatController } from "./hooks/useChatController";
export type { ChatController } from "./hooks/useChatController";

export {
  useAlbumChatUnread,
  UNREAD_CAP,
} from "./unread/useAlbumChatUnread";
export { getLastRead, setLastRead, subscribeToLastRead } from "./unread/lastRead";

export * from "./types/chat.types";
export * from "./transport/chatTransport";
