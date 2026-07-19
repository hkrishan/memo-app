import { env } from "@/lib/env";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (was cacheTime)
      retry: (failureCount, error) => {
        // Don't retry on 401/403 (auth errors)
        if (
          error instanceof Error &&
          (error.message.includes("401") || error.message.includes("403"))
        ) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});

// Development-only query devtools logging
if (env?.isDevelopment) {
  queryClient.setDefaultOptions({
    queries: {
      ...queryClient.getDefaultOptions().queries,
      //@ts-ignore
      onError: (error) => {
        console.error("❌ Query Error:", error);
      },
    },
    mutations: {
      ...queryClient.getDefaultOptions().mutations,
      onError: (error) => {
        console.error("❌ Mutation Error:", error);
      },
    },
  });
}
