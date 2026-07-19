/**
 * GalleryCarousel Component
 * Horizontal scrolling carousel to display photos from the media library
 *
 * Performance optimized:
 * - Uses FlashList for virtualization (only renders visible items)
 * - Memoized renderItem and keyExtractor
 * - expo-image for efficient image loading and caching
 */

import React, { useCallback, useMemo, memo } from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import { MediaAsset } from "../hooks";
import { usePhotoAlbumStore } from "../store/photoAlbumStore";
import { Galeria } from "@nandorojo/galeria";

const ITEM_SIZE = 80;
const ITEM_HEIGHT = ITEM_SIZE * 1.4;
const ITEM_SPACING = 8;
const PADDING_HORIZONTAL = 20;

// Total width of each item including spacing
const ESTIMATED_ITEM_WIDTH = ITEM_SIZE + ITEM_SPACING;

interface GalleryCarouselProps {
  assets: MediaAsset[];
}

interface CarouselItemProps {
  asset: MediaAsset;
  index: number;
  hasAlbumAssociation: boolean;
}

// Memoized carousel item to prevent unnecessary re-renders
const CarouselItem = memo<CarouselItemProps>(
  ({ asset, index, hasAlbumAssociation }) => {
    const thumb = asset.thumbnailUrl ?? asset.uri;

    return (
      <Galeria.Image index={index} style={styles.imageItem}>
        <View style={styles.imageContent}>
          <Image
            source={{ uri: thumb }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          {asset.mediaType === "video" && (
            <View style={styles.videoIndicator}>
              <Ionicons name="play" size={14} color="#fff" />
            </View>
          )}
          {hasAlbumAssociation && (
            <View style={styles.albumIndicator}>
              <Ionicons name="albums" size={8} color="#fff" />
            </View>
          )}
        </View>
      </Galeria.Image>
    );
  },
  (prev, next) =>
    prev.asset.id === next.asset.id &&
    prev.index === next.index &&
    prev.hasAlbumAssociation === next.hasAlbumAssociation
);

// Cast FlashList to bypass type definition mismatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HorizontalFlashList = FlashList as any;

const GalleryCarousel: React.FC<GalleryCarouselProps> = ({ assets }) => {
  // Pre-compute album associations map for O(1) lookup in renderItem
  const associations = usePhotoAlbumStore((state) => state.associations);

  // Memoize gallery URLs for Galeria popup
  const galleryUrls = useMemo(
    () => assets.map((asset) => asset.thumbnailUrl ?? asset.uri),
    [assets]
  );

  // Check if asset has album association using pre-computed map
  const hasAlbumAssociation = useCallback(
    (uri: string): boolean => {
      const normalizedUri = uri.replace(/^file:\/\//, "");
      return normalizedUri in associations;
    },
    [associations]
  );

  // Memoized render function
  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<MediaAsset>) => (
      <CarouselItem
        asset={item}
        index={index}
        hasAlbumAssociation={hasAlbumAssociation(item.uri)}
      />
    ),
    [hasAlbumAssociation]
  );

  // Stable key extractor
  const keyExtractor = useCallback((item: MediaAsset) => item.id, []);

  if (assets.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="images-outline" size={32} color="#ccc" />
      </View>
    );
  }

  return (
    <Galeria urls={galleryUrls} theme="dark">
      <View style={styles.listContainer}>
        <HorizontalFlashList
          data={assets}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          estimatedItemSize={ESTIMATED_ITEM_WIDTH}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
        />
      </View>
      <Galeria.Popup />
    </Galeria>
  );
};

const styles = StyleSheet.create({
  listContainer: {
    height: ITEM_HEIGHT,
  },
  contentContainer: {
    paddingHorizontal: PADDING_HORIZONTAL,
  },
  imageItem: {
    width: ITEM_SIZE,
    height: ITEM_HEIGHT,
    borderRadius: 12,
    marginRight: ITEM_SPACING,
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
  },
  imageContent: {
    width: "100%",
    height: "100%",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  videoIndicator: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  albumIndicator: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 4,
    padding: 3,
  },
  emptyContainer: {
    height: ITEM_SIZE,
    marginHorizontal: 20,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default GalleryCarousel;
