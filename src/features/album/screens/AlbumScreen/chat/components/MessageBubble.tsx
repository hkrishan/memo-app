// Message bubble component with grouping support

import React, { memo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { ChatMessage, ChatUser, MessageAction } from "../types/chat.types";
import { memberColor } from "@/features/album/memberColor";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  sender?: ChatUser;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showAvatar: boolean;
  showTimestamp: boolean;
  onLongPress: (message: ChatMessage, action: MessageAction) => void;
  onRetry: (clientId: string) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const MessageBubble = memo<MessageBubbleProps>(
  ({
    message,
    isOwnMessage,
    sender,
    isFirstInGroup,
    isLastInGroup,
    showAvatar,
    showTimestamp,
    onLongPress,
    onRetry,
  }) => {
    const scale = useSharedValue(1);

    // Handle long press with gesture handler for better UX
    const longPressGesture = Gesture.LongPress()
      .minDuration(400)
      .onStart(() => {
        "worklet";
        scale.value = withTiming(0.95, { duration: 100 });
      })
      .onEnd(() => {
        "worklet";
        scale.value = withTiming(1, { duration: 100 });
      })
      .onFinalize((_event, success) => {
        "worklet";
        scale.value = withTiming(1, { duration: 100 });
        if (success) {
          // Trigger haptic + action sheet on JS thread
        }
      })
      .runOnJS(true);

    const handleLongPress = useCallback(() => {
      // Will open action sheet - for now just trigger copy as example
      onLongPress(message, "copy");
    }, [message, onLongPress]);

    const handleRetry = useCallback(() => {
      if (message.clientId) {
        onRetry(message.clientId);
      }
    }, [message.clientId, onRetry]);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    // System message style
    if (message.type === "system") {
      return (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={styles.systemContainer}
        >
          <Text style={styles.systemText}>{message.text}</Text>
        </Animated.View>
      );
    }

    const isFailed = message.status === "failed";
    const isSending = message.status === "sending";

    return (
      <Animated.View
        entering={FadeInDown.duration(200).springify()}
        style={[
          styles.container,
          isOwnMessage ? styles.containerOwn : styles.containerOther,
          !isLastInGroup && styles.containerGrouped,
        ]}
      >
        {/* Avatar placeholder for alignment — ringed in the sender's
            album identity color */}
        {!isOwnMessage && (
          <View style={styles.avatarContainer}>
            {showAvatar && sender?.avatarUrl ? (
              <Image
                source={{ uri: sender.avatarUrl }}
                style={[
                  styles.avatar,
                  { borderWidth: 2, borderColor: memberColor(sender) },
                ]}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : showAvatar ? (
              <View
                style={[
                  styles.avatarPlaceholder,
                  { borderWidth: 2, borderColor: memberColor(sender) },
                ]}
              >
                <Text style={styles.avatarInitial}>
                  {sender?.name?.charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
            ) : (
              <View style={styles.avatarSpacer} />
            )}
          </View>
        )}

        <View
          style={[
            styles.contentContainer,
            isOwnMessage ? styles.contentOwn : styles.contentOther,
          ]}
        >
          {/* Sender name for first in group (others only) — identity color
              lives on the avatar ring only, never on text */}
          {!isOwnMessage && isFirstInGroup && sender && (
            <Text style={styles.senderName}>{sender.name}</Text>
          )}

          <GestureDetector gesture={longPressGesture}>
            <AnimatedPressable
              onLongPress={handleLongPress}
              delayLongPress={400}
              style={animatedStyle}
              accessibilityRole="button"
              accessibilityLabel={`Message from ${isOwnMessage ? "you" : sender?.name}: ${message.text}`}
              accessibilityHint="Long press for options"
            >
              <View
                style={[
                  styles.bubble,
                  isOwnMessage ? styles.bubbleOwn : styles.bubbleOther,
                  isFirstInGroup &&
                    (isOwnMessage
                      ? styles.bubbleFirstOwn
                      : styles.bubbleFirstOther),
                  isLastInGroup &&
                    (isOwnMessage
                      ? styles.bubbleLastOwn
                      : styles.bubbleLastOther),
                  isFailed && styles.bubbleFailed,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    isOwnMessage
                      ? styles.messageTextOwn
                      : styles.messageTextOther,
                  ]}
                >
                  {message.text}
                </Text>
              </View>
            </AnimatedPressable>
          </GestureDetector>

          {/* Status indicators */}
          {isOwnMessage && (
            <View style={styles.statusContainer}>
              {isSending && (
                <ActivityIndicator
                  size="small"
                  color="#999"
                  style={styles.sendingIndicator}
                />
              )}
              {isFailed && (
                <Pressable
                  onPress={handleRetry}
                  style={styles.retryButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Retry sending message"
                >
                  <Ionicons name="alert-circle" size={16} color="#e53935" />
                  <Text style={styles.retryText}>Tap to retry</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Timestamp */}
          {showTimestamp && !isFailed && (
            <Text
              style={[
                styles.timestamp,
                isOwnMessage ? styles.timestampOwn : styles.timestampOther,
              ]}
            >
              {formatTime(message.createdAt)}
            </Text>
          )}
        </View>
      </Animated.View>
    );
  },
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.status === next.message.status &&
    prev.isFirstInGroup === next.isFirstInGroup &&
    prev.isLastInGroup === next.isLastInGroup &&
    prev.showAvatar === next.showAvatar &&
    prev.showTimestamp === next.showTimestamp &&
    // Identity colors arrive with the (async) members query — re-render
    // when the sender's color lands or changes
    prev.sender?.color === next.sender?.color,
);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingHorizontal: 12,
    marginBottom: 2,
  },
  containerOwn: {
    justifyContent: "flex-end",
  },
  containerOther: {
    justifyContent: "flex-start",
  },
  containerGrouped: {
    marginBottom: 1,
  },
  avatarContainer: {
    width: 32,
    marginRight: 8,
    alignSelf: "flex-end",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#e0e0e0",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  avatarSpacer: {
    width: 28,
    height: 28,
  },
  contentContainer: {
    maxWidth: "75%",
  },
  contentOwn: {
    alignItems: "flex-end",
  },
  contentOther: {
    alignItems: "flex-start",
  },
  senderName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 2,
    marginLeft: 12,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleOwn: {
    backgroundColor: "#000",
  },
  bubbleOther: {
    backgroundColor: "#f0f0f0",
  },
  bubbleFirstOwn: {
    borderTopRightRadius: 18,
  },
  bubbleFirstOther: {
    borderTopLeftRadius: 18,
  },
  bubbleLastOwn: {
    borderBottomRightRadius: 4,
  },
  bubbleLastOther: {
    borderBottomLeftRadius: 4,
  },
  bubbleFailed: {
    opacity: 0.7,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 21,
  },
  messageTextOwn: {
    color: "#fff",
  },
  messageTextOther: {
    color: "#000",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  sendingIndicator: {
    transform: [{ scale: 0.6 }],
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  retryText: {
    fontSize: 12,
    color: "#e53935",
    marginLeft: 4,
  },
  timestamp: {
    fontSize: 11,
    color: "#999",
    marginTop: 4,
  },
  timestampOwn: {
    textAlign: "right",
    marginRight: 4,
  },
  timestampOther: {
    textAlign: "left",
    marginLeft: 4,
  },
  systemContainer: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  systemText: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
  },
});

export default MessageBubble;
