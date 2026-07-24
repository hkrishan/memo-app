/**
 * useResolvedAssetUri Hook
 * Lazily resolves ph:// URIs to local file URIs on-demand
 *
 * Performance optimized:
 * - Only resolves when the component using this hook mounts
 * - Caches results globally to avoid repeated async calls
 * - Includes cancellation guard to prevent state updates on unmounted components
 * - Minimal state - only stores the resolved URI
 */

import { useState, useEffect, useRef } from "react";
import * as MediaLibrary from "expo-media-library";

// Global cache to store resolved URIs across component instances
// Key: asset ID, Value: resolved local URI
const resolvedUriCache = new Map<string, string>();

// Track in-flight resolution promises to avoid duplicate requests
const pendingResolutions = new Map<string, Promise<string>>();

interface UseResolvedAssetUriOptions {
  /** Asset ID for cache key */
  assetId: string;
  /** Original URI (may be ph:// or file://) */
  uri: string;
  /** Whether to eagerly resolve (default: true) */
  enabled?: boolean;
}

interface UseResolvedAssetUriReturn {
  /** The resolved URI (file://) or original if resolution failed/pending */
  resolvedUri: string;
  /** Whether resolution is in progress */
  isResolving: boolean;
}

/**
 * Resolves a ph:// URI to a local file URI.
 * Uses caching to avoid repeated async calls.
 */
async function resolveAssetUri(assetId: string, uri: string): Promise<string> {
  // Return immediately if not a ph:// URI
  if (!uri.startsWith("ph://")) {
    return uri;
  }

  // Check cache first
  const cached = resolvedUriCache.get(assetId);
  if (cached) {
    return cached;
  }

  // Check if there's already a pending resolution
  const pending = pendingResolutions.get(assetId);
  if (pending) {
    return pending;
  }

  // Create new resolution promise
  const resolutionPromise = (async () => {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(assetId);
      const resolvedUri = info.localUri ?? uri;

      // Cache the result
      resolvedUriCache.set(assetId, resolvedUri);

      return resolvedUri;
    } catch (error) {
      if (__DEV__) console.warn("Failed to resolve asset URI:", assetId, error);
      // Cache the original URI to avoid retrying failed resolutions
      resolvedUriCache.set(assetId, uri);
      return uri;
    } finally {
      // Clean up pending promise
      pendingResolutions.delete(assetId);
    }
  })();

  pendingResolutions.set(assetId, resolutionPromise);
  return resolutionPromise;
}

/**
 * Hook to lazily resolve a ph:// URI to a local file URI.
 *
 * @example
 * ```tsx
 * const { resolvedUri, isResolving } = useResolvedAssetUri({
 *   assetId: asset.id,
 *   uri: asset.uri,
 * });
 *
 * return <Image source={{ uri: resolvedUri }} />;
 * ```
 */
export function useResolvedAssetUri({
  assetId,
  uri,
  enabled = true,
}: UseResolvedAssetUriOptions): UseResolvedAssetUriReturn {
  // Check cache synchronously for immediate return
  const cachedUri = resolvedUriCache.get(assetId);
  const initialUri = cachedUri ?? uri;
  const needsResolution = enabled && uri.startsWith("ph://") && !cachedUri;

  const [resolvedUri, setResolvedUri] = useState(initialUri);
  const [isResolving, setIsResolving] = useState(needsResolution);

  // Cancellation ref to prevent state updates on unmounted components
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!needsResolution) {
      return;
    }

    let cancelled = false;

    (async () => {
      const resolved = await resolveAssetUri(assetId, uri);

      if (!cancelled && isMountedRef.current) {
        setResolvedUri(resolved);
        setIsResolving(false);
      }
    })();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
  }, [assetId, uri, needsResolution]);

  return {
    resolvedUri,
    isResolving,
  };
}

/**
 * Utility to prefetch and cache URIs for a batch of assets.
 * Useful for prefetching visible items in a list.
 */
export async function prefetchAssetUris(
  assets: Array<{ id: string; uri: string }>,
): Promise<void> {
  const phAssets = assets.filter((a) => a.uri.startsWith("ph://"));

  await Promise.all(
    phAssets.map((asset) => resolveAssetUri(asset.id, asset.uri)),
  );
}

/**
 * Clear the URI resolution cache.
 * Useful for testing or when the app needs to free memory.
 */
export function clearUriCache(): void {
  resolvedUriCache.clear();
}

/**
 * Get the current size of the URI cache.
 */
export function getUriCacheSize(): number {
  return resolvedUriCache.size;
}

export default useResolvedAssetUri;
