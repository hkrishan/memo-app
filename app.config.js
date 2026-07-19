require("dotenv").config({ path: ".env.local" });

module.exports = {
  expo: {
    name: "Memo",
    slug: "memo-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/memoicon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
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
    ],
    splash: {
      image: "./assets/splashmemo.png",
      resizeMode: "contain",
      backgroundColor: "#000000",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.hugokrishan.memo-app",
    },
    android: {
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
      appEnv: process.env.APP_ENV || "development",
    },
  },
};
