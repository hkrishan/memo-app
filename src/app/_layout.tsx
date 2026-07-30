// Initialize Sentry as early as possible (no-op without a DSN)
import { Sentry, isSentryEnabled } from "@/lib/sentry";
import { useEffect, useCallback } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { PaperProvider } from "react-native-paper";
import { useFonts } from "expo-font";
import { InstrumentSans_400Regular } from "@expo-google-fonts/instrument-sans/400Regular";
import { InstrumentSans_500Medium } from "@expo-google-fonts/instrument-sans/500Medium";
import { InstrumentSans_600SemiBold } from "@expo-google-fonts/instrument-sans/600SemiBold";
import { InstrumentSans_700Bold } from "@expo-google-fonts/instrument-sans/700Bold";
import { InstrumentSerif_400Regular_Italic } from "@expo-google-fonts/instrument-serif/400Regular_Italic";
import * as SplashScreen from "expo-splash-screen";
import { QueryProvider } from "@/lib/queryProvider";
import { theme } from "@/lib/theme";
import {
  AppErrorBoundary,
  NotificationProvider,
  NotificationManager,
  UploadIndicatorHost,
  UploadProgressHost,
} from "@/components/global";
import { setupAuth } from "@/features/auth";
import {
  selectIsAuthenticated,
  useAuthStore,
} from "@/features/auth/store/authStore";
import {
  registerPushToken,
  usePushNotificationRouting,
} from "@/features/notifications/push";
import {
  selectHasCompletedOnboarding,
  useOnboardingStore,
} from "@/features/onboarding/store/onboardingStore";
import { perf } from "@/lib/performance";
// PERF-PROBE (temporary)
import { PerfProbeRoot } from "@/dev/PerfProbeRoot";

// Keep the splash screen visible while we load fonts
SplashScreen.preventAutoHideAsync();
// Identity-stable options for the onboarding route (matches the (app)
// layout convention). Black content so the root fade never flashes white,
// no back-swipe out of the flow.
const ONBOARDING_OPTIONS = {
  gestureEnabled: false,
  contentStyle: { backgroundColor: "#000" },
} as const;

function RootContent() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasCompletedOnboarding = useOnboardingStore(
    selectHasCompletedOnboarding,
  );

  // Route notification taps (foreground/background/cold-start) via data.url
  usePushNotificationRouting();

  // Mark Time To Interactive when root content mounts
  useEffect(() => {
    perf.markTTI();
  }, []);

  // Register the device push token whenever the user becomes authenticated:
  // fires on app start with a restored session (store rehydration) and after
  // any successful login (setUser flips isAuthenticated). Never throws.
  // ALSO gated on onboarding: until the intro flow completes, its priming
  // screen owns the first notification prompt — registering here would fire
  // the OS dialog the instant login succeeds, with zero context. Completing
  // onboarding flips the flag and this effect re-runs, covering users who
  // granted via the priming screen and later sessions alike.
  useEffect(() => {
    if (isAuthenticated && hasCompletedOnboarding) {
      void registerPushToken();
    }
  }, [isAuthenticated, hasCompletedOnboarding]);

  return (
    <>
      {/* Dark glyphs by default — most surfaces are light. Dark surfaces
          (camera via SwipeableTabs, viewer, auth, paywall, drop capture)
          set light-content themselves and restore on unmount. The old
          global style="light" left white glyphs on the white Albums/Feed
          tabs. */}
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          animationDuration: 300,
        }}
      >
        <Stack.Screen
          name="onboarding"
          options={ONBOARDING_OPTIONS}
        />
      </Stack>
      <NotificationManager />
      <UploadIndicatorHost />
      <UploadProgressHost />
      {/* PERF-PROBE (temporary) */}
      <PerfProbeRoot />
    </>
  );
}

function Layout() {
  // Loaded in the background — these are DECORATIVE faces (two wordmarks).
  // Gating the whole tree (and holding the splash) on them serialized
  // font IO in front of first paint; they swap in when ready.
  useFonts({
    // The UI face (all four weights) plus the wordmark/serif accent
    // ("Memo Create", "Memo Premium", invite card). System font shows
    // until these swap in — same background-load rationale as before.
    // BowlbyOneSC is retired; Pacifico lives only in the create-studio
    // font registry as a content font.
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    InstrumentSerif_400Regular_Italic,
  });

  useEffect(() => {
    setupAuth();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={styles.container} onLayout={onLayoutRootView}>
      <PaperProvider theme={theme}>
        <SafeAreaProvider>
          <NotificationProvider>
            <QueryProvider>
              <AppErrorBoundary>
                <RootContent />
              </AppErrorBoundary>
            </QueryProvider>
          </NotificationProvider>
        </SafeAreaProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap adds touch-event breadcrumbs and the root profiler; only
// applied when Sentry is configured (it is also a safe no-op without init).
export default isSentryEnabled ? Sentry.wrap(Layout) : Layout;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
});
