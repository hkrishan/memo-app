import { MD3LightTheme } from "react-native-paper";

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#000000",
    onPrimary: "#ffffff",
    primaryContainer: "#e0e0e0",
    onPrimaryContainer: "#000000",
    secondary: "#333333",
    onSecondary: "#ffffff",
    secondaryContainer: "#f0f0f0",
    onSecondaryContainer: "#000000",
    background: "#ffffff",
    onBackground: "#000000",
    surface: "#ffffff",
    onSurface: "#000000",
    surfaceVariant: "#f5f5f5",
    onSurfaceVariant: "#333333",
    outline: "#cccccc",
    outlineVariant: "#e0e0e0",
    error: "#ff3b30",
    onError: "#ffffff",
  },
};

export type AppTheme = typeof theme;
