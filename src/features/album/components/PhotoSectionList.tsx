import React, { useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Image,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { Galeria } from "@nandorojo/galeria";
import { FlashList } from "@shopify/flash-list";
import { MediaAsset } from "../hooks";
import { usePhotoAlbumStore } from "../store/photoAlbumStore";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const GRID_SPACING = 2;
const ITEM_SIZE =
  (SCREEN_WIDTH - GRID_SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;
const ROW_HEIGHT = ITEM_SIZE + GRID_SPACING;

interface PhotoSectionListProps {
  assets: MediaAsset[];
  ListHeaderComponent?: React.ReactElement;
  isLoading?: boolean;
  showAlbumIndicator?: boolean;
}

interface PhotoItemProps {
  asset: MediaAsset;
  albumTitle?: string | null;
  index: number;
}

const PhotoItem: React.FC<PhotoItemProps> = ({ asset, albumTitle, index }) => (
  <Galeria.Image index={index} url={asset.uri} style={styles.itemContainer}>
    <View style={styles.itemContent}>
      <Image
        source={{ uri: asset.thumbnailUrl ?? asset.uri }}
        style={styles.image}
        fadeDuration={0}
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

export const PhotoSectionList: React.FC<PhotoSectionListProps> = ({
  assets,
  ListHeaderComponent,
  isLoading,
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
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={renderFooter}
        overrideItemLayout={overrideItemLayout}
      />
      <Galeria.Popup />
    </Galeria>
  );
};

const styles = StyleSheet.create({
  listContainer: {
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

export default PhotoSectionList;
