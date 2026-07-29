/**
 * Memo Create Studio — pure geometry shared by the live canvas and the
 * Skia exporter. Anything both sides need lives here so they can't drift.
 */

import type { ImageLayer } from "./document";

/** The one preview multiplier: preview px = doc px * previewScale. */
export const previewScaleFor = (
  previewPageWidth: number,
  docPageWidth: number,
): number => previewPageWidth / docPageWidth;

/**
 * Axis-aligned bounding box of a layer's rotated frame — used to cull
 * layers that don't touch a page at export, and for future edge snapping.
 */
export const rotatedAabb = (
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  rotation: number,
): { minX: number; minY: number; maxX: number; maxY: number } => {
  const halfW =
    (Math.abs(Math.cos(rotation)) * width +
      Math.abs(Math.sin(rotation)) * height) /
    2;
  const halfH =
    (Math.abs(Math.sin(rotation)) * width +
      Math.abs(Math.cos(rotation)) * height) /
    2;
  return {
    minX: centerX - halfW,
    minY: centerY - halfH,
    maxX: centerX + halfW,
    maxY: centerY + halfH,
  };
};

/** Does a layer's transformed frame touch the horizontal span [x0, x1)? */
export const layerTouchesSpan = (
  layer: { transform: ImageLayer["transform"] },
  baseWidth: number,
  baseHeight: number,
  x0: number,
  x1: number,
): boolean => {
  const { x, y, scale, rotation } = layer.transform;
  const box = rotatedAabb(x, y, baseWidth * scale, baseHeight * scale, rotation);
  return box.maxX > x0 && box.minX < x1;
};

/**
 * Where the (oversized) inner image sits inside a layer's frame to show
 * exactly `crop` of the asset — the preview-side twin of the exporter's
 * drawImageRect(srcCropRect -> frame). Frame units in, frame units out.
 */
export const innerImageRect = (
  crop: { x: number; y: number; w: number; h: number },
  frameWidth: number,
  frameHeight: number,
): { left: number; top: number; width: number; height: number } => {
  const width = frameWidth / crop.w;
  const height = frameHeight / crop.h;
  return {
    left: -crop.x * width,
    top: -crop.y * height,
    width,
    height,
  };
};

/**
 * Unit-space crop rect that cover-fits an asset into a frame aspect —
 * the same center-crop math as v1's coverSrcRect, expressed in 0..1 so it
 * can live on a layer (and makes collage/carousel conversion lossless).
 */
export const coverCropUnitRect = (
  assetWidth: number,
  assetHeight: number,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number; w: number; h: number } => {
  if (assetWidth <= 0 || assetHeight <= 0) return { x: 0, y: 0, w: 1, h: 1 };
  const scale = Math.max(frameWidth / assetWidth, frameHeight / assetHeight);
  const w = frameWidth / scale / assetWidth;
  const h = frameHeight / scale / assetHeight;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
};
