import { httpClient, endpoints } from "@/lib/api";
import {
  AuthResponse,
  EmailLoginRequest,
  EmailRegisterRequest,
  AuthTokens,
} from "../types/auth.types";

const authApi = {
  /**
   * Google OAuth login
   */
  googleLogin: async (idToken: string) => {
    return httpClient.post<AuthResponse>(endpoints.auth.google, {
      idToken,
    });
  },

  /**
   * Apple OAuth login
   */
  appleLogin: async (data: {
    identityToken: string;
    authorizationCode: string;
    user?: { email?: string; name?: { firstName?: string; lastName?: string } };
  }) => {
    return httpClient.post<AuthResponse>(endpoints.auth.apple, data);
  },

  /**
   * Facebook OAuth login
   */
  facebookLogin: async (accessToken: string) => {
    return httpClient.post<AuthResponse>(endpoints.auth.facebook, {
      accessToken,
    });
  },

  /**
   * Email/password login
   */
  emailLogin: async (data: EmailLoginRequest) => {
    return httpClient.post<AuthResponse>(endpoints.auth.login, data);
  },

  /**
   * Email/password registration
   */
  emailRegister: async (data: EmailRegisterRequest) => {
    return httpClient.post<AuthResponse>(endpoints.auth.register, data);
  },

  /**
   * Refresh access token
   */
  refreshToken: async (refreshToken: string) => {
    return httpClient.post<AuthTokens>(
      endpoints.auth.refresh,
      { refreshToken },
      { skipAuth: true },
    );
  },

  /**
   * Logout - invalidate tokens on server
   */
  logout: async () => {
    return httpClient.post(endpoints.auth.logout, {});
  },

  /**
   * Test login (development only)
   */
  testLogin: async (userId: string) => {
    return httpClient.post<AuthResponse>(endpoints.auth.testLogin, {
      userId,
    });
  },
};

export default authApi;
