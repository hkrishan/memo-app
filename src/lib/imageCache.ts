/**
 * Stable image cache keys.
 *
 * Media is served from R2 via SIGNED URLs whose signature rotates (a new
 * one each 24h signing window). expo-image keys its disk cache on the full
 * URL by default, so a rotated signature reads as a brand-new image →
 * cache miss → needless re-download from R2 (and, if that download fails,
 * the viewer is left showing the low-res thumbnail).
 *
 * Keying the cache on the object PATH instead (everything before "?") makes
 * a photo cache-hit across signature rotations: once it's on disk, it's
 * served locally forever and never re-fetched from R2.
 *
 * The catch: one key means one cached DECODE. expo-image downscales at
 * decode time to the view it is drawn into, so the same photo shown at
 * 24px in the filmstrip and at 240px in a grid cell would share whichever
 * bitmap was decoded first — and a 24px bitmap stretched into a 240px tile
 * is a mess of blocks. `sizeBucket` keeps those apart while still sharing
 * across signature rotations.
 */

/** Render scales that get their own decode. Coarse on purpose — one key per
 *  bucket, not per pixel size, so cache hits stay likely. */
export type ImageSizeBucket = "micro" | "tile" | "full";

/**
 * The bucket for a rendered width in points. Boundaries sit between the
 * app's actual surfaces: filmstrip thumbs (~24), grid/strip tiles
 * (~80–130), and anything full-bleed.
 */
export const sizeBucketForWidth = (width: number): ImageSizeBucket => {
  if (width <= 48) return "micro";
  if (width <= 200) return "tile";
  return "full";
};

/**
 * A stable cache key for a media URI — the R2 object path, minus the query
 * string (signature), optionally scoped to a render size. Returns undefined
 * for local files (file://, ph://, content://, asset library), whose URIs
 * are already stable, so expo-image falls back to using the URI itself.
 */
export const stableCacheKey = (
  uri: string | null | undefined,
  sizeBucket?: ImageSizeBucket,
): string | undefined => {
  if (!uri) return undefined;
  if (!uri.startsWith("http")) return undefined;
  const queryIndex = uri.indexOf("?");
  const path = queryIndex >= 0 ? uri.slice(0, queryIndex) : uri;
  // Strip the scheme+host so the key is just the object path (e.g.
  // "/library/<user>/<id>.jpg"); shorter and host-independent.
  const schemeEnd = path.indexOf("://");
  const key =
    schemeEnd < 0
      ? path
      : (() => {
          const afterScheme = path.slice(schemeEnd + 3);
          const slash = afterScheme.indexOf("/");
          return slash >= 0 ? afterScheme.slice(slash) : afterScheme;
        })();
  return sizeBucket ? `${key}@${sizeBucket}` : key;
};
