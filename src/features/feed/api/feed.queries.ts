import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api";
import feedApi from "./feed.api";

export const useGetFeedQuery = () => {
  return useQuery({
    queryKey: queryKeys.feed.list,
    queryFn: () => feedApi.getFeed(),
    staleTime: 5 * 60 * 1000,
  });
};

/** Cross-album updates timeline (GET /feed/albums), cursor-paginated. */
export const useAlbumsFeedQuery = () => {
  return useInfiniteQuery({
    queryKey: queryKeys.feed.albums,
    queryFn: ({ pageParam }) => feedApi.getAlbumsFeed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 5 * 60 * 1000,
  });
};
