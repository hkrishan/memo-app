import { useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { tokenStorage } from "@/lib/api";
import { queryClient } from "@/lib/api/queryClient";
import { notify } from "@/components/global";
import { unregisterPushToken } from "@/features/notifications/push";
import userApi from "@/features/user/api/user.api";
import { useAuthStore } from "../store/authStore";
import authApi from "../api/auth.api";
import {
  useGoogleAuth,
  useFacebookAuth,
  signInWithApple,
  isAppleSignInAvailable,
} from "../utils/oauth";
import { AuthResponse } from "../types/auth.types";

/**
 * Sanitize a post-login redirect target (set by the (app) guard when an
 * unauthenticated user hits a guarded route, e.g. an invite deeplink).
 * Only in-app absolute paths are accepted — anything else (external URLs,
 * scheme-relative "//host", missing values) falls back to null so callers
 * navigate to the app root instead.
 */
export const sanitizeRedirect = (
  value: string | string[] | undefined,
): string | null => {
  const redirect = Array.isArray(value) ? value[0] : value;
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) {
    return null;
  }
  return redirect;
};

const useAuth = () => {
  const router = useRouter();
  // Present when this hook is mounted under /login?redirect=… — the intended
  // destination to restore after a successful login.
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const redirectTarget = sanitizeRedirect(redirect);
  const { user, isAuthenticated, isLoading, setUser, setLoading, reset } =
    useAuthStore();

  const googleAuth = useGoogleAuth();
  const facebookAuth = useFacebookAuth();

  /**
   * Handle successful authentication response
   */
  const handleAuthSuccess = useCallback(
    async (response: AuthResponse, options?: { skipNavigation?: boolean }) => {
      // Store tokens securely
      await tokenStorage.setTokens({
        accessToken: response.tokens.accessToken,
        refreshToken: response.tokens.refreshToken,
        expiresAt: response.tokens.expiresAt,
      });

      // Update auth state
      setUser(response.user);

      // Navigate to app (unless skipped for custom animation), honoring a
      // pending redirect target (e.g. an invite deeplink) when present
      if (!options?.skipNavigation) {
        router.replace(redirectTarget ?? "/(app)");
      }
    },
    [setUser, router, redirectTarget],
  );

  /**
   * Login with Google
   */
  const loginWithGoogle = useCallback(async () => {
    try {
      setLoading(true);

      const result = await googleAuth.signIn();
      if (!result) {
        return; // User cancelled
      }

      const response = await authApi.googleLogin(result.idToken);
      await handleAuthSuccess(response);

      notify.success("Welcome!", "Successfully signed in with Google");
    } catch (error: any) {
      if (__DEV__) console.error("Google login error:", error);
      notify.error(
        "Login Failed",
        error.message || "Failed to sign in with Google",
      );
      throw error;
    } finally {
      setLoading(false);
    }
  }, [googleAuth, handleAuthSuccess, setLoading]);

  /**
   * Login with Apple
   */
  const loginWithApple = useCallback(async () => {
    try {
      setLoading(true);

      const result = await signInWithApple();
      if (!result) {
        return; // User cancelled
      }

      const response = await authApi.appleLogin({
        identityToken: result.identityToken,
        authorizationCode: result.authorizationCode,
        user: result.user,
      });
      await handleAuthSuccess(response);

      notify.success("Welcome!", "Successfully signed in with Apple");
    } catch (error: any) {
      if (__DEV__) console.error("Apple login error:", error);
      notify.error(
        "Login Failed",
        error.message || "Failed to sign in with Apple",
      );
      throw error;
    } finally {
      setLoading(false);
    }
  }, [handleAuthSuccess, setLoading]);

  /**
   * Login with Facebook
   */
  const loginWithFacebook = useCallback(async () => {
    try {
      setLoading(true);

      const result = await facebookAuth.signIn();
      if (!result) {
        return; // User cancelled
      }

      const response = await authApi.facebookLogin(result.accessToken);
      await handleAuthSuccess(response);

      notify.success("Welcome!", "Successfully signed in with Facebook");
    } catch (error: any) {
      if (__DEV__) console.error("Facebook login error:", error);
      notify.error(
        "Login Failed",
        error.message || "Failed to sign in with Facebook",
      );
      throw error;
    } finally {
      setLoading(false);
    }
  }, [facebookAuth, handleAuthSuccess, setLoading]);

  /**
   * Login with email and password
   */
  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      try {
        setLoading(true);

        const response = await authApi.emailLogin({ email, password });
        await handleAuthSuccess(response);

        notify.success("Welcome back!");
      } catch (error: any) {
        if (__DEV__) console.error("Email login error:", error);
        notify.error(
          "Login Failed",
          error.message || "Invalid email or password",
        );
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [handleAuthSuccess, setLoading],
  );

  /**
   * Register with email and password
   */
  const registerWithEmail = useCallback(
    async (email: string, password: string, name?: string) => {
      try {
        setLoading(true);

        const response = await authApi.emailRegister({ email, password, name });
        await handleAuthSuccess(response);

        notify.success("Account Created", "Welcome to Memo!");
      } catch (error: any) {
        if (__DEV__) console.error("Email register error:", error);
        notify.error(
          "Registration Failed",
          error.message || "Failed to create account",
        );
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [handleAuthSuccess, setLoading],
  );

  /**
   * SMS OTP step 1: send a code to the phone number. Errors are thrown
   * (not toasted) — the phone sheet shows them inline next to the input.
   */
  const requestSmsCode = useCallback(async (phone: string) => {
    await authApi.smsRequestCode(phone);
  }, []);

  /**
   * SMS OTP step 2: verify the code. On success the session is stored and
   * the response returned so the caller can branch on isNewUser (name
   * step) and drive its own success animation via skipNavigation.
   */
  const loginWithPhone = useCallback(
    async (
      phone: string,
      code: string,
      options?: { skipNavigation?: boolean },
    ): Promise<AuthResponse> => {
      const response = await authApi.smsVerify({ phone, code });
      await handleAuthSuccess(response, options);
      return response;
    },
    [handleAuthSuccess],
  );

  /**
   * Test login (development only)
   */
  const testLogin = useCallback(
    async (userId: string = "test-user", options?: { skipNavigation?: boolean }) => {
      try {
        setLoading(true);

        const response = await authApi.testLogin(userId);
        await handleAuthSuccess(response, options);
      } catch (error: any) {
        if (__DEV__) console.error("Test login error:", error);
        notify.error("Login Failed", error.message || "Test login failed");
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [handleAuthSuccess, setLoading],
  );

  /**
   * Logout
   */
  const logout = useCallback(async () => {
    try {
      setLoading(true);

      // Remove this device's push token (best effort) — must run BEFORE
      // tokens are cleared since it needs the authenticated http client.
      await unregisterPushToken();

      // Call logout endpoint (best effort)
      try {
        await authApi.logout();
      } catch {
        // Ignore logout API errors
      }

      // Clear tokens
      await tokenStorage.clearTokens();

      // Reset auth state
      reset();

      // Drop all cached data so the next account can't see this one's
      queryClient.clear();

      // Navigate to auth screen
      router.replace("/login");
    } catch (error) {
      if (__DEV__) console.error("Logout error:", error);
    } finally {
      setLoading(false);
    }
  }, [router, reset, setLoading]);

  /**
   * Permanently delete the account, then tear the session down locally.
   * The server delete must succeed before anything local is touched —
   * on failure the session stays intact and the error is rethrown for
   * the caller's UI. (No push-token unregister or logout call needed:
   * the server cascade already removed tokens and devices.)
   */
  const deleteAccount = useCallback(async () => {
    try {
      setLoading(true);
      await userApi.deleteAccount();

      await tokenStorage.clearTokens();
      reset();
      queryClient.clear();
      router.replace("/login");
    } catch (error: any) {
      if (__DEV__) console.error("Delete account error:", error);
      notify.error(
        "Couldn't Delete Account",
        error.message || "Please try again.",
      );
      throw error;
    } finally {
      setLoading(false);
    }
  }, [router, reset, setLoading]);

  /**
   * Check if user is authenticated on app start
   */
  const checkAuth = useCallback(async () => {
    try {
      const hasTokens = await tokenStorage.hasTokens();
      if (!hasTokens) {
        reset();
        return false;
      }

      // Optionally validate token with server here
      return true;
    } catch {
      reset();
      return false;
    }
  }, [reset]);

  return {
    // State
    user,
    isAuthenticated,
    isLoading,

    // OAuth readiness
    isGoogleReady: googleAuth.isReady,
    isFacebookReady: facebookAuth.isReady,
    isAppleAvailable: isAppleSignInAvailable,

    // Auth methods
    loginWithGoogle,
    loginWithApple,
    loginWithFacebook,
    loginWithEmail,
    registerWithEmail,
    requestSmsCode,
    loginWithPhone,
    testLogin,
    logout,
    deleteAccount,
    checkAuth,
  };
};

export default useAuth;
