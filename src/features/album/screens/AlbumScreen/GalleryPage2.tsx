import React, { memo, useCallback } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SharedValue, useAnimatedScrollHandler } from "react-native-reanimated";
import { IconButton, Text } from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";

import { AlbumHeader, HEADER_HEIGHT } from "../../components";
import { MediaAsset } from "../../hooks";
import { usePendingUploadsStore } from "../../store/pendingUploadsStore";
import ImageGallery from "@/components/ImageGallery";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 4;
const GRID_SPACING = 2;

interface GalleryPage2Props {
  album: any;
  assets: MediaAsset[];
  isLoading: boolean;
  galleryScrollY: SharedValue<number>;
}

const GalleryPage2: React.FC<GalleryPage2Props> = ({
  album,
  assets,
  isLoading,
  galleryScrollY,
}) => {
  const router = useRouter();
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
        const fileName =
          asset.fileName || asset.uri.split("/").pop() || "photo.jpg";
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

  const getId = useCallback((item: MediaAsset) => item.id, []);
  const getUri = useCallback(
    (item: MediaAsset) => item.thumbnailUrl ?? item.uri,
    [],
  );
  const getFullUri = useCallback((item: MediaAsset) => item.uri, []);
  const getAspectRatio = useCallback(
    (item: MediaAsset) =>
      item.width && item.height ? item.width / item.height : 1,
    [],
  );

  return (
    <View style={styles.pageGallery}>
      <AlbumHeader album={album} scrollY={galleryScrollY} />

      {assets.length === 0 && !isLoading ? (
        <EmptyGallery />
      ) : (
        <View style={styles.galleryContainer}>
          <ImageGallery
            data={assets}
            getId={getId}
            getUri={getUri}
            getFullUri={getFullUri}
            getAspectRatio={getAspectRatio}
            numColumns={NUM_COLUMNS}
            spacing={GRID_SPACING}
          />
        </View>
      )}

      <View style={styles.addButtonContainer}>
        <IconButton
          icon="plus"
          iconColor="#fff"
          style={styles.addButton}
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
  galleryContainer: {
    flex: 1,
    marginTop: HEADER_HEIGHT,
    paddingHorizontal: GRID_SPACING,
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
  addButtonContainer: {
    position: "absolute",
    bottom: 110,
    left: (SCREEN_WIDTH - 60) / 2,
    width: 60,
    height: 60,
  },
  addButton: {
    width: "100%",
    height: "100%",
    borderRadius: 30,
    backgroundColor: "#000",
  },
});

export default GalleryPage2;
