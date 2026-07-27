/**
 * Can a tile paint a still for this asset?
 *
 * Photos always can. Videos need one of:
 * - a poster thumbnail (server-generated, or a device asset's poster), or
 * - an iOS `ph://` uri — PhotoKit hands expo-image the poster frame, or
 * - on Android, any local video file — Glide decodes a frame from it.
 *
 * Everything else (a remote video URL, an iOS `file://` recording) has no
 * renderable image, and grids show a dark play-glyph tile instead of a
 * blank cell where expo-image quietly failed.
 */

import { Platform } from "react-native";
import type { MediaAsset } from "@/features/album/hooks/useMediaLibrary";

export const hasRenderableStill = (
  asset: Pick<MediaAsset, "mediaType" | "uri" | "thumbnailUrl">,
): boolean => {
  if (asset.mediaType !== "video") return true;
  if (asset.thumbnailUrl != null) return true;
  if (asset.uri.startsWith("ph://")) return true;
  return Platform.OS === "android" && !asset.uri.startsWith("http");
};
