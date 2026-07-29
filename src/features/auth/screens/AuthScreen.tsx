import { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Text, ActivityIndicator } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import { StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { tokenStorage } from "@/lib/api";
import { UnauthorizedError } from "@/lib/api/errors";
import userApi from "@/features/user/api/user.api";
import { useAuthStore } from "../store/authStore";
import useAuth, { sanitizeRedirect } from "../hooks/useAuth";
import LoginProviderButton from "../components/LoginProviderButton";

const TEST_USER_IDS = ["test-user", "test-user2"];

type AuthScreenProps = {
  /** Intended in-app destination to restore after login (from ?redirect=) */
  redirect?: string | string[];
};

export default function AuthScreen({ redirect }: AuthScreenProps) {
  const router = useRouter();
  const { testLogin, isLoading } = useAuth();
  // Where to land after auth: the guarded path the user was headed to
  // (e.g. an invite deeplink), or the app root
  const redirectTarget = sanitizeRedirect(redirect) ?? "/(app)";
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Animation values
  const bottomSheetTranslateY = useSharedValue(0);
  const screenOpacity = useSharedValue(1);
  const overlayOpacity = useSharedValue(1);

  // Check for an existing session on mount. Tokens (SecureStore) and the
  // persisted auth store MUST agree before navigating into (app) — its layout
  // guards on the store, so navigating on tokens alone causes a redirect loop.
  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        const hasTokens = await tokenStorage.hasTokens();
        const { isAuthenticated, user, setUser, reset } =
          useAuthStore.getState();

        if (!hasTokens) {
          // Authenticated flag without tokens is a stale session — heal it
          if (isAuthenticated) reset();
          return;
        }

        if (isAuthenticated && user) {
          router.replace(redirectTarget);
          return;
        }

        // Tokens exist but the store doesn't know the user (cleared state or
        // an older app version) — validate the session and heal the store.
        const me = await userApi.getMe();
        setUser({
          id: me.userId,
          name: me.name,
          email: me.email ?? null,
          avatarUrl: me.avatarUrl ?? null,
          provider: "test",
        });
        router.replace(redirectTarget);
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          // Dead session — drop the tokens and show the login screen
          await tokenStorage.clearTokens();
        } else {
          // Network/server issue: stay on login without destroying the session
          if (__DEV__) console.error("Auth check error:", error);
        }
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkExistingAuth();
  }, [router, redirectTarget]);

  const navigateToApp = () => {
    router.replace(redirectTarget);
  };

  const playSuccessAnimation = () => {
    setIsAnimatingOut(true);

    // Slide bottom sheet down
    bottomSheetTranslateY.value = withTiming(500, {
      duration: 400,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });

    // Fade overlay
    overlayOpacity.value = withDelay(200, withTiming(0, { duration: 300 }));

    // Fade entire screen
    screenOpacity.value = withDelay(400, withTiming(0, { duration: 300 }));

    // Navigate after animation completes
    setTimeout(() => {
      navigateToApp();
    }, 700);
  };

  // Phone (SMS OTP) login — the primary sign-in method, its own routed
  // flow (/phone → /phone/code → /phone/name) with stack transitions
  const handlePhoneLogin = () => {
    const target = sanitizeRedirect(redirect);
    router.push({
      pathname: "/phone",
      params: target ? { redirect: target } : {},
    });
  };

  // Test login picker (dev builds only): preset users or a custom user id,
  // validated against the user table by the backend. State hooks must run
  // unconditionally, but every handler and all UI below is gated on __DEV__.
  const [testPickerVisible, setTestPickerVisible] = useState(false);
  const [customUserId, setCustomUserId] = useState("");
  const [testError, setTestError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const handleOpenTestPicker = () => {
    if (!__DEV__) return;
    setTestError(null);
    setCustomUserId("");
    setPendingUserId(null);
    setTestPickerVisible(true);
  };

  const handleCloseTestPicker = () => {
    if (pendingUserId != null) return;
    setTestPickerVisible(false);
  };

  const handleTestLogin = async (userId: string) => {
    if (!__DEV__) return;
    const trimmed = userId.trim();
    if (!trimmed || pendingUserId != null) return;
    setTestError(null);
    setPendingUserId(trimmed);
    try {
      await testLogin(trimmed, { skipNavigation: true });
      setTestPickerVisible(false);
      // Play animation after successful login
      playSuccessAnimation();
    } catch (error) {
      if (__DEV__) console.log("Test login error:", error);
      setTestError(
        `Couldn't log in as "${trimmed}" — check that this user id exists.`,
      );
    } finally {
      setPendingUserId(null);
    }
  };

  // Animated styles
  const bottomSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bottomSheetTranslateY.value }],
  }));

  const screenAnimatedStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  if (isCheckingAuth) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, screenAnimatedStyle]}>
      <StatusBar barStyle="light-content" />
      <Video
        source={require("../../../../assets/memo-background-vid.mp4")}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted
      />
      <Animated.View style={[styles.overlay, overlayAnimatedStyle]} />
      <View style={styles.content}>
        <Text style={styles.title}>MEMO</Text>
        <Text style={styles.subTitle}>Shared memories, together.</Text>
      </View>
      <Animated.View style={[styles.bottomContainer, bottomSheetAnimatedStyle]}>
        <BlurView intensity={80} tint="light" style={styles.blurContent}>
          <Text style={styles.loginTitle}>Get Started</Text>
          <LoginProviderButton
            provider="phone"
            onPress={handlePhoneLogin}
            disabled={isLoading || isAnimatingOut}
          />
          {__DEV__ && (
            <LoginProviderButton
              provider="test"
              onPress={handleOpenTestPicker}
              disabled={isLoading || isAnimatingOut}
              loading={isLoading}
            />
          )}
        </BlurView>
      </Animated.View>

      {/* Test user picker (dev builds only) */}
      {__DEV__ && (
        <Modal
          visible={testPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={handleCloseTestPicker}
        >
          <KeyboardAvoidingView
            style={styles.testModalRoot}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={handleCloseTestPicker}
            />
            <View style={styles.testCard}>
              <Text style={styles.testTitle}>Log in as</Text>

              {TEST_USER_IDS.map((userId) => (
                <Pressable
                  key={userId}
                  style={styles.testUserRow}
                  onPress={() => handleTestLogin(userId)}
                  disabled={pendingUserId != null}
                >
                  <Ionicons
                    name="person-circle-outline"
                    size={22}
                    color="#fff"
                  />
                  <Text style={styles.testUserId}>{userId}</Text>
                  {pendingUserId === userId ? (
                    <ActivityIndicator size={16} color="#fff" />
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color="#888" />
                  )}
                </Pressable>
              ))}

              <Text style={styles.testDivider}>or a custom user id</Text>

              <TextInput
                style={styles.testInput}
                value={customUserId}
                onChangeText={(value) => {
                  setCustomUserId(value);
                  setTestError(null);
                }}
                placeholder="user id"
                placeholderTextColor="#777"
                autoCapitalize="none"
                autoCorrect={false}
                editable={pendingUserId == null}
                onSubmitEditing={() => handleTestLogin(customUserId)}
                returnKeyType="go"
              />
              <Pressable
                style={[
                  styles.testLoginButton,
                  (!customUserId.trim() || pendingUserId != null) &&
                    styles.testLoginButtonDisabled,
                ]}
                onPress={() => handleTestLogin(customUserId)}
                disabled={!customUserId.trim() || pendingUserId != null}
              >
                {pendingUserId != null &&
                pendingUserId === customUserId.trim() ? (
                  <ActivityIndicator size={16} color="#000" />
                ) : (
                  <Text style={styles.testLoginButtonText}>Log in</Text>
                )}
              </Pressable>

              {testError && <Text style={styles.testError}>{testError}</Text>}
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  loadingContainer: {
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    fontSize: 36,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
  },
  subTitle: {
    fontSize: 18,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
    marginTop: 0,
  },
  bottomContainer: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
  },
  blurContent: {
    padding: 20,
    paddingBottom: 50,
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  loginTitle: {
    fontSize: 18,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 5,
  },
  testModalRoot: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  testCard: {
    backgroundColor: "#1c1c1e",
    borderRadius: 18,
    padding: 20,
  },
  testTitle: {
    fontSize: 17,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  testUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#3a3a3c",
  },
  testUserId: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
  },
  testDivider: {
    fontSize: 13,
    color: "#888",
    marginTop: 16,
    marginBottom: 8,
  },
  testInput: {
    backgroundColor: "#2c2c2e",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#fff",
  },
  testLoginButton: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  testLoginButtonDisabled: {
    opacity: 0.4,
  },
  testLoginButtonText: {
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  testError: {
    marginTop: 12,
    fontSize: 13,
    color: "#ff6b6b",
  },
});
