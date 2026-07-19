import { useCallback } from "react";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { tokenStorage } from "@/lib/api";
import { notify } from "@/components/global";
import { useAuthStore } from "../store/authStore";
import authApi from "../api/auth.api";
import {
  useGoogleAuth,
  useFacebookAuth,
  signInWithApple,
  isAppleSignInAvailable,
} from "../utils/oauth";
import { AuthResponse } from "../types/auth.types";

const useAuth = () => {
  const navigation = useNavigation();
  const router = useRouter();
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

      // Navigate to app (unless skipped for custom animation)
      if (!options?.skipNavigation) {
        router.replace("/(app)");
      }
    },
    [setUser, router],
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
      console.error("Google login error:", error);
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
      console.error("Apple login error:", error);
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
      console.error("Facebook login error:", error);
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
        console.error("Email login error:", error);
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
        console.error("Email register error:", error);
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
   * Test login (development only)
   */
  const testLogin = useCallback(
    async (userId: string = "test-user", options?: { skipNavigation?: boolean }) => {
      try {
        setLoading(true);

        const response = await authApi.testLogin(userId);
        await handleAuthSuccess(response, options);
      } catch (error: any) {
        console.error("Test login error:", error);
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

      // Navigate to auth screen
      const root = navigation.getParent();
      if (root) {
        root.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: "index" }],
          }),
        );
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setLoading(false);
    }
  }, [navigation, reset, setLoading]);

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
    testLogin,
    logout,
    checkAuth,
  };
};

export default useAuth;
