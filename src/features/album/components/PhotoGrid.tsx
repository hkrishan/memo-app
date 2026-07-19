/**
 * PhotoGrid Component
 * Displays photos in a performant grid layout
 */

import React, { useCallback, memo, useMemo } from "react";
import { StyleSheet, View, Dimensions, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { MediaAsset } from "../hooks";
import { usePhotoAlbumStore } from "../store/photoAlbumStore";
import { Galeria } from "@nandorojo/galeria";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const GRID_SPACING = 2;
const ITEM_SIZE =
  (SCREEN_WIDTH - GRID_SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;
const ROW_HEIGHT = ITEM_SIZE + GRID_SPACING;

interface PhotoGridProps {
  assets: MediaAsset[];
  onEndReached?: () => void;
  isLoading?: boolean;
  ListHeaderComponent?: React.ReactElement;
  showAlbumIndicator?: boolean;
}

interface PhotoItemProps {
  asset: MediaAsset;
  albumTitle?: string | null;
  index: number;
}

const PhotoItem = memo<PhotoItemProps>(
  ({ asset, albumTitle, index }) => {
    return (
      <Galeria.Image index={index} style={styles.itemContainer}>
        <View style={styles.itemContent}>
          <Image
            source={{ uri: asset.thumbnailUrl ?? asset.uri }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          {asset.mediaType === "video" && (
            <View style={styles.videoIndicator}>
              <Ionicons name="play" size={14} color="#fff" />
            </View>
          )}
          {albumTitle && (
            <View style={styles.albumIndicator}>
              <Ionicons name="albums" size={10} color="#fff" />
              <Text style={styles.albumText} numberOfLines={1}>
                {albumTitle}
              </Text>
            </View>
          )}
        </View>
      </Galeria.Image>
    );
  },
  (prev, next) =>
    prev.asset.id === next.asset.id && prev.albumTitle === next.albumTitle,
);

export const PhotoGrid: React.FC<PhotoGridProps> = ({
  assets,
  onEndReached,
  isLoading,
  ListHeaderComponent,
  showAlbumIndicator = false,
}) => {
  const getAlbumForPhoto = usePhotoAlbumStore(
    (state) => state.getAlbumForPhoto,
  );
  const galleryUrls = useMemo(() => assets.map((asset) => asset.uri), [assets]);

  const renderItem = useCallback(
    ({ item, index }: { item: MediaAsset; index: number }) => {
      const albumAssociation = showAlbumIndicator
        ? getAlbumForPhoto(item.uri)
        : null;
      return (
        <PhotoItem
          asset={item}
          index={index}
          albumTitle={albumAssociation?.albumTitle}
        />
      );
    },
    [showAlbumIndicator, getAlbumForPhoto],
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
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color="#666" />
      </View>
    );
  }, [isLoading]);

  return (
    <Galeria urls={galleryUrls} theme="dark">
      <FlashList
        data={assets}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={NUM_COLUMNS}
        estimatedItemSize={ROW_HEIGHT}
        contentContainerStyle={styles.gridContainer}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListFooterComponent={renderFooter}
        ListHeaderComponent={ListHeaderComponent}
        showsVerticalScrollIndicator={false}
        overrideItemLayout={overrideItemLayout}
      />
      <Galeria.Popup />
    </Galeria>
  );
};

const styles = StyleSheet.create({
  gridContainer: {
    paddingHorizontal: GRID_SPACING,
    paddingBottom: 100,
  },
  itemContainer: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    marginHorizontal: GRID_SPACING / 2,
    marginBottom: GRID_SPACING,
  },
  itemContent: {
    flex: 1,
    width: "100%",
    height: "100%",
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
  albumIndicator: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 3,
  },
  albumText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "500",
    flex: 1,
  },
  loadingFooter: {
    paddingVertical: 20,
    alignItems: "center",
  },
});

export default PhotoGrid;
