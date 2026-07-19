/**
 * useMediaLibrary Hook
 * Handles permissions and fetching photos/videos from the device media library
 */

import { useState, useEffect, useCallback, useRef } from "react";
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

  // Use refs for values that shouldn't trigger callback recreation
  const isLoadingRef = useRef(false);
  const endCursorRef = useRef<string | undefined>(undefined);
  const hasMoreRef = useRef(true);

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
  }, []);

  const checkPermission = async () => {
    const { status } = await MediaLibrary.getPermissionsAsync();
    setHasPermission(status === "granted");

    if (status === "granted") {
      loadAssets();
    }
  };

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    const granted = status === "granted";
    setHasPermission(granted);

    if (granted) {
      loadAssets();
    }

    return granted;
  }, []);

  const loadAssets = useCallback(async (cursor?: string) => {
    if (isLoadingRef.current) return;

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
    } catch (error) {
      console.error("Error loading media assets:", error);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
      endPerfTrace();
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMoreRef.current || isLoadingRef.current || !endCursorRef.current)
      return;
    await loadAssets(endCursorRef.current);
  }, [loadAssets]);

  const refresh = useCallback(async () => {
    endCursorRef.current = undefined;
    hasMoreRef.current = true;
    setEndCursor(undefined);
    setHasMore(true);
    await loadAssets();
  }, [loadAssets]);

  return {
    assets,
    hasPermission,
    isLoading,
    hasMore,
    requestPermission,
    loadMore,
    refresh,
  };
}

export default useMediaLibrary;
