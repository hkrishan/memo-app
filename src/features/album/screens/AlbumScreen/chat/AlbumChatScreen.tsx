// Album Chat Screen - main chat container

import React, { memo, useCallback, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Alert,
  ActionSheetIOS,
  Keyboard,
  Pressable,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useChatController } from "./hooks/useChatController";
import {
  ChatMessage,
  ChatUser,
  MessageAction,
  AlbumMember,
} from "./types/chat.types";
import ChatMessageList from "./components/ChatMessageList";
import ChatComposer from "./components/ChatComposer";

// Mock data for development
const mockCurrentUser: ChatUser = {
  userId: "current-user-1",
  name: "You",
  avatarUrl: null,
};

const mockAlbumMembers: AlbumMember[] = [
  {
    userId: "current-user-1",
    name: "You",
    avatarUrl: null,
    role: "owner",
  },
  {
    userId: "user-2",
    name: "Sarah",
    avatarUrl: "https://i.pravatar.cc/100?img=1",
    role: "contributor",
  },
  {
    userId: "user-3",
    name: "Mike",
    avatarUrl: "https://i.pravatar.cc/100?img=2",
    role: "contributor",
  },
];

// Tab bar height - space needed at bottom for tab bar
const TAB_BAR_HEIGHT = 90;

interface AlbumChatScreenProps {
  albumId: string;
  albumTitle?: string;
  contentTop: number;
}

const AlbumChatScreen = memo<AlbumChatScreenProps>(
  ({ albumId, albumTitle, contentTop }) => {
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

    // Initialize chat controller
    const {
      listItems,
      isEmpty,
      isLoadingOlder,
      hasOlderMessages,
      showLoadMoreError,
      typingUsers,
      sendMessage,
      retryMessage,
      loadOlderMessages,
      retryLoadOlder,
    } = useChatController({
      albumId,
      currentUser: mockCurrentUser,
      simulateFailure: false,
    });

    // Create member lookup map for efficient access
    const membersMap = useMemo(() => {
      const map = new Map<string, ChatUser>();
      mockAlbumMembers.forEach((member) => {
        map.set(member.userId, {
          userId: member.userId,
          name: member.name,
          avatarUrl: member.avatarUrl,
        });
      });
      return map;
    }, []);

    // Dismiss keyboard on tap
    const handleDismissKeyboard = useCallback(() => {
      Keyboard.dismiss();
    }, []);

    // Handle sending a message
    const handleSend = useCallback(
      (text: string) => {
        sendMessage({
          text,
          replyToMessageId: replyingTo?.id,
        });
        setReplyingTo(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      [sendMessage, replyingTo],
    );

    // Handle long press on message
    const handleMessageLongPress = useCallback(
      (message: ChatMessage, _action: MessageAction) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        if (Platform.OS === "ios") {
          ActionSheetIOS.showActionSheetWithOptions(
            {
              options: ["Cancel", "Copy", "Reply"],
              cancelButtonIndex: 0,
            },
            (buttonIndex) => {
              if (buttonIndex === 1) {
                Clipboard.setStringAsync(message.text);
              } else if (buttonIndex === 2) {
                setReplyingTo(message);
              }
            },
          );
        } else {
          Alert.alert("Message Options", undefined, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Copy",
              onPress: () => Clipboard.setStringAsync(message.text),
            },
            {
              text: "Reply",
              onPress: () => setReplyingTo(message),
            },
          ]);
        }
      },
      [],
    );

    // Handle retry message
    const handleRetryMessage = useCallback(
      (clientId: string) => {
        retryMessage(clientId);
      },
      [retryMessage],
    );

    // Handle attachment press (stub)
    const handleAttachmentPress = useCallback(() => {
      Keyboard.dismiss();
      Alert.alert("Attachments", "Attachment functionality coming soon!", [
        { text: "OK" },
      ]);
    }, []);

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* Tappable area to dismiss keyboard */}
        <Pressable style={styles.listWrapper} onPress={handleDismissKeyboard}>
          <ChatMessageList
            listItems={listItems}
            currentUserId={mockCurrentUser.userId}
            members={membersMap}
            isEmpty={isEmpty}
            albumTitle={albumTitle}
            isLoadingOlder={isLoadingOlder}
            hasOlderMessages={hasOlderMessages}
            loadOlderError={showLoadMoreError}
            typingUsers={typingUsers}
            onLoadOlder={loadOlderMessages}
            onRetryLoadOlder={retryLoadOlder}
            onMessageLongPress={handleMessageLongPress}
            onRetryMessage={handleRetryMessage}
            contentTop={contentTop}
          />
        </Pressable>

        {/* Composer with bottom margin for tab bar */}
        <View style={styles.composerWrapper}>
          <ChatComposer
            onSend={handleSend}
            onAttachmentPress={handleAttachmentPress}
          />
        </View>
      </KeyboardAvoidingView>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  listWrapper: {
    flex: 1,
  },
  composerWrapper: {
    marginBottom: TAB_BAR_HEIGHT,
  },
});

export default AlbumChatScreen;
