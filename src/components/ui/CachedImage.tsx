/**
 * CachedImage Component
 * A wrapper around expo-image with disk caching enabled for API images
 */

import { Image, ImageProps, ImageContentFit } from "expo-image";
import { StyleProp, ImageStyle } from "react-native";

import { stableCacheKey } from "@/lib/imageCache";

// Blurhash placeholder for loading state (neutral gray)
const PLACEHOLDER_BLURHASH = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";

interface CachedImageProps extends Omit<ImageProps, "source" | "style" | "contentFit"> {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  showPlaceholder?: boolean;
}

export const CachedImage: React.FC<CachedImageProps> = ({
  uri,
  style,
  contentFit = "cover",
  showPlaceholder = true,
  ...rest
}) => {
  if (!uri) {
    return null;
  }

  return (
    <Image
      // Key the disk cache on the object path, not the signed URL — a rotated
      // R2 signature then still cache-hits instead of re-downloading.
      source={{ uri, cacheKey: stableCacheKey(uri) }}
      style={style}
      contentFit={contentFit}
      placeholder={showPlaceholder ? { blurhash: PLACEHOLDER_BLURHASH } : undefined}
      placeholderContentFit="cover"
      cachePolicy="memory-disk"
      // Recycled list cells must never keep painting the previous photo
      // while the next decodes — key the native view to the uri
      recyclingKey={uri}
      // No default cross-fade: in recycled lists a 200ms dissolve read as
      // flicker on every scroll. Hero surfaces can opt back in via props.
      transition={0}
      {...rest}
    />
  );
};

export default CachedImage;
