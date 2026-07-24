require("dotenv").config({ path: ".env.local" });
const fs = require("fs");

// Android push (FCM) config file — downloaded from the Firebase console.
// Referenced only when present so prebuild/EAS keeps working before it's
// been added (pushes just won't deliver on Android until it is).
const googleServicesFile = fs.existsSync("./google-services.json")
  ? "./google-services.json"
  : undefined;

// EAS project id — single source of truth for extra.eas.projectId and the
// expo-updates URL.
const EAS_PROJECT_ID = "9ab00b42-7d98-43e2-92ea-cb5ef9e67646";

module.exports = {
  expo: {
    name: "Memo",
    slug: "memo-app",
    scheme: "memo",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/memoicon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    // OTA updates (expo-updates): runtime version follows the app version so
    // every store release gets its own update branch compatibility.
    runtimeVersion: { policy: "appVersion" },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      fallbackToCacheTimeout: 0,
    },
    plugins: [
      [
        "expo-build-properties",
        {
          ios: {
            useFrameworks: "static",
            deploymentTarget: "16.0",
          },
        },
      ],
      ["expo-router", {}],
      [
        "react-native-vision-camera",
        {
          cameraPermissionText: "$(PRODUCT_NAME) needs access to your camera",
          enableMicrophonePermission: true,
          microphonePermissionText:
            "$(PRODUCT_NAME) needs access to your microphone",
        },
      ],
      ["expo-video"],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Allow $(PRODUCT_NAME) to save where your photos were taken",
        },
      ],
      [
        "expo-media-library",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos",
          savePhotosPermission: "Allow $(PRODUCT_NAME) to save photos",
          // Android 10+ redacts GPS EXIF from media without this permission
          isAccessMediaLocationEnabled: true,
        },
      ],
      // Compiles targets/daily-drop into a widget-extension target (the
      // daily-drop Live Activity). Signing is handled by EAS.
      "@bacons/apple-targets",
      [
        "expo-notifications",
        {
          // Matches the "default" channel registerPushToken() creates.
          // TODO: add a monochrome (white-on-transparent) 96×96 status-bar
          // icon and reference it here — without one, Android falls back
          // to a plain silhouette of the app icon.
          color: "#000000",
          defaultChannel: "default",
          // Bundled into the native build; iOS pushes reference it by
          // filename, Android via the "daily-drop" channel
          sounds: ["./assets/sounds/daily-drop.wav"],
        },
      ],
      // Sentry native setup + source-map upload during EAS builds.
      // org/project are intentionally not hardcoded: sentry-cli falls back to
      // the SENTRY_ORG / SENTRY_PROJECT (and SENTRY_AUTH_TOKEN) environment
      // variables at build time (the plugin only warns when they're absent).
      "@sentry/react-native/expo",
    ],
    splash: {
      image: "./assets/splashmemo.png",
      resizeMode: "contain",
      backgroundColor: "#000000",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.hugokrishan.memo-app",
      infoPlist: {
        // Required for the daily-drop Live Activity (ActivityKit)
        NSSupportsLiveActivities: true,
      },
    },
    android: {
      // Android application id (dashes are not valid here, unlike the iOS
      // bundle id) — must match the Android app registered in Firebase
      package: "com.hugokrishan.memoapp",
      ...(googleServicesFile ? { googleServicesFile } : {}),
      adaptiveIcon: {
        foregroundImage: "./assets/memoicon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: "./assets/memoicon.png",
    },
    extra: {
      apiUrl: process.env.API_URL,
      socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || process.env.SOCKET_URL,
      appEnv: process.env.APP_ENV || "development",
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
  },
};
