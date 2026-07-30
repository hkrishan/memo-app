/**
 * The one photo/video tile.
 *
 * Every strip and grid in the app draws the same thing: a cover-cropped
 * still, a play glyph for videos, a dark fallback when a video has no
 * paintable still, and corner badges. That had been re-implemented in the
 * camera-roll grid, the album section rows, the My Photos strip, the
 * filmstrip and the moment cards — which is why a fix to one (the uploading
 * badge, the local-file placeholder, the posterless-video rule) kept having
 * to be copied into the others.
 *
 * Layout stays with the caller: this fills whatever box it is given.
 */

import React, { memo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import type { ImageStyle } from "expo-image";
import { Image, type ImageLoadEventData } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import type { MediaAsset } from "@/features/album/hooks/useMediaLibrary";
import { useCreationMeta } from "@/features/create/store/createdCoversStore";
import { stableCacheKey, type ImageSizeBucket } from "@/lib/imageCache";
import { hasRenderableStill } from "@/lib/mediaStill";
import { MemoCreateBadge } from "./MemoCreateBadge";

export interface MediaTileProps {
  asset: MediaAsset;
  /** Distinguishes recycled cells across lists showing the same photo. */
  recyclingKeySuffix?: string;
  /** Size of the play glyph on the video fallback tile. */
  fallbackGlyphSize?: number;
  /** expo-image fetch priority — strips of tiny thumbs go last. */
  priority?: "low" | "normal" | "high";
  /**
   * Which decode this tile wants. expo-image sizes its decode to the view,
   * and the cache key is shared across surfaces, so a 24px filmstrip thumb
   * and a 130pt grid cell must not land on the same entry — the small
   * bitmap would be reused and drawn as blocks. Defaults to "tile".
   */
  sizeBucket?: ImageSizeBucket;
  /** Fade-in duration; grids use 0 to avoid churn on recycled cells. */
  transition?: number;
  onLoad?: (event: ImageLoadEventData) => void;
  /** Extra sizing/rounding for the image itself. */
  style?: ImageStyle;
  /** Extra sizing/rounding for the dark video-fallback tile. */
  fallbackStyle?: ViewStyle;
}

/**
 * The image layer only. Callers stack their own badges/overlays on top,
 * because those differ per surface (duration, likes, selection, dimming).
 */
export const MediaTile = memo<MediaTileProps>(
  ({
    asset,
    recyclingKeySuffix,
    fallbackGlyphSize = 22,
    priority,
    sizeBucket = "tile",
    transition = 0,
    onLoad,
    style,
    fallbackStyle,
  }) => {
    // Memo Create covers get a UI badge — the image itself is clean.
    // Server metadata travels with the media (all members see it); the
    // local registry covers covers exported before the field existed.
    const localMeta = useCreationMeta(asset.id);
    const serverMeta = asset.metadata?.memoCreate;
    const creationMeta = serverMeta
      ? { pageCount: serverMeta.pageCount ?? 1 }
      : localMeta;

    // A video with no paintable still (remote URL, or an iOS file://
    // recording) gets the dark tile + glyph rather than a blank cell
    if (asset.mediaType === "video" && !hasRenderableStill(asset)) {
      return (
        <View style={[styles.fill, styles.videoFallback, fallbackStyle]}>
          <Ionicons
            name="play"
            size={fallbackGlyphSize}
            color="rgba(255, 255, 255, 0.9)"
          />
        </View>
      );
    }

    const uri = asset.thumbnailUrl ?? asset.uri;
    const image = (
      <Image
        source={{ uri, cacheKey: stableCacheKey(uri, sizeBucket) }}
        // A just-uploaded photo keeps its local original underneath while
        // the remote image downloads (see useAlbumLocalPlaceholders);
        // otherwise the server's ThumbHash paints an instant blurred
        // preview instead of a blank tile
        placeholder={
          asset.placeholderUri
            ? { uri: asset.placeholderUri }
            : asset.thumbHash
              ? { thumbhash: asset.thumbHash }
              : undefined
        }
        placeholderContentFit="cover"
        style={[styles.fill, style]}
        contentFit="cover"
        recyclingKey={
          recyclingKeySuffix ? `${asset.id}-${recyclingKeySuffix}` : asset.id
        }
        // Local files are memory-only; disk-caching them is pure overhead
        cachePolicy={uri.startsWith("http") ? "memory-disk" : "memory"}
        transition={transition}
        {...(priority && { priority })}
        {...(onLoad && { onLoad })}
      />
    );

    // Only creations pay for the wrapper view; every other tile keeps the
    // bare image (the hot path across the whole app)
    if (!creationMeta) return image;
    return (
      <View style={styles.fill}>
        {image}
        <MemoCreateBadge multi={creationMeta.pageCount > 1} />
      </View>
    );
  },
);
MediaTile.displayName = "MediaTile";

/** Corner play badge for a video whose still IS rendering. */
export const VideoPlayBadge = memo<{ size?: number; style?: ViewStyle }>(
  ({ size = 10, style }) => (
    <View style={[styles.playBadge, style]} pointerEvents="none">
      <Ionicons name="play" size={size} color="rgba(255, 255, 255, 0.95)" />
    </View>
  ),
);
VideoPlayBadge.displayName = "VideoPlayBadge";

const styles = StyleSheet.create({
  fill: {
    width: "100%",
    height: "100%",
  },
  videoFallback: {
    backgroundColor: "#1c1c1e",
    alignItems: "center",
    justifyContent: "center",
  },
  playBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    // Optically center the play triangle
    paddingLeft: 1,
  },
});

export default MediaTile;
