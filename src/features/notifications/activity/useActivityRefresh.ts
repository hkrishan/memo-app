/**
 * Keeps the activity feed (and thereby the bell's unread badge) fresh:
 * refetches on app foreground and whenever a push arrives while the app
 * is open. Mounted by the bell itself — the listeners live exactly as
 * long as a bell is on screen, so there's no global subscription to leak.
 */

import { useEffect } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { activityKeys } from "./activity.queries";

export function useActivityRefresh(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: activityKeys.feed });
    };

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        invalidate();
      }
    });
    const notificationSub =
      Notifications.addNotificationReceivedListener(invalidate);

    return () => {
      appStateSub.remove();
      notificationSub.remove();
    };
  }, [queryClient]);
}
