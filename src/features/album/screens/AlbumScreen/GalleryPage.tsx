import React, { memo, useCallback } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  SharedValue,
  useAnimatedScrollHandler,
} from "react-native-reanimated";
import { IconButton, Text } from "react-native-paper";
import * as ImagePicker from "expo-image-picker";

import { AlbumHeader, HEADER_HEIGHT } from "../../components";
import { MediaAsset } from "../../hooks";
import PhotoItem from "./PhotoItem";
import { Galeria } from "@nandorojo/galeria";
import { useRouter } from "expo-router";
import { usePendingUploadsStore } from "../../store/pendingUploadsStore";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 4;
const GRID_SPACING = 2;
const ITEM_SIZE =
  (SCREEN_WIDTH - GRID_SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;
const ROW_HEIGHT = ITEM_SIZE + GRID_SPACING;

// Cast to any to bypass FlashList type definition mismatch with installed version
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as any,
) as any;

interface GalleryPageProps {
  album: any;
  assets: MediaAsset[];
  galleryUrls: string[];
  isLoading: boolean;
  galleryScrollY: SharedValue<number>;
}

const GalleryPage: React.FC<GalleryPageProps> = ({
  album,
  assets,
  galleryUrls,
  isLoading,
  galleryScrollY,
}) => {
  const router = useRouter();

  const renderPhoto = useCallback(
    ({ item, index }: ListRenderItemInfo<MediaAsset>) => (
      <PhotoItem
        asset={item}
        index={index}
        itemSize={ITEM_SIZE}
        spacing={GRID_SPACING}
      />
    ),
    [],
  );

  const keyExtractor = useCallback((item: MediaAsset) => item.id, []);

  const overrideItemLayout = useCallback(
    (
      layout: { size?: number; span?: number },
      _item: MediaAsset,
      _index: number,
    ) => {
      layout.size = ROW_HEIGHT;
      layout.span = 1;
    },
    [],
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      "worklet";
      galleryScrollY.value = e.contentOffset.y;
    },
  });

  const setAssets = usePendingUploadsStore((s) => s.setAssets);

  const handleAddPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 1,
      selectionLimit: 20,
    });

    if (!result.canceled && result.assets.length > 0) {
      const selectedAssets = result.assets.map((asset) => {
        const fileName = asset.fileName || asset.uri.split("/").pop() || "photo.jpg";
        const lower = fileName.toLowerCase();
        let mimeType = asset.mimeType || "image/jpeg";
        if (!asset.mimeType) {
          if (lower.endsWith(".png")) mimeType = "image/png";
          else if (lower.endsWith(".heic")) mimeType = "image/heic";
          else if (lower.endsWith(".gif")) mimeType = "image/gif";
        }
        return { uri: asset.uri, fileName, mimeType };
      });
      setAssets(selectedAssets);
      router.push(`/album/${album?.albumId}/add-photos`);
    }
  }, [router, album?.albumId, setAssets]);

  return (
    <View style={styles.pageGallery}>
      <Galeria urls={galleryUrls} theme="dark">
        <AlbumHeader album={album} scrollY={galleryScrollY} />
        <AnimatedFlashList
          data={assets}
          renderItem={renderPhoto}
          keyExtractor={keyExtractor}
          numColumns={NUM_COLUMNS}
          estimatedItemSize={ROW_HEIGHT}
          ListHeaderComponent={<View style={{ height: HEADER_HEIGHT }} />}
          ListEmptyComponent={isLoading ? null : EmptyGallery}
          contentContainerStyle={galleryContent(GRID_SPACING)}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          overrideItemLayout={overrideItemLayout}
        />
        <Galeria.Popup />
      </Galeria>
      <View
        style={{
          position: "absolute",
          bottom: 110,
          left: (SCREEN_WIDTH - 60) / 2,
          width: 60,
          height: 60,
        }}
      >
        <IconButton
          icon="plus"
          iconColor="#fff"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 30,
            backgroundColor: "#000",
          }}
          onPress={handleAddPhoto}
        />
      </View>
    </View>
  );
};

const EmptyGallery = memo(() => (
  <View style={styles.emptyContainer}>
    <Ionicons name="images-outline" size={48} color="#ccc" />
    <Text style={styles.emptyText}>No photos yet</Text>
  </View>
));

const styles = StyleSheet.create({
  pageGallery: {
    flex: 1,
    backgroundColor: "#fff",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    color: "#888",
  },
});

const galleryContent = (spacing: number) => ({
  paddingHorizontal: spacing,
  paddingBottom: 100,
  backgroundColor: "#fff",
  flexGrow: 1,
});

export default GalleryPage;
