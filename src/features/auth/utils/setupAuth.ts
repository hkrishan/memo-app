import { httpClient, tokenStorage } from "@/lib/api";
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
}
