/**
 * Memo Create Studio — the text tool's font roster.
 *
 * One registry drives everything: the RN family names the entry overlay's
 * TextInput uses (via expo-font), and the Skia typeface provider both the
 * live canvas and the exporter draw paragraphs with. Registering each
 * weight under its OWN family name (the rnFamily string) makes Skia's
 * face matching deterministic — no weight-resolution guesswork, and no
 * chance of preview and export picking different faces.
 *
 * Five families, curated (BowlbyOneSC is banned for new UI):
 *   Inter (400/600/700) — the app voice · Pacifico — script, the Create
 *   wordmark · Playfair Display — editorial serif · Bebas Neue — condensed
 *   poster caps · DM Mono — typewriter captions.
 */

import { useEffect, useState } from "react";
import { Asset } from "expo-asset";
import { Skia, type SkTypefaceFontProvider } from "@shopify/react-native-skia";

import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Pacifico_400Regular } from "@expo-google-fonts/pacifico/400Regular";
import { PlayfairDisplay_400Regular } from "@expo-google-fonts/playfair-display/400Regular";
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display/700Bold";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue/400Regular";
import { DMMono_400Regular } from "@expo-google-fonts/dm-mono/400Regular";

import type { FontFamilyId } from "./document";

export type FontWeightValue = 400 | 600 | 700;

export interface FontVariant {
  weight: FontWeightValue;
  /** expo-font family name — doubles as the Skia family name. */
  rnFamily: string;
  /** Metro asset module id of the TTF. */
  module: number;
}

export interface FontFamilyDef {
  id: FontFamilyId;
  label: string;
  /**
   * Line-height multiplier this family needs to not clip: script faces
   * (Pacifico) paint tall ascender loops and deep descenders well outside
   * a 1.2 line box. Written onto the layer at creation — parity requires
   * the value be explicit on the layer, never a renderer default.
   */
  lineHeight: number;
  variants: FontVariant[];
}

export const FONT_FAMILIES: Record<FontFamilyId, FontFamilyDef> = {
  inter: {
    id: "inter",
    label: "Inter",
    lineHeight: 1.2,
    variants: [
      { weight: 400, rnFamily: "Inter_400Regular", module: Inter_400Regular },
      { weight: 600, rnFamily: "Inter_600SemiBold", module: Inter_600SemiBold },
      { weight: 700, rnFamily: "Inter_700Bold", module: Inter_700Bold },
    ],
  },
  pacifico: {
    id: "pacifico",
    label: "Pacifico",
    lineHeight: 1.55,
    variants: [
      {
        weight: 400,
        rnFamily: "Pacifico_400Regular",
        module: Pacifico_400Regular,
      },
    ],
  },
  playfair: {
    id: "playfair",
    label: "Playfair",
    lineHeight: 1.3,
    variants: [
      {
        weight: 400,
        rnFamily: "PlayfairDisplay_400Regular",
        module: PlayfairDisplay_400Regular,
      },
      {
        weight: 700,
        rnFamily: "PlayfairDisplay_700Bold",
        module: PlayfairDisplay_700Bold,
      },
    ],
  },
  bebas: {
    id: "bebas",
    label: "Bebas",
    lineHeight: 1.1,
    variants: [
      {
        weight: 400,
        rnFamily: "BebasNeue_400Regular",
        module: BebasNeue_400Regular,
      },
    ],
  },
  dmmono: {
    id: "dmmono",
    label: "Mono",
    lineHeight: 1.35,
    variants: [
      { weight: 400, rnFamily: "DMMono_400Regular", module: DMMono_400Regular },
    ],
  },
};

export const FONT_FAMILY_IDS = Object.keys(FONT_FAMILIES) as FontFamilyId[];

/** Exact weight when the family ships it, else the nearest one. */
export const resolveVariant = (
  family: FontFamilyId,
  weight: number,
): FontVariant => {
  const { variants } = FONT_FAMILIES[family];
  return variants.reduce((best, variant) =>
    Math.abs(variant.weight - weight) < Math.abs(best.weight - weight)
      ? variant
      : best,
  );
};

/** The family name paragraphs reference — unique per (family, weight). */
export const skiaFamilyFor = (
  family: FontFamilyId,
  weight: number,
): string => resolveVariant(family, weight).rnFamily;

/** The line-height multiplier a family needs (see FontFamilyDef). */
export const lineHeightFor = (family: FontFamilyId): number =>
  FONT_FAMILIES[family].lineHeight;

/** expo-font map for the entry overlay's live TextInput preview. */
export const expoFontMap = (): Record<string, number> =>
  Object.fromEntries(
    Object.values(FONT_FAMILIES).flatMap((def) =>
      def.variants.map((variant) => [variant.rnFamily, variant.module]),
    ),
  );

/**
 * The one Skia typeface provider — preview canvases and the exporter both
 * await this same instance, so text can't render from different faces.
 * Note: a bare TypefaceFontProvider has NO system-font fallback, so glyphs
 * outside these faces (emoji especially) render as tofu — the entry
 * overlay strips emoji for that reason.
 */
let providerPromise: Promise<SkTypefaceFontProvider> | null = null;

export const getFontProvider = (): Promise<SkTypefaceFontProvider> => {
  if (!providerPromise) {
    providerPromise = (async () => {
      const provider = Skia.TypefaceFontProvider.Make();
      const variants = Object.values(FONT_FAMILIES).flatMap(
        (def) => def.variants,
      );
      await Promise.all(
        variants.map(async ({ rnFamily, module }) => {
          const asset = Asset.fromModule(module);
          await asset.downloadAsync();
          const uri = asset.localUri ?? asset.uri;
          const data = await Skia.Data.fromURI(uri);
          const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data);
          if (!typeface) throw new Error(`Could not load font ${rnFamily}`);
          provider.registerFont(typeface, rnFamily);
        }),
      );
      return provider;
    })();
    // A failed load (e.g. offline before assets cached) must not poison
    // the cache forever
    providerPromise.catch(() => {
      providerPromise = null;
    });
  }
  return providerPromise;
};

/** Hook flavor for the live canvas; null until the faces are ready. */
export const useFontProvider = (): SkTypefaceFontProvider | null => {
  const [provider, setProvider] = useState<SkTypefaceFontProvider | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    getFontProvider()
      .then((loaded) => {
        if (alive) setProvider(loaded);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return provider;
};
