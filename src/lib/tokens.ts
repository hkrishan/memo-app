/**
 * Design tokens — the single source for colors, type, spacing, and radii.
 *
 * Derived from the app's own most-used values (the audit counted 132
 * distinct hex colors, 29 font sizes and 36 radii doing the work of a
 * handful of roles). New UI should import from here; existing screens
 * migrate as they're touched.
 *
 * NOTE: the member identity palette (memberColor.ts) is deliberately NOT
 * here — identity colors are data, not semantic UI colors.
 */

export const color = {
  // Pages
  bg: "#FFFFFF",
  /** Camera, media viewer, paywall, auth, drop capture — nothing else. */
  bgDark: "#000000",
  // Surfaces (cards, fields, chips) on light pages
  surface1: "#F2F2F7",
  surface2: "#E9E9EB",
  surfaceDark: "#1C1C1E",
  // Text
  textPrimary: "#111111",
  /** 4.8:1 on white — the default secondary. */
  textSecondary: "#6E6E73",
  /** Below AA on white — ≥17pt or decorative use only. */
  textTertiary: "#8E8E93",
  textInverse: "#FFFFFF",
  // Lines
  separator: "rgba(0, 0, 0, 0.08)",
  separatorDark: "rgba(255, 255, 255, 0.12)",
  // Semantic
  accent: "#007AFF",
  success: "#30D158",
  warning: "#FF9500",
  danger: "#E5484D",
  scrim: "rgba(0, 0, 0, 0.45)",
  onDarkPrimary: "#FFFFFF",
  onDarkSecondary: "rgba(255, 255, 255, 0.6)",
} as const;

/**
 * The UI face: Instrument Sans. Each weight is its own loaded family —
 * always pair fontFamily with the MATCHING fontWeight (a mismatched pair
 * makes iOS fall back to the system font). Instrument Sans tops out at
 * 700; anything heavier maps to bold.
 */
export const font = {
  regular: { fontFamily: "InstrumentSans_400Regular", fontWeight: "400" },
  medium: { fontFamily: "InstrumentSans_500Medium", fontWeight: "500" },
  semibold: { fontFamily: "InstrumentSans_600SemiBold", fontWeight: "600" },
  bold: { fontFamily: "InstrumentSans_700Bold", fontWeight: "700" },
} as const;

export const type = {
  display: { fontSize: 34, ...font.bold },
  /** Root & modal screen titles. */
  title: { fontSize: 22, ...font.bold },
  /** Pushed screens' nav titles. */
  navTitle: { fontSize: 17, ...font.semibold },
  headline: { fontSize: 16, ...font.bold },
  body: { fontSize: 15, ...font.regular },
  bodySm: { fontSize: 14, ...font.regular },
  caption: { fontSize: 13, ...font.regular },
  overline: {
    fontSize: 12,
    ...font.semibold,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
} as const;

/**
 * Wordmark accent ("Memo Create" / "Memo Premium"): Instrument Serif
 * italic at base+2 (its x-height runs small next to the sans).
 */
export const scriptType = (baseSize: number) =>
  ({
    fontFamily: "InstrumentSerif_400Regular_Italic",
    fontSize: baseSize + 2,
    fontWeight: "400",
  }) as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** The single screen gutter. */
export const screenH = 16;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

export const size = {
  /** Minimum hit area for anything tappable. */
  touchMin: 44,
  btnSm: 36,
  btnLg: 48,
  hitSlop: 8,
} as const;
