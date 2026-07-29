/**
 * Memo Create Studio — paragraph building.
 *
 * One builder feeds both worlds: the live canvas lays the paragraph out at
 * DOC px and scales the drawing down with a view/group transform, and the
 * exporter draws the identical paragraph at scale 1 into the 1080-wide
 * surface — so text layout is the same computation everywhere, not two
 * renderers tuned to agree. Every style knob (line height, letter
 * spacing) is explicit on the layer; renderer defaults never apply.
 */

import {
  Skia,
  TextAlign,
  type SkParagraph,
  type SkTypefaceFontProvider,
} from "@shopify/react-native-skia";

import type { TextLayer } from "./document";
import { skiaFamilyFor } from "./fonts";

const alignFor = (align: TextLayer["align"]): TextAlign => {
  switch (align) {
    case "left":
      return TextAlign.Left;
    case "right":
      return TextAlign.Right;
    default:
      return TextAlign.Center;
  }
};

/** Build + layout at the layer's doc-px wrap width. */
export const buildParagraph = (
  layer: TextLayer,
  provider: SkTypefaceFontProvider,
): SkParagraph => {
  const builder = Skia.ParagraphBuilder.Make(
    { textAlign: alignFor(layer.align) },
    provider,
  );
  builder.pushStyle({
    color: Skia.Color(layer.color),
    fontFamilies: [skiaFamilyFor(layer.fontFamily, layer.fontWeight)],
    fontSize: layer.fontSize,
    heightMultiplier: layer.lineHeightMultiplier,
    letterSpacing: layer.letterSpacing,
  });
  builder.addText(layer.text);
  builder.pop();
  const paragraph = builder.build();
  paragraph.layout(layer.maxWidth);
  return paragraph;
};

/** The layer's full doc-px box: wrap width + text height, plus pill pads. */
export const textLayerBox = (
  layer: TextLayer,
  textHeight: number,
): { width: number; height: number; padX: number; padY: number } => {
  const padX = layer.background?.padX ?? 0;
  const padY = layer.background?.padY ?? 0;
  return {
    width: layer.maxWidth + padX * 2,
    height: textHeight + padY * 2,
    padX,
    padY,
  };
};

/** Best guess before the paragraph exists (fonts still loading). */
export const estimatedTextHeight = (layer: TextLayer): number =>
  layer.measuredHeight ?? layer.fontSize * layer.lineHeightMultiplier;

/**
 * Doc-px margin the PREVIEW canvas adds around the layout box. Glyph ink —
 * script swashes, overshoot, deep descenders — legally paints outside the
 * layout bounds; the export surface has no clip so it never crops, but a
 * preview <Canvas> view is its own clip. Half an em on every side covers
 * the worst offenders (Pacifico).
 */
export const textBleedFor = (layer: TextLayer): number =>
  Math.ceil(layer.fontSize * 0.5);
