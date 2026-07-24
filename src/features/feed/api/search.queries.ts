import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "@/lib/api";
import searchApi from "./search.api";
import {
  PageFollowStatus,
  PageSearchResponse,
  PageSearchResult,
} from "../types/search.types";

const MIN_QUERY_LENGTH = 2;

export const pageSearchKey = (query: string) => ["pageSearch", query] as const;

/** Debounced page discovery. Skips queries shorter than 2 chars. */
export const usePageSearchQuery = (query: string) => {
  const trimmed = query.trim();
  return useQuery({
    queryKey: pageSearchKey(trimmed),
    queryFn: () => searchApi.searchPages(trimmed),
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 30 * 1000,
  });
};

// Only accepted follows count toward followerCount; pending requests don't.
const isCounted = (status: PageFollowStatus) =>
  status === "accepted" || status === "member";

/** Sets a page's status across every cached search result, adjusting the
 * follower count for the accepted↔not transition. */
const setStatus = (
  queryClient: ReturnType<typeof useQueryClient>,
  pageId: string,
  next: PageFollowStatus,
) => {
  queryClient.setQueriesData<PageSearchResponse>(
    { queryKey: ["pageSearch"] },
    (old) =>
      old
        ? {
            results: old.results.map((r): PageSearchResult => {
              if (r.pageId !== pageId) return r;
              const delta =
                (isCounted(next) ? 1 : 0) - (isCounted(r.myStatus) ? 1 : 0);
              return {
                ...r,
                myStatus: next,
                followerCount: Math.max(0, r.followerCount + delta),
              };
            }),
          }
        : old,
  );
};

type FollowVars = {
  albumId: string;
  pageId: string;
  isPublic: boolean;
  prevStatus: PageFollowStatus;
};

export const useFollowPageMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ albumId, pageId }: FollowVars) =>
      searchApi.followPage(albumId, pageId),
    // Optimistic: public → Following, private → Requested
    onMutate: ({ pageId, isPublic }) => {
      setStatus(queryClient, pageId, isPublic ? "accepted" : "pending");
    },
    onSuccess: (result, { pageId }) => {
      // Reconcile with the server's authoritative status
      setStatus(queryClient, pageId, result.status);
      if (result.status === "accepted") {
        queryClient.invalidateQueries({ queryKey: queryKeys.feed.list });
      }
    },
    onError: (_err, { pageId, prevStatus }) => {
      setStatus(queryClient, pageId, prevStatus);
    },
  });
};

export const useUnfollowPageMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ albumId, pageId }: FollowVars) =>
      searchApi.unfollowPage(albumId, pageId),
    onMutate: ({ pageId }) => {
      setStatus(queryClient, pageId, "none");
    },
    onSuccess: (_res, { prevStatus }) => {
      if (prevStatus === "accepted") {
        queryClient.invalidateQueries({ queryKey: queryKeys.feed.list });
      }
    },
    onError: (_err, { pageId, prevStatus }) => {
      setStatus(queryClient, pageId, prevStatus);
    },
  });
};
