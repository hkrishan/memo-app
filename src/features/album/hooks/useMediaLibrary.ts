/**
 * useMediaLibrary Hook
 * Handles permissions and fetching photos/videos from the device media library
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AppState } from "react-native";
import * as MediaLibrary from "expo-media-library";
import { perf, PerfInteractions } from "@/lib/performance";

export interface MediaAsset {
  id: string;
  uri: string;
  thumbnailUrl?: string | null;
  mediaType: "photo" | "video";
  width: number;
  height: number;
  duration: number;
  creationTime: number;
  modificationTime: number;
  /** Album photos: like count for the grid badges. Device assets omit it. */
  likeCount?: number;
}

interface UseMediaLibraryOptions {
  mediaType?: MediaLibrary.MediaTypeValue | MediaLibrary.MediaTypeValue[];
  first?: number;
  sortBy?: MediaLibrary.SortByValue | MediaLibrary.SortByValue[];
}

interface UseMediaLibraryReturn {
  assets: MediaAsset[];
  hasPermission: boolean | null;
  isLoading: boolean;
  hasMore: boolean;
  /** Total number of matching assets in the library (null until known). */
  totalCount: number | null;
  requestPermission: () => Promise<boolean>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMediaLibrary(
  options: UseMediaLibraryOptions = {},
): UseMediaLibraryReturn {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Use refs for values that shouldn't trigger callback recreation
  const isLoadingRef = useRef(false);
  const endCursorRef = useRef<string | undefined>(undefined);
  const hasMoreRef = useRef(true);
  const hasPermissionRef = useRef<boolean | null>(null);
  // Bumped by refresh(); loads that started under an older generation must
  // discard their results so a stale loadMore can't overwrite the fresh page
  const generationRef = useRef(0);

  // Store options in refs to keep callbacks stable
  const optionsRef = useRef({
    mediaType: options.mediaType ?? [
      MediaLibrary.MediaType.photo,
      MediaLibrary.MediaType.video,
    ],
    first: options.first ?? 50,
    sortBy: options.sortBy ?? MediaLibrary.SortBy.creationTime,
  });

  // Check permission on mount
  useEffect(() => {
    checkPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkPermission = async () => {
    const { status } = await MediaLibrary.getPermissionsAsync();
    const granted = status === "granted";
    hasPermissionRef.current = granted;
    setHasPermission(granted);

    if (granted) {
      loadAssets();
    }
  };

  const loadAssets = useCallback(async (cursor?: string, force = false) => {
    // `force` lets refresh() start its fresh first-page load even while a
    // stale (now-discarded) load is still in flight
    if (isLoadingRef.current && !force) return;

    const generation = generationRef.current;
    isLoadingRef.current = true;
    setIsLoading(true);

    // Performance instrumentation
    const endPerfTrace = perf.startInteraction(
      cursor ? `${PerfInteractions.MEDIA_LIBRARY_LOAD}.more` : PerfInteractions.MEDIA_LIBRARY_LOAD
    );

    try {
      const { mediaType, first, sortBy } = optionsRef.current;
      const result = await MediaLibrary.getAssetsAsync({
        mediaType,
        first,
        sortBy,
        after: cursor,
      });

      // A refresh() bumped the generation while we were in flight — this
      // result belongs to the old list, so discard it (no state/cursor writes)
      if (generation !== generationRef.current) return;

      // Map assets immediately without blocking on URI resolution.
      // Components that need resolved file:// URIs should use useResolvedAssetUri hook.
      // expo-image handles ph:// URIs natively on iOS for display purposes.
      const mappedAssets: MediaAsset[] = result.assets.map((asset) => ({
        id: asset.id,
        uri: asset.uri,
        // thumbnailUrl can be used by expo-image directly (handles ph:// natively)
        thumbnailUrl: asset.uri,
        mediaType: asset.mediaType === "video" ? "video" : "photo",
        width: asset.width,
        height: asset.height,
        duration: asset.duration,
        creationTime: asset.creationTime,
        modificationTime: asset.modificationTime,
      }));

      if (cursor) {
        setAssets((prev) => [...prev, ...mappedAssets]);
      } else {
        setAssets(mappedAssets);
      }

      endCursorRef.current = result.endCursor;
      hasMoreRef.current = result.hasNextPage;
      setEndCursor(result.endCursor);
      setHasMore(result.hasNextPage);
      setTotalCount(result.totalCount);
    } catch (error) {
      console.error("Error loading media assets:", error);
    } finally {
      // Only the load that owns the current generation may clear the loading
      // flags — a discarded stale load must not stomp the fresh load's state
      if (generation === generationRef.current) {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
      endPerfTrace();
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    const granted = status === "granted";
    hasPermissionRef.current = granted;
    setHasPermission(granted);

    if (granted) {
      loadAssets();
    }

    return granted;
  }, [loadAssets]);

  // Re-check permission when the app returns to the foreground: the user may
  // have granted access in Settings after seeing the denied screen
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || hasPermissionRef.current === true) return;
      MediaLibrary.getPermissionsAsync()
        .then(({ status }) => {
          if (status === "granted" && hasPermissionRef.current !== true) {
            hasPermissionRef.current = true;
            setHasPermission(true);
            loadAssets();
          }
        })
        .catch(() => {
          // Ignore — next foreground will retry
        });
    });
    return () => subscription.remove();
  }, [loadAssets]);

  const loadMore = useCallback(async () => {
    if (!hasMoreRef.current || isLoadingRef.current || !endCursorRef.current)
      return;
    await loadAssets(endCursorRef.current);
  }, [loadAssets]);

  const refresh = useCallback(async () => {
    // Invalidate any in-flight load (its results/cursor writes are discarded)
    generationRef.current += 1;
    endCursorRef.current = undefined;
    hasMoreRef.current = true;
    setEndCursor(undefined);
    setHasMore(true);
    // Force so the fresh first-page load always runs, even if a stale load
    // still holds the isLoading flag
    await loadAssets(undefined, true);
  }, [loadAssets]);

  return {
    assets,
    hasPermission,
    isLoading,
    hasMore,
    totalCount,
    requestPermission,
    loadMore,
    refresh,
  };
}

export default useMediaLibrary;
