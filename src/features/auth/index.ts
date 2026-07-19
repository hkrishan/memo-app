// Hooks
export { default as useAuth } from "./hooks/useAuth";

// Store
export { useAuthStore, selectUser, selectIsAuthenticated } from "./store/authStore";

// API
export { default as authApi } from "./api/auth.api";
export * from "./api/auth.queries";

// Types
export type {
  AuthProvider,
  AuthTokens,
  AuthUser,
  AuthResponse,
  AuthState,
  OAuthUserInfo,
  EmailLoginRequest,
  EmailRegisterRequest,
} from "./types/auth.types";

// OAuth utilities
export {
  useGoogleAuth,
  useFacebookAuth,
  signInWithApple,
  isAppleSignInAvailable,
} from "./utils/oauth";

// Setup
export { setupAuth } from "./utils/setupAuth";
