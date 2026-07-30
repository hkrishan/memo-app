import NetInfo from "@react-native-community/netinfo";
import { env } from "@/lib/env";
import {
  QueryClient,
  QueryCache,
  MutationCache,
  onlineManager,
} from "@tanstack/react-query";
import { notify } from "@/components/global/notification";
import { ApiError } from "./errors";

// React Native has no browser online/offline events — feed connectivity to
// react-query from NetInfo so refetchOnReconnect actually fires and paused
// queries resume the moment the network comes back.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false);
  }),
);

/**
 * How long a restored disk snapshot stays usable (see queryProvider) —
 * the offline-viewing window.
 */
export const QUERY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * In-memory garbage-collection window. One day keeps the persisted
 * allowlist (albums, first pages of photo/feed lists) alive long enough
 * to be snapshotted without keeping every album ever opened resident —
 * which is what made each persist serialize megabytes.
 */
const DEFAULT_GC_TIME_MS = 24 * 60 * 60 * 1000;

/** Transport failure (offline) — httpClient's NetworkError/ParseError. */
const isTransportError = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 0;

/**
 * Retry only what a retry can fix: timeouts (408) and server errors (5xx).
 * A transport failure (status 0) means we're offline — retrying burns
 * time for nothing; refetchOnReconnect re-runs the query the moment the
 * network returns. Auth/client errors (4xx) never retry.
 */
const shouldRetry = (failureCount: number, error: Error): boolean => {
  if (error instanceof ApiError) {
    if (error.status === 408 || error.status >= 500) return failureCount < 2;
    return false;
  }
  return failureCount < 2;
};

export const queryClient = new QueryClient({
  // React Query v5 removed query-level onError; the cache-level handler is
  // the supported way to log every query failure.
  queryCache: new QueryCache({
    onError: (error) => {
      if (env?.isDevelopment) {
        console.error("❌ Query Error:", error);
      }
    },
  }),
  // Blanket error surface for mutations. Many mutation hooks (album
  // delete/leave/join, profile edit, member color…) have no onError of
  // their own — without this they fail in complete silence and the UI just
  // doesn't change. Mutations that DO handle errors (their own toast,
  // optimistic rollback UI) are left alone.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (env?.isDevelopment) {
        console.error("❌ Mutation Error:", error);
      }
      if (mutation.options.onError) return;
      if (isTransportError(error)) {
        notify.error(
          "No internet connection",
          "That change didn't go through. Try again when you're back online.",
        );
      } else {
        notify.error("Something went wrong", "Please try again.");
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: DEFAULT_GC_TIME_MS,
      // "online" (the library default) PAUSES queries while NetInfo says
      // offline: no fetch, no error — screens with no cached data would sit
      // in a fake not-loading/not-error limbo and fall through to their
      // empty states ("No albums yet" on a plane). offlineFirst always
      // attempts the fetch: cached data renders instantly, and a dead
      // network becomes a visible, handleable error within seconds.
      networkMode: "offlineFirst",
      retry: shouldRetry,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      // Same reasoning as queries: a paused mutation is a button that
      // "did nothing"; failing fast lets error UI (or the blanket toast
      // above) tell the user what happened.
      networkMode: "offlineFirst",
      retry: false,
    },
  },
});
