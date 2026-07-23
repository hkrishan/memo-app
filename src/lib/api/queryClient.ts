import { env } from "@/lib/env";
import { QueryClient, QueryCache } from "@tanstack/react-query";
import { ApiError } from "./errors";

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
      gcTime: 10 * 60 * 1000, // 10 minutes (was cacheTime)
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
