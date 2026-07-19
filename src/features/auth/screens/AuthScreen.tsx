import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text, ActivityIndicator } from "react-native-paper";
import { Video, ResizeMode } from "expo-av";
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
import useAuth from "../hooks/useAuth";
import LoginProviderButton from "../components/LoginProviderButton";

export default function AuthScreen() {
  const router = useRouter();
  const { testLogin, isLoading } = useAuth();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Animation values
  const bottomSheetTranslateY = useSharedValue(0);
  const screenOpacity = useSharedValue(1);
  const overlayOpacity = useSharedValue(1);

  // Check for existing tokens on mount
  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        const hasTokens = await tokenStorage.hasTokens();
        if (hasTokens) {
          router.replace("/(app)");
        }
      } catch (error) {
        console.error("Auth check error:", error);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkExistingAuth();
  }, [router]);

  const navigateToApp = () => {
    router.replace("/(app)");
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

  const handleGoogleLogin = () => {
    console.log("Google login pressed");
  };

  const handleAppleLogin = () => {
    console.log("Apple login pressed");
  };

  const handleFacebookLogin = () => {
    console.log("Facebook login pressed");
  };

  const handleEmailLogin = () => {
    console.log("Email login pressed");
  };

  const handleTestLogin = async () => {
    try {
      await testLogin("test-user", { skipNavigation: true });
      // Play animation after successful login
      playSuccessAnimation();
    } catch (error) {
      console.log("Test login error:", error);
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
            provider="apple"
            onPress={handleAppleLogin}
            disabled={isLoading || isAnimatingOut}
          />
          <LoginProviderButton
            provider="google"
            onPress={handleGoogleLogin}
            disabled={isLoading || isAnimatingOut}
          />
          <LoginProviderButton
            provider="facebook"
            onPress={handleFacebookLogin}
            disabled={isLoading || isAnimatingOut}
          />
          <LoginProviderButton
            provider="email"
            onPress={handleEmailLogin}
            disabled={isLoading || isAnimatingOut}
          />
          <LoginProviderButton
            provider="test"
            onPress={handleTestLogin}
            disabled={isLoading || isAnimatingOut}
            loading={isLoading}
          />
        </BlurView>
      </Animated.View>
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
    fontWeight: "800",
    color: "#fff",
  },
  subTitle: {
    fontSize: 18,
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
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 5,
  },
});
