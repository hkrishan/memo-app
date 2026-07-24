import * as Google from "expo-auth-session/providers/google";
import * as Facebook from "expo-auth-session/providers/facebook";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

// Complete auth session for web browser
WebBrowser.maybeCompleteAuthSession();

/**
 * OAuth configuration
 * These should be set in your app.config.js or environment
 */
export const oauthConfig = {
  google: {
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  },
  facebook: {
    clientId: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID,
  },
};

/**
 * Check if Google OAuth is configured
 */
const isGoogleConfigured = () => {
  if (Platform.OS === "ios") return !!oauthConfig.google.iosClientId;
  if (Platform.OS === "android") return !!oauthConfig.google.androidClientId;
  return !!oauthConfig.google.webClientId;
};

/**
 * Check if Facebook OAuth is configured
 */
const isFacebookConfigured = () => !!oauthConfig.facebook.clientId;

/**
 * Google OAuth result
 */
export interface GoogleAuthResult {
  idToken: string;
  accessToken?: string;
}

/**
 * Apple OAuth result
 */
export interface AppleAuthResult {
  identityToken: string;
  authorizationCode: string;
  user?: {
    email?: string;
    name?: {
      firstName?: string;
      lastName?: string;
    };
  };
}

/**
 * Facebook OAuth result
 */
export interface FacebookAuthResult {
  accessToken: string;
}

/**
 * Hook for Google authentication
 * Returns a no-op if Google is not configured
 */
export function useGoogleAuth() {
  const configured = isGoogleConfigured();

  // Only call the hook if configured - use placeholder values otherwise
  // The hook will be called but won't be functional without valid IDs
  const [request, response, promptAsync] = Google.useAuthRequest(
    configured
      ? {
          iosClientId: oauthConfig.google.iosClientId,
          androidClientId: oauthConfig.google.androidClientId,
          webClientId: oauthConfig.google.webClientId,
        }
      : {
          // Placeholder to satisfy hook requirements
          clientId: "not-configured",
        }
  );

  const signIn = async (): Promise<GoogleAuthResult | null> => {
    if (!configured) {
      throw new Error("Google Sign In is not configured");
    }

    try {
      const result = await promptAsync();

      if (result.type === "success" && result.authentication) {
        return {
          idToken: result.authentication.idToken!,
          accessToken: result.authentication.accessToken,
        };
      }

      return null;
    } catch (error) {
      if (__DEV__) console.error("Google sign in error:", error);
      throw error;
    }
  };

  return {
    signIn,
    isReady: configured && !!request,
  };
}

/**
 * Hook for Facebook authentication
 * Returns a no-op if Facebook is not configured
 */
export function useFacebookAuth() {
  const configured = isFacebookConfigured();

  const [request, response, promptAsync] = Facebook.useAuthRequest(
    configured
      ? {
          clientId: oauthConfig.facebook.clientId!,
        }
      : {
          clientId: "not-configured",
        }
  );

  const signIn = async (): Promise<FacebookAuthResult | null> => {
    if (!configured) {
      throw new Error("Facebook Sign In is not configured");
    }

    try {
      const result = await promptAsync();

      if (result.type === "success" && result.authentication) {
        return {
          accessToken: result.authentication.accessToken,
        };
      }

      return null;
    } catch (error) {
      if (__DEV__) console.error("Facebook sign in error:", error);
      throw error;
    }
  };

  return {
    signIn,
    isReady: configured && !!request,
  };
}

/**
 * Apple authentication (iOS only)
 */
export async function signInWithApple(): Promise<AppleAuthResult | null> {
  if (Platform.OS !== "ios") {
    throw new Error("Apple Sign In is only available on iOS");
  }

  try {
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      throw new Error("Apple Sign In is not available on this device");
    }

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken || !credential.authorizationCode) {
      throw new Error("Apple Sign In failed - missing tokens");
    }

    return {
      identityToken: credential.identityToken,
      authorizationCode: credential.authorizationCode,
      user: {
        email: credential.email ?? undefined,
        name: credential.fullName
          ? {
              firstName: credential.fullName.givenName ?? undefined,
              lastName: credential.fullName.familyName ?? undefined,
            }
          : undefined,
      },
    };
  } catch (error: any) {
    if (error.code === "ERR_REQUEST_CANCELED") {
      // User cancelled
      return null;
    }
    if (__DEV__) console.error("Apple sign in error:", error);
    throw error;
  }
}

/**
 * Check if Apple Sign In is available
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") {
    return false;
  }
  return AppleAuthentication.isAvailableAsync();
}
