/**
 * Activity center API — the user's cross-album notification feed
 * (GET /user/me/notifications) and the mark-all-read action.
 */

import { httpClient, endpoints } from "@/lib/api";

export type ActivityNotification = {
  notificationId: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

export type ActivityFeedResponse = {
  /** Newest first; cursor = createdAt of the last item. */
  notifications: ActivityNotification[];
  nextCursor: string | null;
  unreadCount: number;
};

const PAGE_SIZE = 30;

const activityApi = {
  getFeed: (cursor?: string) =>
    httpClient.get<ActivityFeedResponse>(endpoints.user.notifications, {
      params: { limit: PAGE_SIZE, cursor },
    }),

  /** Marks ALL notifications as read (204, empty body). */
  markAllRead: () => httpClient.post<void>(endpoints.user.notificationsRead),
};

export default activityApi;
