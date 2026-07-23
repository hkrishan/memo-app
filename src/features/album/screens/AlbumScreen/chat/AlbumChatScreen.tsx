// Album Chat Screen - main chat container

import React, { memo, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Alert,
  ActionSheetIOS,
  ActivityIndicator,
  Keyboard,
  Pressable,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useAuthStore, selectUser } from "@/features/auth";
import { useGetAlbumQuery } from "@/features/album/api/album.queries";
import { notify } from "@/components/global";
import {
  ReportContentSheet,
  ReportTarget,
  useBlockUser,
} from "@/features/moderation";
import { useChatController } from "./hooks/useChatController";
import { ChatMessage, ChatUser, MessageAction } from "./types/chat.types";
import ChatMessageList from "./components/ChatMessageList";
import ChatComposer from "./components/ChatComposer";

// Tab bar height - space needed at bottom for tab bar
interface AlbumChatScreenProps {
  albumId: string;
  albumTitle?: string;
  contentTop: number;
  /** Space kept under the composer (e.g. the home indicator inset) */
  bottomInset?: number;
}

const AlbumChatScreen = memo<AlbumChatScreenProps>(
  ({ albumId, albumTitle, contentTop, bottomInset = 0 }) => {
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

    // Report flow — the target is RETAINED through the sheet's close
    // animation so its content doesn't blank out mid-dismiss
    const [reportOpen, setReportOpen] = useState(false);
    const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
    const blockUser = useBlockUser();

    // Real identity + album members
    const authUser = useAuthStore(selectUser);
    const { data: album } = useGetAlbumQuery(albumId);

    const currentUser: ChatUser = useMemo(
      () => ({
        userId: authUser?.id ?? "",
        name: authUser?.name ?? "You",
        avatarUrl: authUser?.avatarUrl ?? null,
      }),
      [authUser],
    );

    // Initialize chat controller
    const {
      listItems,
      isEmpty,
      isLoadingOlder,
      hasOlderMessages,
      showLoadMoreError,
      typingUsers,
      isConnected,
      isInitialLoading,
      sendMessage,
      retryMessage,
      loadOlderMessages,
      retryLoadOlder,
      setTyping,
    } = useChatController({
      albumId,
      currentUser,
    });

    // Create member lookup map for efficient access
    const membersMap = useMemo(() => {
      const map = new Map<string, ChatUser>();
      (album?.members ?? []).forEach((member) => {
        map.set(member.userId, {
          userId: member.userId,
          name: member.name,
          avatarUrl: member.avatarUrl,
        });
      });
      // Ensure the current user always resolves
      if (currentUser.userId && !map.has(currentUser.userId)) {
        map.set(currentUser.userId, currentUser);
      }
      return map;
    }, [album?.members, currentUser]);

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

    // Report a message (targetId = the server message id)
    const handleReportMessage = useCallback(
      (message: ChatMessage) => {
        setReportTarget({
          targetType: "chat_message",
          targetId: message.id,
          albumId,
        });
        setReportOpen(true);
      },
      [albumId],
    );
    const handleCloseReport = useCallback(() => setReportOpen(false), []);

    // Block a message's sender, with confirmation. Their messages vanish
    // immediately: the block mutation updates the blocked-users cache the
    // chat controller filters against.
    const handleBlockSender = useCallback(
      (message: ChatMessage) => {
        const sender = membersMap.get(message.senderId);
        const senderName = sender?.name ?? message.authorName ?? "this user";
        Alert.alert(
          `Block ${senderName}?`,
          "You won't see their messages, photos, or comments anymore, and they won't be able to interact with you. They won't be notified.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Block",
              style: "destructive",
              onPress: () => {
                blockUser.mutate(
                  {
                    userId: message.senderId,
                    name: sender?.name ?? message.authorName,
                    avatarUrl: sender?.avatarUrl ?? message.authorAvatarUrl,
                  },
                  {
                    onSuccess: () => {
                      notify.success(
                        "Blocked",
                        `${senderName} has been blocked`,
                      );
                    },
                    onError: () => {
                      notify.error("Couldn't Block", "Please try again");
                    },
                  },
                );
              },
            },
          ],
        );
      },
      [membersMap, blockUser],
    );

    // Handle long press on message
    const handleMessageLongPress = useCallback(
      (message: ChatMessage, _action: MessageAction) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // Report/block only apply to other people's real messages
        const canModerate =
          message.type === "user" &&
          message.senderId !== currentUser.userId &&
          message.status === "sent";

        if (Platform.OS === "ios") {
          const options = ["Cancel", "Copy", "Reply"];
          if (canModerate) {
            options.push("Report Message", "Block User");
          }
          ActionSheetIOS.showActionSheetWithOptions(
            {
              options,
              cancelButtonIndex: 0,
              destructiveButtonIndex: canModerate ? 4 : undefined,
            },
            (buttonIndex) => {
              if (buttonIndex === 1) {
                Clipboard.setStringAsync(message.text);
              } else if (buttonIndex === 2) {
                setReplyingTo(message);
              } else if (canModerate && buttonIndex === 3) {
                handleReportMessage(message);
              } else if (canModerate && buttonIndex === 4) {
                handleBlockSender(message);
              }
            },
          );
        } else if (canModerate) {
          // Android alerts cap at 3 buttons — moderation lives one level in
          Alert.alert(
            "Message Options",
            undefined,
            [
              {
                text: "Copy",
                onPress: () => Clipboard.setStringAsync(message.text),
              },
              {
                text: "Reply",
                onPress: () => setReplyingTo(message),
              },
              {
                text: "Report or Block…",
                onPress: () => {
                  Alert.alert(
                    "Report or Block",
                    undefined,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Report Message",
                        onPress: () => handleReportMessage(message),
                      },
                      {
                        text: "Block User",
                        style: "destructive",
                        onPress: () => handleBlockSender(message),
                      },
                    ],
                    { cancelable: true },
                  );
                },
              },
            ],
            { cancelable: true },
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
      [currentUser.userId, handleReportMessage, handleBlockSender],
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

    const showInitialLoading = isInitialLoading && isEmpty;

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* Subtle connection state banner */}
        {!isConnected && (
          <View style={styles.connectingBanner}>
            <ActivityIndicator size="small" color="#999" />
            <Text style={styles.connectingText}>Connecting…</Text>
          </View>
        )}

        {/* Tappable area to dismiss keyboard */}
        <Pressable style={styles.listWrapper} onPress={handleDismissKeyboard}>
          {showInitialLoading ? (
            <View style={[styles.loadingContainer, { paddingTop: contentTop }]}>
              <ActivityIndicator size="small" color="#999" />
            </View>
          ) : (
            <ChatMessageList
              listItems={listItems}
              currentUserId={currentUser.userId}
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
          )}
        </Pressable>

        <View style={{ marginBottom: bottomInset }}>
          <ChatComposer
            onSend={handleSend}
            onAttachmentPress={handleAttachmentPress}
            onTypingChange={setTyping}
          />
        </View>

        <ReportContentSheet
          visible={reportOpen}
          target={reportTarget}
          onClose={handleCloseReport}
        />
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
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  connectingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
    backgroundColor: "#f7f7f7",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  connectingText: {
    fontSize: 13,
    color: "#888",
  },
});

export default AlbumChatScreen;
