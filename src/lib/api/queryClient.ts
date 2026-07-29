import NetInfo from "@react-native-community/netinfo";
import { env } from "@/lib/env";
import { QueryClient, QueryCache, onlineManager } from "@tanstack/react-query";
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
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: DEFAULT_GC_TIME_MS,
      retry: (failureCount, error) => {
        // Don't retry on auth/client errors — only transient server failures
        if (error instanceof ApiError && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
      onError: (error) => {
        if (env?.isDevelopment) {
          console.error("❌ Mutation Error:", error);
        }
      },
    },
  },
});
