/**
 * Memo Create Studio — the Skia document renderer.
 *
 * One `drawDocument` draws the whole strip in DOC px; the exporter calls
 * it once per page behind a translate, so every page is a window onto the
 * same drawing — which is precisely what makes the carousel seamless.
 * (Phase 2 adds text layers here; the live canvas will then share these
 * same draw calls for its Skia-rendered pieces.)
 */

import {
  ClipOp,
  Skia,
  TileMode,
  type SkCanvas,
  type SkImage,
  type SkParagraph,
} from "@shopify/react-native-skia";

import { pageSizeFor } from "./document";
import type {
  Background,
  ImageLayer,
  StudioProject,
  TextLayer,
} from "./document";
import { coverCropUnitRect, layerTouchesSpan } from "./geometry";
import { textLayerBox } from "./paragraph";

/**
 * Absolute-px endpoints of a gradient spanning a box — shared by the Skia
 * exporter and the live canvas (which divides by the box size for
 * expo-linear-gradient's unit coords), so both draw the identical line.
 * The gradient spans the ENTIRE strip so the hue shifts across the swipe.
 */
export const gradientEndpoints = (
  angleDegrees: number,
  width: number,
  height: number,
): { sx: number; sy: number; ex: number; ey: number } => {
  const angle = (angleDegrees * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const half =
    (Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height) /
    2;
  const dx = Math.cos(angle) * half;
  const dy = Math.sin(angle) * half;
  return { sx: cx - dx, sy: cy - dy, ex: cx + dx, ey: cy + dy };
};

export const drawBackground = (
  canvas: SkCanvas,
  background: Background,
  totalWidth: number,
  totalHeight: number,
): void => {
  if (background.type === "solid") {
    canvas.drawColor(Skia.Color(background.color));
    return;
  }
  const { sx, sy, ex, ey } = gradientEndpoints(
    background.angle,
    totalWidth,
    totalHeight,
  );
  const paint = Skia.Paint();
  paint.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: sx, y: sy },
      { x: ex, y: ey },
      [Skia.Color(background.from), Skia.Color(background.to)],
      null,
      TileMode.Clamp,
    ),
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, totalWidth, totalHeight), paint);
};

const drawImageLayer = (
  canvas: SkCanvas,
  layer: ImageLayer,
  image: SkImage,
): void => {
  const { x, y, scale, rotation } = layer.transform;
  const { baseWidth, baseHeight, crop, cornerRadius } = layer;

  canvas.save();
  canvas.translate(x, y);
  canvas.rotate((rotation * 180) / Math.PI, 0, 0);
  canvas.scale(scale, scale);

  const dst = Skia.XYWHRect(-baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
  if (cornerRadius > 0) {
    canvas.clipRRect(
      Skia.RRectXY(dst, cornerRadius, cornerRadius),
      ClipOp.Intersect,
      true,
    );
  }

  const iw = image.width();
  const ih = image.height();
  // Frame-fixed layers converted from v1 drafts carry no asset dims; the
  // cover crop derives from the decoded image right here
  const effectiveCrop =
    layer.fitMode === "cover" && layer.assetWidth === 0
      ? coverCropUnitRect(iw, ih, baseWidth, baseHeight)
      : crop;
  const src = Skia.XYWHRect(
    effectiveCrop.x * iw,
    effectiveCrop.y * ih,
    effectiveCrop.w * iw,
    effectiveCrop.h * ih,
  );
  const paint = Skia.Paint();
  paint.setAlphaf(layer.opacity);
  canvas.drawImageRect(image, src, dst, paint);
  canvas.restore();
};

const drawTextLayer = (
  canvas: SkCanvas,
  layer: TextLayer,
  paragraph: SkParagraph,
): void => {
  const { x, y, scale, rotation } = layer.transform;
  const textHeight = paragraph.getHeight();
  const box = textLayerBox(layer, textHeight);

  canvas.save();
  canvas.translate(x, y);
  canvas.rotate((rotation * 180) / Math.PI, 0, 0);
  canvas.scale(scale, scale);

  if (layer.background) {
    const paint = Skia.Paint();
    paint.setColor(Skia.Color(layer.background.color));
    paint.setAlphaf(paint.getAlphaf() * layer.opacity);
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(-box.width / 2, -box.height / 2, box.width, box.height),
        layer.background.cornerRadius,
        layer.background.cornerRadius,
      ),
      paint,
    );
  }
  // Paragraph color carries the layer color; opacity < 1 needs a layer
  if (layer.opacity < 1) {
    const alpha = Skia.Paint();
    alpha.setAlphaf(layer.opacity);
    canvas.saveLayer(alpha);
  }
  paragraph.paint(canvas, -layer.maxWidth / 2, -textHeight / 2);
  if (layer.opacity < 1) canvas.restore();
  canvas.restore();
};

/**
 * Draws the full document in doc px. `visibleSpan` (doc-px x range) culls
 * layers that can't touch the current page's window. Text layers need
 * their paragraphs pre-built (fonts load async) via `paragraphsById`.
 */
export const drawDocument = (
  canvas: SkCanvas,
  project: StudioProject,
  imagesByUri: Map<string, SkImage>,
  paragraphsById?: Map<string, SkParagraph>,
  visibleSpan?: { x0: number; x1: number },
): void => {
  const page = pageSizeFor(project.ratioId);
  drawBackground(
    canvas,
    project.background,
    page.width * project.pageCount,
    page.height,
  );
  for (const layer of project.layers) {
    if (layer.type === "image") {
      if (
        visibleSpan &&
        !layerTouchesSpan(
          layer,
          layer.baseWidth,
          layer.baseHeight,
          visibleSpan.x0,
          visibleSpan.x1,
        )
      ) {
        continue;
      }
      const image = imagesByUri.get(layer.photo.uri);
      if (image) drawImageLayer(canvas, layer, image);
    } else {
      const paragraph = paragraphsById?.get(layer.id);
      if (!paragraph) continue;
      const box = textLayerBox(layer, paragraph.getHeight());
      if (
        visibleSpan &&
        !layerTouchesSpan(
          layer,
          box.width,
          box.height,
          visibleSpan.x0,
          visibleSpan.x1,
        )
      ) {
        continue;
      }
      drawTextLayer(canvas, layer, paragraph);
    }
  }
};
