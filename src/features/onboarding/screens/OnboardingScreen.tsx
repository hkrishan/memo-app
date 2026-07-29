/**
 * Post-login intro flow: a welcome screen plus one priming screen per
 * permission (camera & mic, photo library, notifications). Each native
 * prompt fires from its own explicit button press instead of ambushing
 * the user at first use; declines advance quietly because every
 * permission already has a denied-state fallback at its point of use.
 *
 * ONE route with an internal step machine (unlike the routed /phone
 * group): the queue of permission steps is filtered by current OS status
 * before it starts, so existing users who already granted everything see
 * only the welcome screen. Visual language continues the dark phone-flow
 * kit; headlines end in the Instrument Serif italic accent — the same
 * treatment as the "Memo Create" / "Memo Premium" wordmarks.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StatusBar, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library";
import * as Notifications from "expo-notifications";
import { Camera } from "react-native-vision-camera";

import { sanitizeRedirect } from "@/features/auth/hooks/useAuth";
import { flowStyles } from "@/features/auth/screens/phone/phoneFlowShared";
import { registerPushToken } from "@/features/notifications/push";
import { color, font, scriptType } from "@/lib/tokens";
import { useOnboardingStore } from "../store/onboardingStore";

type PermissionKey = "camera" | "photos" | "notifications";
type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const PERMISSION_COPY: Record<
  PermissionKey,
  {
    icon: IoniconName;
    /** First headline line — Instrument Sans bold */
    title: string;
    /** Second headline line — Instrument Serif italic accent */
    titleAccent: string;
    body: string;
    cta: string;
  }
> = {
  camera: {
    icon: "camera-outline",
    title: "Capture it",
    titleAccent: "as it happens",
    body: "Photos and videos go straight into your shared albums. The microphone records sound for your videos.",
    cta: "Enable camera",
  },
  photos: {
    icon: "images-outline",
    title: "Bring your",
    titleAccent: "camera roll",
    body: "Add favorites from your library to any album, and save the ones your friends share back to your device.",
    cta: "Allow photo access",
  },
  notifications: {
    icon: "notifications-outline",
    title: "Know when",
    titleAccent: "friends post",
    body: "Get a nudge when your friends add photos, comment, and share new memories in your albums.",
    cta: "Turn on notifications",
  },
};

const WELCOME_ROWS: ReadonlyArray<{ icon: IoniconName; text: string }> = [
  { icon: "camera-outline", text: "Shoot photos and videos straight into shared albums" },
  { icon: "people-outline", text: "Build albums together with your people" },
  { icon: "flash-outline", text: "One daily drop — everyone posts at once" },
];

/** Permissions still worth asking for, in the order the flow presents them. */
async function detectPermissionQueue(): Promise<PermissionKey[]> {
  const queue: PermissionKey[] = [];
  if (
    Camera.getCameraPermissionStatus() !== "granted" ||
    Camera.getMicrophonePermissionStatus() !== "granted"
  ) {
    queue.push("camera");
  }
  try {
    const media = await MediaLibrary.getPermissionsAsync();
    if (!media.granted) queue.push("photos");
  } catch {
    queue.push("photos");
  }
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") queue.push("notifications");
  } catch {
    queue.push("notifications");
  }
  return queue;
}

const OnboardingScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);

  // null while OS statuses resolve (a few ms — well under reading time)
  const [queue, setQueue] = useState<PermissionKey[] | null>(null);
  // -1 = welcome screen, otherwise an index into queue
  const [index, setIndex] = useState(-1);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    detectPermissionQueue().then((q) => {
      if (live) setQueue(q);
    });
    return () => {
      live = false;
    };
  }, []);

  const finish = useCallback(() => {
    completeOnboarding();
    router.replace(sanitizeRedirect(redirect) ?? "/(app)");
  }, [completeOnboarding, router, redirect]);

  const handleGetStarted = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      // Re-detect if the mount-time check hasn't landed yet (cold storage)
      const resolved = queue ?? (await detectPermissionQueue());
      setQueue(resolved);
      Haptics.selectionAsync().catch(() => {});
      if (resolved.length === 0) {
        finish();
      } else {
        setIndex(0);
      }
    } finally {
      setPending(false);
    }
  }, [pending, queue, finish]);

  const advance = useCallback(() => {
    if (!queue) return;
    if (index + 1 >= queue.length) {
      finish();
    } else {
      setIndex(index + 1);
    }
  }, [queue, index, finish]);

  const handleEnable = useCallback(async () => {
    if (pending || !queue) return;
    const step = queue[index];
    setPending(true);
    let granted = false;
    try {
      if (step === "camera") {
        const cam = await Camera.requestCameraPermission();
        const mic = await Camera.requestMicrophonePermission();
        granted = cam === "granted" && mic === "granted";
      } else if (step === "photos") {
        granted = (await MediaLibrary.requestPermissionsAsync()).granted;
      } else {
        const { status } = await Notifications.requestPermissionsAsync();
        granted = status === "granted";
        // Register in the background — never blocks the flow, never throws
        if (granted) void registerPushToken();
      }
    } catch {
      // Treat as declined — the owning feature re-asks at point of use
    }
    if (granted) {
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    }
    setPending(false);
    advance();
  }, [pending, queue, index, advance]);

  const handleNotNow = useCallback(() => {
    if (pending) return;
    Haptics.selectionAsync().catch(() => {});
    advance();
  }, [pending, advance]);

  const step = index >= 0 && queue ? queue[index] : null;

  return (
    <View
      style={[
        flowStyles.container,
        {
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 16),
        },
      ]}
    >
      <StatusBar barStyle="light-content" />
      {step === null ? (
        <View style={styles.pane}>
          <Animated.View entering={FadeInDown.duration(300)}>
            <Text style={styles.wordmark}>MEMO</Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.duration(300).delay(60)}>
            <Text style={styles.welcomeTitle}>
              Shared memories,{"\n"}
              <Text style={styles.welcomeTitleAccent}>together.</Text>
            </Text>
          </Animated.View>
          <View style={styles.rows}>
            {WELCOME_ROWS.map((row, i) => (
              <Animated.View
                key={row.text}
                entering={FadeInDown.duration(300).delay(140 + i * 70)}
                style={styles.row}
              >
                <Ionicons name={row.icon} size={20} color="#fff" />
                <Text style={styles.rowText}>{row.text}</Text>
              </Animated.View>
            ))}
          </View>
          <View style={styles.spacer} />
          <Animated.View entering={FadeInDown.duration(300).delay(400)}>
            <Pressable
              style={flowStyles.primaryButton}
              onPress={handleGetStarted}
              disabled={pending}
              accessibilityRole="button"
            >
              <Text style={flowStyles.primaryButtonText}>Get started</Text>
              <Ionicons name="arrow-forward" size={18} color="#000" />
            </Pressable>
          </Animated.View>
        </View>
      ) : (
        // Keyed by step: swapping the key re-mounts the pane, so the
        // entrance stagger replays on every step change (no router here)
        <View key={step} style={styles.pane}>
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={styles.progressRow}
          >
            {queue?.map((key, i) => (
              <View
                key={key}
                style={[
                  styles.progressSegment,
                  i <= index && styles.progressSegmentActive,
                ]}
              />
            ))}
          </Animated.View>
          <Animated.View entering={FadeInDown.duration(300).delay(60)}>
            <Ionicons
              name={PERMISSION_COPY[step].icon}
              size={34}
              color="#fff"
              style={styles.stepIcon}
            />
          </Animated.View>
          <Animated.View entering={FadeInDown.duration(300).delay(120)}>
            <Text style={styles.stepTitle}>
              {PERMISSION_COPY[step].title}
              {"\n"}
              <Text style={styles.stepTitleAccent}>
                {PERMISSION_COPY[step].titleAccent}
              </Text>
            </Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.duration(300).delay(180)}>
            <Text style={flowStyles.subtitle}>{PERMISSION_COPY[step].body}</Text>
          </Animated.View>
          <View style={styles.spacer} />
          <Animated.View entering={FadeInDown.duration(300).delay(240)}>
            <Text style={styles.settingsHint}>
              You can change this anytime in Settings.
            </Text>
            <Pressable
              style={[
                flowStyles.primaryButton,
                pending && flowStyles.primaryButtonDisabled,
              ]}
              onPress={handleEnable}
              disabled={pending}
              accessibilityRole="button"
            >
              {pending ? (
                <ActivityIndicator size={18} color="#000" />
              ) : (
                <Text style={flowStyles.primaryButtonText}>
                  {PERMISSION_COPY[step].cta}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={styles.skipButton}
              onPress={handleNotNow}
              disabled={pending}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>Not now</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    paddingHorizontal: 24,
  },
  spacer: {
    flex: 1,
  },
  // Welcome
  wordmark: {
    marginTop: 36,
    fontSize: 13,
    ...font.bold,
    letterSpacing: 3,
    color: "#fff",
  },
  welcomeTitle: {
    marginTop: 18,
    fontSize: 34,
    ...font.bold,
    letterSpacing: -0.8,
    lineHeight: 44,
    color: "#fff",
  },
  welcomeTitleAccent: {
    ...scriptType(34),
    letterSpacing: 0,
    color: "#fff",
  },
  rows: {
    marginTop: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separatorDark,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separatorDark,
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    ...font.medium,
    color: "#fff",
  },
  // Permission steps
  progressRow: {
    marginTop: 20,
    flexDirection: "row",
    gap: 6,
  },
  progressSegment: {
    width: 26,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  progressSegmentActive: {
    backgroundColor: "#fff",
  },
  stepIcon: {
    marginTop: 44,
    marginBottom: 18,
  },
  stepTitle: {
    fontSize: 32,
    ...font.bold,
    letterSpacing: -0.6,
    lineHeight: 41,
    color: "#fff",
  },
  stepTitleAccent: {
    ...scriptType(32),
    letterSpacing: 0,
    color: "#fff",
  },
  settingsHint: {
    fontSize: 13,
    color: "#6e6e73",
    textAlign: "center",
    marginBottom: 14,
  },
  skipButton: {
    alignSelf: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  skipText: {
    fontSize: 15,
    color: "#8e8e93",
  },
});

export default OnboardingScreen;
