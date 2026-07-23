import { httpClient, endpoints } from "@/lib/api";
import {
  AuthResponse,
  EmailLoginRequest,
  EmailRegisterRequest,
  SmsVerifyRequest,
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
   * SMS OTP: send (or resend) a verification code.
   * skipAuth: these run unauthenticated, and a wrong-code 401 must surface
   * as-is instead of triggering the client's token-refresh interception.
   */
  smsRequestCode: async (phone: string) => {
    return httpClient.post<{ message: string }>(
      endpoints.auth.smsRequest,
      { phone },
      { skipAuth: true },
    );
  },

  /**
   * SMS OTP: verify the code — logs in or creates the account
   */
  smsVerify: async (data: SmsVerifyRequest) => {
    return httpClient.post<AuthResponse>(endpoints.auth.smsVerify, data, {
      skipAuth: true,
    });
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
