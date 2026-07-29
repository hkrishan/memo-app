/**
 * ImageWarmup — invisible image pre-loader for the shared disk cache.
 *
 * The Snapchat pattern: content the user is LIKELY to open next is
 * already on disk before they tap, so grids and viewers paint instantly
 * instead of blur-upping over the network.
 *
 * Why not `Image.prefetch`? expo-image's prefetch caches by URL only —
 * it cannot take a `cacheKey`. All of Memo's reads key the disk cache on
 * the object PATH (stableCacheKey) so R2 signature rotations still
 * cache-hit; a URL-keyed prefetch would fill entries those reads never
 * look at. Rendering 1px images with the same source+cacheKey warms the
 * exact slot the real UI reads.
 *
 * Downloads run `concurrency` at a time; completed images unmount (the
 * bytes live in the disk cache, the view is no longer needed).
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";

import { stableCacheKey, type ImageSizeBucket } from "@/lib/imageCache";

export interface WarmupItem {
  uri: string;
  /** Decode bucket the eventual reader will use (defaults to "tile"). */
  bucket?: ImageSizeBucket;
}

interface ImageWarmupProps {
  items: WarmupItem[];
  /** Parallel downloads. Keep small — this is background work. */
  concurrency?: number;
}

export const ImageWarmup = memo<ImageWarmupProps>(
  ({ items, concurrency = 3 }) => {
    const [done, setDone] = useState<Set<string>>(() => new Set());

    // A new batch (different album, refreshed list) starts fresh
    const batchKey = useMemo(
      () => items.map((item) => item.uri).join("|"),
      [items],
    );
    useEffect(() => {
      setDone(new Set());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [batchKey]);

    const markDone = useCallback((uri: string) => {
      setDone((prev) => {
        if (prev.has(uri)) return prev;
        const next = new Set(prev);
        next.add(uri);
        return next;
      });
    }, []);

    const inFlight = useMemo(
      () =>
        items
          .filter((item) => item.uri && !done.has(item.uri))
          .slice(0, concurrency),
      [items, done, concurrency],
    );

    if (inFlight.length === 0) return null;

    return (
      <View style={styles.hidden} pointerEvents="none" accessible={false}>
        {inFlight.map((item) => (
          <Image
            key={item.uri}
            source={{
              uri: item.uri,
              cacheKey: stableCacheKey(item.uri, item.bucket ?? "tile"),
            }}
            style={styles.pixel}
            // Disk only: the goal is warm bytes, not a decoded bitmap of
            // a 1px view polluting the memory cache
            cachePolicy="disk"
            onLoad={() => markDone(item.uri)}
            onError={() => markDone(item.uri)}
          />
        ))}
      </View>
    );
  },
);
ImageWarmup.displayName = "ImageWarmup";

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  pixel: {
    width: 1,
    height: 1,
  },
});

export default ImageWarmup;
