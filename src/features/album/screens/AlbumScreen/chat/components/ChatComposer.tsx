// Chat composer with animated height and keyboard handling

import React, { memo, useCallback, useRef, useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ChatComposerProps {
  onSend: (text: string) => void;
  onAttachmentPress: () => void;
  /** Called with true while the user has draft text, false when cleared/blurred/sent. */
  onTypingChange?: (typing: boolean) => void;
  disabled?: boolean;
}

const MAX_INPUT_HEIGHT = 120; // ~5 lines
const MIN_INPUT_HEIGHT = 36;

const ChatComposer = memo<ChatComposerProps>(
  ({ onSend, onAttachmentPress, onTypingChange, disabled = false }) => {
    const inputRef = useRef<TextInput>(null);
    const [text, setText] = useState("");
    const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
    // iOS race: a pending autocorrect can commit right AFTER send taps
    // through, firing a late onChangeText that restuffs the cleared box.
    // Change events inside this window are treated as that echo.
    const clearGuardUntilRef = useRef(0);

    const animatedHeight = useSharedValue(MIN_INPUT_HEIGHT);
    const sendButtonScale = useSharedValue(0);

    const canSend = text.trim().length > 0 && !disabled;

    // Update send button visibility
    React.useEffect(() => {
      sendButtonScale.value = withSpring(canSend ? 1 : 0, {
        damping: 15,
        stiffness: 200,
      });
    }, [canSend, sendButtonScale]);

    const handleChangeText = useCallback(
      (newText: string) => {
        if (newText.length > 0 && Date.now() < clearGuardUntilRef.current) {
          // Late autocorrect commit from the message just sent — keep the
          // field empty instead of restoring the corrected text
          inputRef.current?.clear();
          setText("");
          return;
        }
        setText(newText);
        onTypingChange?.(newText.trim().length > 0);
      },
      [onTypingChange],
    );

    const handleBlur = useCallback(() => {
      onTypingChange?.(false);
    }, [onTypingChange]);

    const handleContentSizeChange = useCallback(
      (event: { nativeEvent: { contentSize: { height: number } } }) => {
        const newHeight = Math.min(
          Math.max(event.nativeEvent.contentSize.height, MIN_INPUT_HEIGHT),
          MAX_INPUT_HEIGHT,
        );

        if (Math.abs(newHeight - inputHeight) > 1) {
          setInputHeight(newHeight);
          animatedHeight.value = withTiming(newHeight, { duration: 100 });
        }
      },
      [inputHeight, animatedHeight],
    );

    const handleSend = useCallback(() => {
      const trimmedText = text.trim();
      if (!trimmedText || disabled) return;

      onSend(trimmedText);
      onTypingChange?.(false);
      setText("");
      // Clear the NATIVE field too, and swallow the change event a pending
      // autocorrect fires just after the tap (it would restuff the box)
      inputRef.current?.clear();
      clearGuardUntilRef.current = Date.now() + 250;
      setInputHeight(MIN_INPUT_HEIGHT);
      animatedHeight.value = withTiming(MIN_INPUT_HEIGHT, { duration: 100 });

      // Keep focus on input after sending
      inputRef.current?.focus();
    }, [text, disabled, onSend, onTypingChange, animatedHeight]);

    const handleAttachmentPress = useCallback(() => {
      Keyboard.dismiss();
      onAttachmentPress();
    }, [onAttachmentPress]);

    const inputContainerAnimatedStyle = useAnimatedStyle(() => ({
      minHeight: animatedHeight.value + 16, // padding
    }));

    const sendButtonAnimatedStyle = useAnimatedStyle(() => {
      const scale = interpolate(
        sendButtonScale.value,
        [0, 1],
        [0.5, 1],
        Extrapolation.CLAMP,
      );
      return {
        transform: [{ scale }],
        opacity: sendButtonScale.value,
      };
    });

    return (
      <View style={styles.container}>
        <Animated.View
          style={[styles.inputContainer, inputContainerAnimatedStyle]}
        >
          {/* Attachment button */}
          <Pressable
            onPress={handleAttachmentPress}
            style={styles.attachmentButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Add attachment"
          >
            <Ionicons name="add-circle" size={28} color="#000" />
          </Pressable>

          {/* Text input */}
          <View style={styles.inputWrapper}>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                { height: Math.max(inputHeight, MIN_INPUT_HEIGHT) },
              ]}
              value={text}
              onChangeText={handleChangeText}
              onBlur={handleBlur}
              onContentSizeChange={handleContentSizeChange}
              placeholder="Message..."
              placeholderTextColor="#999"
              multiline
              maxLength={4000}
              textAlignVertical="center"
              returnKeyType="default"
              blurOnSubmit={false}
              editable={!disabled}
              accessibilityLabel="Message input"
              accessibilityHint="Type a message to send"
            />
          </View>

          {/* Send button */}
          <AnimatedPressable
            onPress={handleSend}
            style={[styles.sendButton, sendButtonAnimatedStyle]}
            disabled={!canSend}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend }}
          >
            <Ionicons name="arrow-up-circle" size={32} color="#000" />
          </AnimatedPressable>
        </Animated.View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#f5f5f5",
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  attachmentButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrapper: {
    flex: 1,
    justifyContent: "center",
  },
  input: {
    fontSize: 16,
    lineHeight: 20,
    color: "#000",
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === "ios" ? 8 : 4,
    maxHeight: MAX_INPUT_HEIGHT,
  },
  sendButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default ChatComposer;
