import { router } from "expo-router";
import { httpClient, tokenStorage } from "@/lib/api";
import { isApiError } from "@/lib/api/errors";
import { queryClient } from "@/lib/api/queryClient";
import { useAuthStore } from "../store/authStore";
import authApi from "../api/auth.api";

/**
 * Set up authentication for the HTTP client
 * This should be called once when the app initializes
 */
export function setupAuth() {
  // Set up automatic token refresh.
  //
  // The return contract matters: `null` means "the session is DEAD" and
  // makes the client clear tokens and log the user out. Only an explicit
  // auth rejection of the refresh token may say that. A refresh that fails
  // in transit — offline, timeout, server 5xx — proves nothing about the
  // session, so it rethrows: the client keeps the tokens and the original
  // request simply fails; the next request refreshes again.
  httpClient.setTokenRefreshFn(async () => {
    const tokens = await tokenStorage.getTokens();
    if (!tokens?.refreshToken) {
      return null;
    }

    try {
      const newTokens = await authApi.refreshToken(tokens.refreshToken);

      return {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresAt: newTokens.expiresAt,
      };
    } catch (error) {
      if (__DEV__) console.error("Token refresh failed:", error);
      if (isApiError(error) && (error.status === 401 || error.status === 403)) {
        return null;
      }
      throw error;
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
