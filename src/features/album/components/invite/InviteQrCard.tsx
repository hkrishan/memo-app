/**
 * InviteQrCard — the signature element of the invite screen.
 * A white "ticket" card: a small memo wordmark, the invite QR code with a
 * generous quiet zone, a perforated tear-off divider (dashed line with
 * punched notches), and a stub carrying the album title + scan caption.
 * Handles the invite-link query's loading (pulsing skeleton) and error
 * (retry affordance) states in place of the QR.
 */

import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/** Matches the invite screen's page background — the notches "punch through" to it. */
const PAGE_BG = "#F2F2F0";
const QR_SIZE = 200;

type InviteQrCardProps = {
  albumTitle: string;
  /** Invite url once loaded; null while loading or errored. */
  url: string | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
};

const QrSkeleton = () => {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: 700 }),
        withTiming(1, { duration: 700 }),
      ),
      -1,
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[styles.skeleton, pulseStyle]}
      accessibilityLabel="Loading invite QR code"
    />
  );
};

const InviteQrCard: React.FC<InviteQrCardProps> = ({
  albumTitle,
  url,
  isLoading,
  isError,
  onRetry,
}) => {
  return (
    <View style={styles.card}>
      <Text style={styles.wordmark} accessibilityElementsHidden>
        memo
      </Text>

      <View
        style={styles.qrZone}
        accessible
        accessibilityLabel={
          url
            ? `QR code invite${albumTitle ? ` for ${albumTitle}` : ""}. Scan to join`
            : undefined
        }
      >
        {url ? (
          <QRCode
            value={url}
            size={QR_SIZE}
            color="#000000"
            backgroundColor="#ffffff"
            ecl="M"
          />
        ) : isError && !isLoading ? (
          <View style={styles.stateBox}>
            <Ionicons name="cloud-offline-outline" size={30} color="#B5B5B2" />
            <Text style={styles.stateText}>Couldn’t load the invite link</Text>
            <Pressable
              onPress={onRetry}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.retryButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Try loading the invite link again"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <QrSkeleton />
        )}
      </View>

      {/* Perforated tear-off divider */}
      <View style={styles.ticketRow}>
        <View style={styles.notch} />
        <View style={styles.dashClip}>
          <View style={styles.dashLine} />
        </View>
        <View style={styles.notch} />
      </View>

      <View style={styles.stub}>
        <Text style={styles.title} numberOfLines={1}>
          {albumTitle || "Your album"}
        </Text>
        <Text style={styles.caption} numberOfLines={1}>
          {albumTitle ? `Scan to join ${albumTitle}` : "Scan to join this album"}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  wordmark: {
    fontFamily: "BowlbyOneSC",
    fontSize: 11,
    letterSpacing: 2,
    color: "#000",
    textAlign: "center",
    paddingTop: 18,
  },
  qrZone: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  skeleton: {
    width: QR_SIZE,
    height: QR_SIZE,
    borderRadius: 12,
    backgroundColor: "#EFEFED",
  },
  stateBox: {
    width: QR_SIZE,
    height: QR_SIZE,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  stateText: {
    fontSize: 13,
    color: "#8A8A87",
  },
  retryButton: {
    borderWidth: 1.5,
    borderColor: "#111",
    borderRadius: 17,
    paddingHorizontal: 16,
    height: 34,
    justifyContent: "center",
    marginTop: 2,
  },
  retryButtonPressed: {
    backgroundColor: "#EDEDEB",
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111",
  },
  ticketRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 18,
  },
  notch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: PAGE_BG,
    marginHorizontal: -9,
  },
  dashClip: {
    flex: 1,
    height: 1,
    overflow: "hidden",
    marginHorizontal: 12,
  },
  dashLine: {
    height: 2,
    borderWidth: 1,
    borderColor: "#E2E2DF",
    borderStyle: "dashed",
  },
  stub: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 24,
    gap: 4,
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
    color: "#111",
    letterSpacing: -0.3,
  },
  caption: {
    fontSize: 13,
    color: "#8A8A87",
  },
});

export default InviteQrCard;
