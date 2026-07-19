/**
 * AlbumGallery Component
 * Displays album photos in a performant virtualized grid, ordered by latest first
 */

import React, { useCallback, memo, useMemo } from "react";
import { StyleSheet, View, Dimensions, ActivityIndicator } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import { MediaAsset } from "../hooks";
import { CachedImage } from "@/components/ui/CachedImage";
import { Galeria } from "@nandorojo/galeria";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const GRID_SPACING = 2;
const ITEM_SIZE =
  (SCREEN_WIDTH - GRID_SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;
const ROW_HEIGHT = ITEM_SIZE + GRID_SPACING;

interface AlbumGalleryProps {
  assets: MediaAsset[];
  isLoading?: boolean;
}

interface GalleryItemProps {
  asset: MediaAsset;
  index: number;
}

const GalleryItem = memo<GalleryItemProps>(
  ({ asset, index }) => {
    return (
      <Galeria.Image index={index} style={styles.itemContainer}>
        <View style={styles.itemContent}>
          <CachedImage
            uri={asset.thumbnailUrl ?? asset.uri}
            style={styles.image}
            showPlaceholder={false}
          />
          {asset.mediaType === "video" && (
            <View style={styles.videoIndicator}>
              <Ionicons name="play" size={14} color="#fff" />
            </View>
          )}
        </View>
      </Galeria.Image>
    );
  },
  (prev, next) => prev.asset.id === next.asset.id,
);

const EmptyState = memo(() => (
  <View style={styles.emptyContainer}>
    <Ionicons name="images-outline" size={48} color="#ccc" />
    <Text style={styles.emptyText}>No photos yet</Text>
    <Text style={styles.emptySubtext}>
      Photos added to this album will appear here
    </Text>
  </View>
));

const LoadingFooter = memo(() => (
  <View style={styles.loadingFooter}>
    <ActivityIndicator size="small" color="#666" />
  </View>
));

export const AlbumGallery: React.FC<AlbumGalleryProps> = ({
  assets,
  isLoading,
}) => {
  // Sort by latest first (creationTime descending) - memoized
  const sortedAssets = useMemo(
    () =>
      [...assets].sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0)),
    [assets],
  );

  const galleryUrls = useMemo(
    () => sortedAssets.map((asset) => asset.uri),
    [sortedAssets],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<MediaAsset>) => (
      <GalleryItem asset={item} index={index} />
    ),
    [],
  );

  const keyExtractor = useCallback((item: MediaAsset) => item.id, []);

  const overrideItemLayout = useCallback(
    (
      layout: { size: number; span?: number },
      _item: MediaAsset,
      _index: number,
    ) => {
      layout.size = ROW_HEIGHT;
      layout.span = 1;
    },
    [],
  );

  const renderFooter = useCallback(() => {
    if (!isLoading) return null;
    return <LoadingFooter />;
  }, [isLoading]);

  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#666" />
        </View>
      );
    }
    return <EmptyState />;
  }, [isLoading]);

  return (
    <Galeria urls={galleryUrls} theme="dark">
      <FlashList
        data={sortedAssets}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={NUM_COLUMNS}
        estimatedItemSize={ROW_HEIGHT}
        contentContainerStyle={styles.container}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        overrideItemLayout={overrideItemLayout}
        scrollEnabled={false}
      />
      <Galeria.Popup />
    </Galeria>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: GRID_SPACING,
    paddingBottom: 100,
    flexGrow: 1,
  },
  itemContainer: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    marginHorizontal: GRID_SPACING / 2,
    marginBottom: GRID_SPACING,
    borderRadius: 4,
    overflow: "hidden",
  },
  itemContent: {
    width: "100%",
    height: "100%",
    flex: 1,
  },
  image: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f0f0f0",
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingFooter: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});

export default AlbumGallery;
