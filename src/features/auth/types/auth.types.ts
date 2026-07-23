/**
 * Supported authentication providers
 */
export type AuthProvider =
  | "google"
  | "apple"
  | "facebook"
  | "email"
  | "phone"
  | "test";

/**
 * Authentication tokens returned from the server
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * User info returned from OAuth providers
 */
export interface OAuthUserInfo {
  id: string;
  email?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  picture?: string | null;
  provider: AuthProvider;
}

/**
 * Request payload for OAuth login
 */
export interface OAuthLoginRequest {
  provider: AuthProvider;
  idToken?: string;
  accessToken?: string;
  authorizationCode?: string;
  user?: OAuthUserInfo;
}

/**
 * Response from auth endpoints
 */
export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
  /** Phone verification only: the account was created by this call. */
  isNewUser?: boolean;
}

/**
 * Authenticated user
 */
export interface AuthUser {
  id: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  provider: AuthProvider;
  createdAt?: string;
}

/**
 * Auth state for the store
 */
export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
}

/**
 * Auth store actions
 */
export interface AuthActions {
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  reset: () => void;
}

/**
 * Email login request
 */
export interface EmailLoginRequest {
  email: string;
  password: string;
}

/**
 * Email register request
 */
export interface EmailRegisterRequest {
  email: string;
  password: string;
  name?: string;
}

/**
 * SMS OTP: verify request
 */
export interface SmsVerifyRequest {
  phone: string;
  code: string;
}

/**
 * Token refresh request
 */
export interface RefreshTokenRequest {
  refreshToken: string;
}
