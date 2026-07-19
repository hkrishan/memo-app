// Virtualized message list using FlashList

import React, { memo, useCallback, useRef, useMemo } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import {
  MessageListItem,
  ChatMessage,
  ChatUser,
  MessageAction,
} from "../types/chat.types";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import DaySeparator from "./DaySeparator";
import LoadMoreRow from "./LoadMoreRow";
import ScrollToBottomButton from "./ScrollToBottomButton";
import EmptyState from "./EmptyState";

// Cast FlashList to any to bypass type mismatch with installed version
const MessageFlashList = FlashList as any;

interface ChatMessageListProps {
  listItems: MessageListItem[];
  currentUserId: string;
  members: Map<string, ChatUser>;
  isEmpty: boolean;
  albumTitle?: string;
  isLoadingOlder: boolean;
  hasOlderMessages: boolean;
  loadOlderError: boolean;
  typingUsers: { userId: string; name: string }[];
  onLoadOlder: () => void;
  onRetryLoadOlder: () => void;
  onMessageLongPress: (message: ChatMessage, action: MessageAction) => void;
  onRetryMessage: (clientId: string) => void;
  contentTop: number;
}

const ESTIMATED_MESSAGE_HEIGHT = 60;
const ESTIMATED_SEPARATOR_HEIGHT = 48;
const SCROLL_THRESHOLD = 100;

const ChatMessageList = memo<ChatMessageListProps>(
  ({
    listItems,
    currentUserId,
    members,
    isEmpty,
    albumTitle,
    isLoadingOlder,
    hasOlderMessages,
    loadOlderError,
    typingUsers,
    onLoadOlder,
    onRetryLoadOlder,
    onMessageLongPress,
    onRetryMessage,
    contentTop,
  }) => {
    const listRef = useRef<any>(null);
    const isNearBottom = useRef(true);
    const [showScrollButton, setShowScrollButton] = React.useState(false);

    // Memoized key extractor
    const keyExtractor = useCallback((item: MessageListItem) => item.id, []);

    // Estimate item size based on type
    const getItemType = useCallback((item: MessageListItem) => item.type, []);

    const overrideItemLayout = useCallback(
      (
        layout: { size?: number; span?: number },
        item: MessageListItem,
      ) => {
        switch (item.type) {
          case "day-separator":
            layout.size = ESTIMATED_SEPARATOR_HEIGHT;
            break;
          case "typing":
            layout.size = 56;
            break;
          case "message":
            // Rough estimate based on message length
            const textLength = item.message?.text.length || 0;
            const lineEstimate = Math.ceil(textLength / 40);
            layout.size = Math.max(
              ESTIMATED_MESSAGE_HEIGHT,
              40 + lineEstimate * 20,
            );
            break;
          default:
            layout.size = ESTIMATED_MESSAGE_HEIGHT;
        }
      },
      [],
    );

    // Render item
    const renderItem = useCallback(
      ({ item }: ListRenderItemInfo<MessageListItem>) => {
        switch (item.type) {
          case "day-separator":
            return <DaySeparator date={item.date || ""} />;

          case "typing":
            return <TypingIndicator typingUsers={typingUsers} />;

          case "message":
            if (!item.message) return null;
            const isOwnMessage = item.message.senderId === currentUserId;
            const sender = members.get(item.message.senderId);

            return (
              <MessageBubble
                message={item.message}
                isOwnMessage={isOwnMessage}
                sender={sender}
                isFirstInGroup={item.isFirstInGroup || false}
                isLastInGroup={item.isLastInGroup || false}
                showAvatar={item.showAvatar || false}
                showTimestamp={item.showTimestamp || false}
                onLongPress={onMessageLongPress}
                onRetry={onRetryMessage}
              />
            );

          default:
            return null;
        }
      },
      [currentUserId, members, typingUsers, onMessageLongPress, onRetryMessage],
    );

    // Handle scroll to detect if near bottom
    const handleScroll = useCallback(
      (event: { nativeEvent: { contentOffset: { y: number } } }) => {
        // In inverted list, y=0 means at bottom (newest messages)
        const offsetY = event.nativeEvent.contentOffset.y;
        const nearBottom = offsetY < SCROLL_THRESHOLD;
        isNearBottom.current = nearBottom;
        setShowScrollButton(!nearBottom);
      },
      [],
    );

    // Handle reaching end (which is top in inverted list = older messages)
    const handleEndReached = useCallback(() => {
      if (hasOlderMessages && !isLoadingOlder && !loadOlderError) {
        onLoadOlder();
      }
    }, [hasOlderMessages, isLoadingOlder, loadOlderError, onLoadOlder]);

    // Scroll to bottom (newest messages)
    const scrollToBottom = useCallback(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, []);

    // List header (appears at bottom in inverted list)
    const ListHeaderComponent = useMemo(
      () => (
        <View style={{ height: 8 }} />
      ),
      [],
    );

    // List footer (appears at top in inverted list = older messages)
    const ListFooterComponent = useMemo(
      () => (
        <View style={{ paddingTop: contentTop }}>
          {(isLoadingOlder || loadOlderError) && (
            <LoadMoreRow
              isLoading={isLoadingOlder}
              hasError={loadOlderError}
              onRetry={onRetryLoadOlder}
            />
          )}
        </View>
      ),
      [contentTop, isLoadingOlder, loadOlderError, onRetryLoadOlder],
    );

    // For empty state, we render it outside the inverted list
    if (isEmpty) {
      return (
        <View style={styles.container}>
          <View style={[styles.emptyContainer, { paddingTop: contentTop }]}>
            <EmptyState albumTitle={albumTitle} />
          </View>
        </View>
      );
    }

    // Content container style
    const contentContainerStyle = useMemo(
      () => ({
        paddingBottom: 8,
      }),
      [],
    );

    return (
      <View style={styles.container}>
        <MessageFlashList
          ref={listRef}
          data={listItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          overrideItemLayout={overrideItemLayout}
          estimatedItemSize={ESTIMATED_MESSAGE_HEIGHT}
          inverted
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={ListHeaderComponent}
          ListFooterComponent={ListFooterComponent}
          contentContainerStyle={contentContainerStyle}
          maintainVisibleContentPosition={
            Platform.OS === "ios"
              ? { minIndexForVisible: 0 }
              : undefined
          }
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={false}
        />

        <ScrollToBottomButton
          visible={showScrollButton}
          onPress={scrollToBottom}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default ChatMessageList;
