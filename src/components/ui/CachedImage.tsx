/**
 * CachedImage Component
 * A wrapper around expo-image with disk caching enabled for API images
 */

import { Image, ImageProps, ImageContentFit } from "expo-image";
import { StyleProp, ImageStyle } from "react-native";

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
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      placeholder={showPlaceholder ? { blurhash: PLACEHOLDER_BLURHASH } : undefined}
      placeholderContentFit="cover"
      cachePolicy="disk"
      transition={200}
      {...rest}
    />
  );
};

export default CachedImage;
