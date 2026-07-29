/**
 * Socket-delivered in-app notification banners.
 *
 * memo-api mirrors every push it sends to memo-socket, which emits
 * `notification:new` into each recipient's personal room. While the app is
 * foregrounded the OS push presentation is suppressed (see push.ts), and
 * this listener shows the toast banner instead: it slides down from the
 * top, auto-dismisses, and tapping it routes to the same destination a
 * push tap would (chat → the album's chat, photo → the album gallery with
 * the photo open, and so on).
 */

import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { holdSocket, releaseSocket } from "@/lib/socket/socketClient";
import { notify } from "@/components/global";
import {
  selectIsAuthenticated,
  useAuthStore,
} from "@/features/auth/store/authStore";
import { routeForNotificationData } from "../push";
import { activityKeys } from "../activity/activity.queries";

const BANNER_DURATION_MS = 4000;

type InAppNotification = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export function useInAppNotificationBanners(): void {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = holdSocket("in-app-banners");

    const onNotification = (notification: InAppNotification) => {
      const data = notification.data;

      // Fired drops already take over the whole screen via `moment:drop`
      // (useDropTakeover) — a banner on top would be noise
      if (data?.type === "moment" && typeof data.eventId === "string") {
        return;
      }

      // The bell/activity feed has a new row — same refresh the push
      // listener triggers (useActivityRefresh), but socket-fast
      void queryClient.invalidateQueries({ queryKey: activityKeys.feed });

      const url = routeForNotificationData(data);
      notify.toast({
        type: "info",
        title: notification.title,
        message: notification.body,
        duration: BANNER_DURATION_MS,
        onPress: url
          ? () => router.push(url as never)
          : undefined,
      });
    };

    socket.on("notification:new", onNotification);
    return () => {
      socket.off("notification:new", onNotification);
      releaseSocket("in-app-banners");
    };
  }, [isAuthenticated, router, queryClient]);
}
