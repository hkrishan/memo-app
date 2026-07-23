/**
 * JS surface of the daily-drop Live Activity (iOS 16.2+ only).
 *
 * Every call is a safe no-op when the native module is absent — Android,
 * simulators, Expo Go, or an older build — so callers never need to
 * platform-guard beyond what reads naturally.
 */
import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

interface DailyDropActivityModule {
  areActivitiesEnabled: () => boolean;
  startActivity: (
    albumId: string,
    albumTitle: string,
    endsAtMs: number,
  ) => boolean;
  endAllActivities: () => void;
}

const native: DailyDropActivityModule | null = (() => {
  if (Platform.OS !== "ios") return null;
  try {
    return requireNativeModule<DailyDropActivityModule>("DailyDropActivity");
  } catch {
    // Build without the module (e.g. Expo Go) — feature quietly off
    return null;
  }
})();

/** True when this build/device can show Live Activities. */
export const areDailyDropActivitiesEnabled = (): boolean => {
  try {
    return native?.areActivitiesEnabled() ?? false;
  } catch {
    return false;
  }
};

/**
 * Start (or replace) the countdown Live Activity for an open drop.
 * Returns true when an activity is actually running.
 */
export const startDailyDropActivity = (
  albumId: string,
  albumTitle: string,
  endsAtMs: number,
): boolean => {
  try {
    return native?.startActivity(albumId, albumTitle, endsAtMs) ?? false;
  } catch {
    return false;
  }
};

/** End every daily-drop Live Activity. */
export const endDailyDropActivities = (): void => {
  try {
    native?.endAllActivities();
  } catch {
    // Best effort
  }
};
