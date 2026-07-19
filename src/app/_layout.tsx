import { useEffect, useCallback } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { PaperProvider } from "react-native-paper";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { QueryProvider } from "@/lib/queryProvider";
import { theme } from "@/lib/theme";
import { NotificationProvider, NotificationManager } from "@/components/global";
import { setupAuth } from "@/features/auth";
import { perf } from "@/lib/performance";

// Keep the splash screen visible while we load fonts
SplashScreen.preventAutoHideAsync();
function RootContent() {
  // Mark Time To Interactive when root content mounts
  useEffect(() => {
    perf.markTTI();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          animationDuration: 300,
        }}
      />
      <NotificationManager />
    </>
  );
}

export default function Layout() {
  const [fontsLoaded] = useFonts({
    BowlbyOneSC: require("../../assets/fonts/BowlbyOneSC-Regular.ttf"),
  });

  useEffect(() => {
    setupAuth();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.container} onLayout={onLayoutRootView}>
      <PaperProvider theme={theme}>
        <SafeAreaProvider>
          <NotificationProvider>
            <QueryProvider>
              <RootContent />
            </QueryProvider>
          </NotificationProvider>
        </SafeAreaProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
});
