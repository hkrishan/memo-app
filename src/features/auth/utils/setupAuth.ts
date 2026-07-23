import { router } from "expo-router";
import { httpClient, tokenStorage } from "@/lib/api";
import { queryClient } from "@/lib/api/queryClient";
import { useAuthStore } from "../store/authStore";
import authApi from "../api/auth.api";

/**
 * Set up authentication for the HTTP client
 * This should be called once when the app initializes
 */
export function setupAuth() {
  // Set up automatic token refresh
  httpClient.setTokenRefreshFn(async () => {
    try {
      const tokens = await tokenStorage.getTokens();
      if (!tokens?.refreshToken) {
        return null;
      }

      const newTokens = await authApi.refreshToken(tokens.refreshToken);

      return {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresAt: newTokens.expiresAt,
      };
    } catch (error) {
      console.error("Token refresh failed:", error);
      return null;
    }
  });

  // When the refresh token itself is dead, log the user out instead of
  // leaving them stuck on authenticated screens with endless 401s.
  httpClient.setOnSessionExpired(() => {
    useAuthStore.getState().reset();
    queryClient.clear();
    router.replace("/login");
  });
}
