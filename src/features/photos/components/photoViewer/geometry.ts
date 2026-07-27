/**
 * Pure geometry + source helpers for the PhotoViewer.
 *
 * Extracted so the viewer's flight math can be read (and reasoned about)
 * without scrolling past 3000 lines of component. Several of these run on
 * the UI thread — the "worklet" directives are load-bearing.
 */

import type { MediaAsset } from "@/features/album/hooks";
import type { Frame } from "../types";

export const clamp = (value: number, min: number, max: number): number => {
  "worklet";
  return Math.min(Math.max(value, min), max);
};

/**
 * Max pannable offset from center at a given scale, based on the
 * aspect-fitted ("contain") display size of the image — a fitted edge that
 * is smaller than the page never pans, so its bound stays 0.
 */
export const panBounds = (
  scale: number,
  fittedWidth: number,
  fittedHeight: number,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number } => {
  "worklet";
  return {
    x: Math.max(0, (fittedWidth * scale - pageWidth) / 2),
    y: Math.max(0, (fittedHeight * scale - pageHeight) / 2),
  };
};

/**
 * Aspect-fitted ("contain") rect of an asset centered in a box. At this
 * rect a cover-fit image renders identically to the pager's contain-fit
 * page, which is what makes the flight crossovers seamless.
 */
export const fitRect = (
  assetWidth: number,
  assetHeight: number,
  boxWidth: number,
  boxHeight: number,
): Frame => {
  if (assetWidth <= 0 || assetHeight <= 0) {
    return { x: 0, y: 0, width: boxWidth, height: boxHeight };
  }
  const scale = Math.min(boxWidth / assetWidth, boxHeight / assetHeight);
  const width = assetWidth * scale;
  const height = assetHeight * scale;
  return {
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
    width,
    height,
  };
};

/**
 * Uniform scale that re-fits an asset's fullscreen contain-rect into the
 * chrome-fitted box (the area between the top bar and the filmstrip).
 * Width-constrained (landscape) photos that already clear the strip keep
 * scale 1 — only the constrained dimension shrinks the photo.
 */
export const chromeFitScale = (
  assetWidth: number,
  assetHeight: number,
  pageW: number,
  pageH: number,
  availableHeight: number,
): number => {
  if (availableHeight >= pageH) return 1;
  if (!(assetWidth > 0 && assetHeight > 0)) return availableHeight / pageH;
  const full = Math.min(pageW / assetWidth, pageH / assetHeight);
  const avail = Math.min(pageW / assetWidth, availableHeight / assetHeight);
  return full > 0 ? avail / full : 1;
};

/** Resolves null if `promise` has not settled within `ms`. */
export const withTimeoutNull = <T,>(
  promise: Promise<T | null>,
  ms: number,
): Promise<T | null> =>
  Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);

/**
 * The grid's (already painted, so already cached) thumbnail, layered under
 * the full-res image while it streams in — server-backed assets must never
 * show as a black rectangle. Same-URI assets (device library) skip the
 * underlay entirely.
 */
export const thumbnailUnderlayUri = (asset: MediaAsset): string | undefined =>
  asset.thumbnailUrl && asset.thumbnailUrl !== asset.uri
    ? asset.thumbnailUrl
    : undefined;

/** Remote media is worth keeping on disk; local URIs stay memory-only. */
export const cachePolicyFor = (uri: string): "memory-disk" | "memory" =>
  uri.startsWith("http") ? "memory-disk" : "memory";

/**
 * The image the fullscreen page paints: the screen-sized derivative when
 * the server made one, else the original. Decoding a 12MP original per
 * page is what made paging feel heavy — the derivative is ~1440px.
 */
export const displayUriFor = (asset: MediaAsset): string =>
  asset.displayUrl ?? asset.uri;

/**
 * What the flight overlay's Image should fly. Photos fly their full-res
 * URI; videos fly their POSTER — pointing expo-image at a remote video
 * file would download it only to fail decoding. (Local library video uris
 * render as poster frames, so they are safe as-is.)
 */
export const flightUriFor = (asset: MediaAsset): string =>
  asset.mediaType === "video"
    ? (asset.thumbnailUrl ?? asset.uri)
    : displayUriFor(asset);
