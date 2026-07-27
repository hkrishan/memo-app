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
 */

/**
 * A stable cache key for a media URI — the R2 object path, minus the query
 * string (signature). Returns undefined for local files (file://, ph://,
 * content://, asset library), whose URIs are already stable, so expo-image
 * falls back to using the URI itself as the key.
 */
export const stableCacheKey = (uri: string | null | undefined): string | undefined => {
  if (!uri) return undefined;
  if (!uri.startsWith("http")) return undefined;
  const queryIndex = uri.indexOf("?");
  const path = queryIndex >= 0 ? uri.slice(0, queryIndex) : uri;
  // Strip the scheme+host so the key is just the object path (e.g.
  // "/library/<user>/<id>.jpg"); shorter and host-independent.
  const schemeEnd = path.indexOf("://");
  if (schemeEnd < 0) return path;
  const afterScheme = path.slice(schemeEnd + 3);
  const slash = afterScheme.indexOf("/");
  return slash >= 0 ? afterScheme.slice(slash) : afterScheme;
};
