/**
 * JoinAlbumScreenB — the editorial "Join an album" screen (albums-tab A/B,
 * "editorial" arm). Per-character code boxes over one hidden input, plus a
 * clipboard shortcut that recognizes invite links and whole codes.
 *
 * Album codes are 8 characters (the join endpoint validates length), so
 * the strip renders 8 cells. Joining by code is approval-based — it files
 * a request for the owner, which the copy says plainly. Pasted invite
 * LINKS route to the deep-link accept screen, which does join instantly
 * and previews the album.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

import { notify } from "@/components/global";
import { useJoinAlbumMutation } from "../api/album.queries";
import { color, font, radius, scriptType, type } from "@/lib/tokens";

const CODE_LENGTH = 8;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CELL_GAP = 8;
const CELL_WIDTH = Math.min(
  (SCREEN_WIDTH - 40 - CELL_GAP * (CODE_LENGTH - 1)) / CODE_LENGTH,
  48,
);

/** The invite deep link's id, or null. Matches ".../invite/<id>". */
const inviteIdFromText = (text: string): string | null => {
  const match = text.match(/invite\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
};

const JoinAlbumScreenB: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [code, setCode] = useState("");
  // The rejected code: the invalid state clears the moment the code differs
  const [invalidCode, setInvalidCode] = useState<string | null>(null);
  const joinAlbumMutation = useJoinAlbumMutation();

  const canJoin = code.length === CODE_LENGTH;
  const isInvalid = invalidCode !== null && invalidCode === code;

  // Sideways nudge on a rejected code — the error can't rely on the toast
  // host, which renders BENEATH this modal
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const handleChangeCode = useCallback((text: string) => {
    const cleaned = text
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, CODE_LENGTH);
    setCode(cleaned);
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handlePasteLink = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const clipboard = (await Clipboard.getStringAsync()).trim();

    const inviteId = inviteIdFromText(clipboard);
    if (inviteId) {
      // The accept screen previews the album and joins without approval
      router.push(`/invite/${inviteId}`);
      return;
    }

    const asCode = clipboard.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (asCode.length === CODE_LENGTH) {
      setCode(asCode);
      return;
    }

    notify.error(
      "No invite link found",
      "Copy the invite link or album code, then try again",
    );
  }, [router]);

  const handleJoin = async () => {
    if (!canJoin || joinAlbumMutation.isPending) return;

    try {
      // Approval-based: this files a pending request, it does NOT make us
      // a member yet — so don't navigate into the album
      await joinAlbumMutation.mutateAsync(code);

      router.back();
      notify.success("Request sent", "The album owner will review your request");
    } catch {
      // Inline, not notify.error — the toast host renders beneath this modal
      setInvalidCode(code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shakeX.value = withSequence(
        withTiming(-7, { duration: 50 }),
        withTiming(6, { duration: 50 }),
        withTiming(-4, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
    }
  };

  const cells = useMemo(
    () =>
      Array.from({ length: CODE_LENGTH }, (_, i) => ({
        char: code[i] ?? "",
        active: i === code.length,
      })),
    [code],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar barStyle="dark-content" />

      {/* ‹ · Join an album */}
      <View style={styles.navBar}>
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          style={({ pressed }) => [
            styles.navButton,
            pressed && styles.pressedDim,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={color.textPrimary} />
        </Pressable>
        <Text style={styles.navTitle}>Join an album</Text>
        <View style={styles.navButton} />
      </View>

      <View style={styles.content}>
        <Text style={styles.headline}>
          Enter the <Text style={styles.headlineScript}>album code</Text>
        </Text>
        <Text style={styles.subtitle}>
          Ask a member for the {CODE_LENGTH}-character album code, or open the
          invite link they sent you.
        </Text>

        {/* Code boxes over one hidden input */}
        <Animated.View style={shakeStyle}>
          <Pressable
            onPress={focusInput}
            style={styles.codeRow}
            accessibilityLabel="Album code"
          >
            {cells.map((cell, i) => (
              <View
                key={i}
                style={[
                  styles.codeCell,
                  cell.active && styles.codeCellActive,
                  isInvalid && styles.codeCellInvalid,
                ]}
              >
                <Text
                  style={[styles.codeChar, isInvalid && styles.codeCharInvalid]}
                >
                  {cell.char}
                </Text>
              </View>
            ))}
            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              value={code}
              onChangeText={handleChangeCode}
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={CODE_LENGTH}
              caretHidden
              accessibilityLabel="Album code input"
            />
          </Pressable>
        </Animated.View>
        {isInvalid && (
          <Text
            style={styles.invalidText}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            That code didn't match an album. Check it and try again.
          </Text>
        )}

        <Pressable
          onPress={handlePasteLink}
          hitSlop={8}
          style={({ pressed }) => [
            styles.pasteLink,
            pressed && styles.pressedDim,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Paste invite link instead"
        >
          <Ionicons name="link-outline" size={15} color={color.textPrimary} />
          <Text style={styles.pasteLinkLabel}>Paste invite link instead</Text>
        </Pressable>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={handleJoin}
          disabled={!canJoin || joinAlbumMutation.isPending}
          style={({ pressed }) => [
            styles.joinButton,
            !canJoin && styles.joinButtonDisabled,
            pressed && canJoin && styles.pressedDim,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Join album"
        >
          {joinAlbumMutation.isPending ? (
            <ActivityIndicator size="small" color={color.textInverse} />
          ) : (
            <>
              <Text
                style={[
                  styles.joinButtonLabel,
                  !canJoin && styles.joinButtonLabelDisabled,
                ]}
              >
                Join album
              </Text>
              <Ionicons
                name="arrow-forward"
                size={17}
                color={canJoin ? color.textInverse : color.textTertiary}
              />
            </>
          )}
        </Pressable>
        <Text style={styles.footerHint}>
          The album owner approves new members.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.bg,
  },
  pressedDim: {
    opacity: 0.7,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    ...type.navTitle,
    color: color.textPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  headline: {
    fontSize: 28,
    ...font.bold,
    color: color.textPrimary,
  },
  headlineScript: {
    ...scriptType(28),
    color: color.textPrimary,
  },
  subtitle: {
    ...type.body,
    lineHeight: 21,
    color: color.textSecondary,
    marginTop: 8,
    marginBottom: 28,
  },
  codeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: CELL_GAP,
  },
  codeCell: {
    width: CELL_WIDTH,
    height: CELL_WIDTH * 1.3,
    borderRadius: radius.md,
    backgroundColor: color.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  codeCellActive: {
    backgroundColor: color.bg,
    borderWidth: 1.5,
    borderColor: color.textPrimary,
  },
  codeCellInvalid: {
    backgroundColor: "rgba(229, 72, 77, 0.08)",
    borderWidth: 1.5,
    borderColor: color.danger,
  },
  codeCharInvalid: {
    color: color.danger,
  },
  invalidText: {
    ...type.bodySm,
    color: color.danger,
    textAlign: "center",
    marginTop: 14,
  },
  codeChar: {
    fontSize: 22,
    fontWeight: "600",
    color: color.textPrimary,
    // Album codes stay monospace — not part of the Instrument Sans sweep
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.01,
  },
  pasteLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    marginTop: 20,
    paddingVertical: 6,
  },
  pasteLinkLabel: {
    fontSize: 14,
    ...font.semibold,
    color: color.textPrimary,
    textDecorationLine: "underline",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
    borderRadius: radius.full,
    backgroundColor: color.textPrimary,
  },
  joinButtonDisabled: {
    backgroundColor: color.surface2,
  },
  joinButtonLabel: {
    fontSize: 16,
    ...font.semibold,
    color: color.textInverse,
  },
  joinButtonLabelDisabled: {
    color: color.textTertiary,
  },
  footerHint: {
    ...type.caption,
    color: color.textTertiary,
    textAlign: "center",
    marginTop: 10,
  },
});

export default JoinAlbumScreenB;
