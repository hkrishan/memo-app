import { MD3LightTheme, configureFonts } from "react-native-paper";
import type { MD3Type } from "react-native-paper/lib/typescript/types";

// Every MD3 variant keeps its size/weight but renders in the Instrument
// Sans face that MATCHES its weight — a mismatched family/weight pair
// makes iOS fall back to the system font.
const familyForWeight: Record<string, string> = {
  "400": "InstrumentSans_400Regular",
  "500": "InstrumentSans_500Medium",
  "600": "InstrumentSans_600SemiBold",
  "700": "InstrumentSans_700Bold",
};

const fonts = configureFonts({
  config: Object.fromEntries(
    Object.entries(MD3LightTheme.fonts).map(([variant, style]) => [
      variant,
      {
        ...style,
        fontFamily:
          familyForWeight[String((style as MD3Type).fontWeight ?? "400")] ??
          "InstrumentSans_400Regular",
      },
    ]),
  ) as Record<string, MD3Type>,
});

export const theme = {
  ...MD3LightTheme,
  fonts,
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
