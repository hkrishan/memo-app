import { useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { httpClient, endpoints } from "@/lib/api";
import { captureException } from "@/lib/sentry";
import { dropCaptureRoute } from "@/features/moments/hooks/useDropTakeover";

/**
 * The token most recently registered with the backend in this app session.
 * Mirrored to AsyncStorage: logout in a LATER session must still be able
 * to unregister a token minted in an earlier one, or a logged-out device
 * keeps receiving the account's pushes (comment texts included).
 */
let lastRegisteredToken: string | null = null;
const PUSH_TOKEN_STORAGE_KEY = "memo.push.registeredToken";

const easProjectId = (): string | null => {
  const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof projectId === "string" && projectId.length > 0
    ? projectId
    : null;
};

/**
 * The token to clean up at logout: this session's registration, else the
 * persisted one from an earlier session, else — permission already granted
 * — re-derived from the OS (tokens are stable per device+project).
 */
async function resolveTokenForUnregister(): Promise<string | null> {
  if (lastRegisteredToken) {
    return lastRegisteredToken;
  }
  try {
    const stored = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    if (stored) {
      return stored;
    }
  } catch {
    // Storage unavailable — fall through to re-derivation
  }
  try {
    const projectId = easProjectId();
    if (!Device.isDevice || !projectId) {
      return null;
    }
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      return null;
    }
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

/**
 * Register this device's Expo push token with the backend.
 *
 * Guards (all bail quietly — this must never throw or block auth flows):
 * - simulators/emulators (no push support)
 * - permission denied
 * - missing EAS projectId (running without an EAS project — graceful no-op)
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) {
      return;
    }
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      return;
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") {
      return; // User declined — respect it quietly
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
      });
      // Daily drops ring with their own chime — Android sounds are a
      // channel property, so they need a dedicated channel the server
      // targets via the push message's channelId
      await Notifications.setNotificationChannelAsync("daily-drop", {
        name: "Daily Drop",
        importance: Notifications.AndroidImportance.MAX,
        // Underscored: Android resource names forbid hyphens (the channel
        // ID itself is an arbitrary string, so it keeps its name)
        sound: "daily_drop.wav",
        vibrationPattern: [0, 160, 120, 160],
      });
    }

    const projectId = easProjectId();
    if (!projectId) {
      if (__DEV__) {
        console.log(
          "[push] No EAS projectId in app config (extra.eas.projectId) — skipping push registration",
        );
      }
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    await httpClient.put<void>(endpoints.user.pushToken, {
      token,
      platform: Platform.OS,
    });

    lastRegisteredToken = token;
    // Best-effort persistence for cross-session logout cleanup
    AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token).catch(() => {});
  } catch (error) {
    if (__DEV__) console.error("[push] Failed to register push token:", error);
    captureException(error, { operation: "registerPushToken" });
  }
}

/**
 * Best-effort removal of this device's push token from the backend.
 * Call BEFORE auth tokens are cleared on logout (needs the auth'd client).
 * Never throws.
 */
export async function unregisterPushToken(): Promise<void> {
  const token = await resolveTokenForUnregister();
  if (!token) {
    return;
  }
  try {
    await httpClient.request<void>({
      method: "DELETE",
      endpoint: endpoints.user.pushToken,
      body: { token },
    });
    lastRegisteredToken = null;
    AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY).catch(() => {});
  } catch (error) {
    if (__DEV__) {
      console.warn("[push] Failed to unregister push token:", error);
    }
  }
}

// Guard so a re-mount of the routing hook doesn't re-route the cold-start tap.
let handledInitialResponse = false;

/**
 * Resolve an in-app route from a notification's `data` payload:
 * an explicit `data.url`, or one derived from typed payloads such as
 * `{type: "moment", albumId}`. Shared with the activity feed, whose rows
 * carry the same payloads.
 */
export function extractUrlFromNotificationData(
  data: Record<string, unknown> | null | undefined,
): string | null {
  const url = data?.url;
  if (typeof url === "string") {
    return url;
  }
  // Typed payloads without an explicit url. "moment" (a drop fired / a
  // challenge started) lands on the album's Moments tab (index 2).
  if (data?.type === "moment" && typeof data.albumId === "string") {
    return `/album/${data.albumId}?initialTab=2`;
  }
  return null;
}

function extractUrl(
  response: Notifications.NotificationResponse,
): string | null {
  const data = response.notification.request.content.data;
  // Moment pushes with full event coordinates go straight into the drop
  // capture screen — deliberately ahead of data.url, whose server value
  // still points at the album's Moments tab.
  if (
    data?.type === "moment" &&
    typeof data.albumId === "string" &&
    typeof data.momentId === "string" &&
    typeof data.eventId === "string"
  ) {
    return dropCaptureRoute({
      albumId: data.albumId,
      momentId: data.momentId,
      eventId: data.eventId,
      deadlineAt:
        typeof data.deadlineAt === "string" ? data.deadlineAt : undefined,
    });
  }
  return extractUrlFromNotificationData(data);
}

/**
 * Routes notification taps to the URL carried in the notification's
 * `data.url` payload (or derived from typed payloads such as
 * `{type: "moment", albumId}`). Handles both taps while the app is alive
 * and the cold-start case (app launched by tapping a notification).
 */
export function usePushNotificationRouting(): void {
  const router = useRouter();

  useEffect(() => {
    // Show notifications while the app is foregrounded (banner + sound).
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = extractUrl(response);
        if (url) {
          router.push(url as Parameters<typeof router.push>[0]);
        }
      },
    );

    // Cold start: the app was launched by tapping a notification.
    if (!handledInitialResponse) {
      handledInitialResponse = true;
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          const url = response ? extractUrl(response) : null;
          if (url) {
            router.push(url as Parameters<typeof router.push>[0]);
          }
        })
        .catch((error) => {
          if (__DEV__) {
            console.warn("[push] Failed to read launch notification:", error);
          }
        });
    }

    return () => {
      subscription.remove();
    };
  }, [router]);
}
