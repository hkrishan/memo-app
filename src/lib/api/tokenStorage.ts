import * as SecureStore from "expo-secure-store";
import { AuthTokens } from "./types";

const ACCESS_TOKEN_KEY = "memo_access_token";
const REFRESH_TOKEN_KEY = "memo_refresh_token";
const TOKEN_EXPIRY_KEY = "memo_token_expiry";

/**
 * Secure token storage utility
 * Uses expo-secure-store for encrypted storage on device
 */
class TokenStorage {
  private memoryCache: AuthTokens | null = null;

  /**
   * Store authentication tokens securely
   */
  async setTokens(tokens: AuthTokens): Promise<void> {
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);

      if (tokens.refreshToken) {
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
      }

      if (tokens.expiresAt) {
        await SecureStore.setItemAsync(
          TOKEN_EXPIRY_KEY,
          tokens.expiresAt.toString(),
        );
      }

      // Update memory cache
      this.memoryCache = tokens;
    } catch (error) {
      console.error("Failed to store tokens:", error);
      throw new Error("Failed to store authentication tokens");
    }
  }

  /**
   * Retrieve stored tokens
   * Uses memory cache for faster access
   */
  async getTokens(): Promise<AuthTokens | null> {
    // Return from cache if available
    if (this.memoryCache) {
      return this.memoryCache;
    }

    try {
      const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);

      if (!accessToken) {
        return null;
      }

      const refreshToken =
        (await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)) ?? undefined;
      const expiryStr = await SecureStore.getItemAsync(TOKEN_EXPIRY_KEY);
      const expiresAt = expiryStr ? parseInt(expiryStr, 10) : undefined;

      const tokens: AuthTokens = {
        accessToken,
        refreshToken,
        expiresAt,
      };

      // Update memory cache
      this.memoryCache = tokens;

      return tokens;
    } catch (error) {
      console.error("Failed to retrieve tokens:", error);
      return null;
    }
  }

  /**
   * Get just the access token (most common use case)
   */
  async getAccessToken(): Promise<string | null> {
    if (this.memoryCache?.accessToken) {
      return this.memoryCache.accessToken;
    }

    try {
      return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Clear all stored tokens (logout)
   */
  async clearTokens(): Promise<void> {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.deleteItemAsync(TOKEN_EXPIRY_KEY),
      ]);

      this.memoryCache = null;
    } catch (error) {
      console.error("Failed to clear tokens:", error);
      // Still clear memory cache even if secure store fails
      this.memoryCache = null;
    }
  }

  /**
   * Check if tokens are expired
   */
  async isTokenExpired(): Promise<boolean> {
    const tokens = await this.getTokens();

    if (!tokens?.expiresAt) {
      // If no expiry, assume not expired (server will reject if it is)
      return false;
    }

    // Add 30 second buffer to handle request time
    return Date.now() >= tokens.expiresAt - 30000;
  }

  /**
   * Check if user has stored tokens (is authenticated)
   */
  async hasTokens(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== null;
  }

  /**
   * Clear memory cache (useful for testing)
   */
  clearCache(): void {
    this.memoryCache = null;
  }
}

export const tokenStorage = new TokenStorage();
