import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import activityApi, { ActivityFeedResponse } from "./activity.api";

export const activityKeys = {
  feed: ["activity", "feed"] as const,
};

type ActivityFeedData = InfiniteData<ActivityFeedResponse, string | undefined>;

/** Cursor-paginated notification feed (newest first). */
export const useActivityFeedQuery = () => {
  return useInfiniteQuery({
    queryKey: activityKeys.feed,
    queryFn: ({ pageParam }) => activityApi.getFeed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 15 * 1000,
  });
};

/**
 * Unread badge count, derived from the feed's first page (the server
 * returns the total unreadCount alongside every page).
 */
export const useUnreadActivityCount = (): number => {
  const { data } = useActivityFeedQuery();
  return data?.pages[0]?.unreadCount ?? 0;
};

export const useMarkActivityReadMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => activityApi.markAllRead(),
    // Optimistic: zero the unread count immediately so the bell badge
    // clears the moment the activity screen opens; roll back on failure.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: activityKeys.feed });
      const previous = queryClient.getQueryData<ActivityFeedData>(
        activityKeys.feed,
      );
      if (previous) {
        queryClient.setQueryData<ActivityFeedData>(activityKeys.feed, {
          ...previous,
          pages: previous.pages.map((page) => ({ ...page, unreadCount: 0 })),
        });
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(activityKeys.feed, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: activityKeys.feed });
    },
  });
};
