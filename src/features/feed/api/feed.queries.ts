import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api";
import feedApi from "./feed.api";

export const useGetFeedQuery = () => {
  return useQuery({
    queryKey: queryKeys.feed.list,
    queryFn: () => feedApi.getFeed(),
    staleTime: 5 * 60 * 1000,
  });
};
