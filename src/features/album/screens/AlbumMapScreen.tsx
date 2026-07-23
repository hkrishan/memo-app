import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";

import { useGetPhotosQuery } from "../api/photo.queries";
import { AlbumMap } from "../components";
import { PhotoWithUploader } from "../types/album.types";
import { MediaAsset } from "../hooks";
import { PhotoViewer } from "@/features/photos/components";

const BACK_BUTTON_SIZE = 44;

const photoToMediaAsset = (photo: PhotoWithUploader): MediaAsset => ({
  id: photo.photoId,
  uri: photo.url,
  // Videos keep a null poster null — the viewer shows a dark play-glyph
  // tile instead of pointing expo-image at an unrenderable video URL
  thumbnailUrl:
    photo.mediaType === "video"
      ? (photo.thumbnailUrl ?? null)
      : (photo.thumbnailUrl ?? photo.url),
  mediaType: photo.mediaType === "video" ? "video" : "photo",
  width: 0,
  height: 0,
  duration: 0,
  creationTime: new Date(photo.createdAt).getTime(),
  modificationTime: new Date(photo.createdAt).getTime(),
});

const AlbumMapScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { albumId } = useLocalSearchParams<{ albumId: string }>();

  const { data: photos } = useGetPhotosQuery(albumId);

  // Photos of the tapped marker (single or cluster). Kept mounted after
  // closing — emptying the assets in the same commit that hides the modal
  // makes the last frame flash an empty pager.
  const [previewAssets, setPreviewAssets] = useState<MediaAsset[]>([]);
  const [previewVisible, setPreviewVisible] = useState(false);

  const handleBack = useCallback(() => router.back(), [router]);

  const handlePressPhotos = useCallback((pressed: PhotoWithUploader[]) => {
    setPreviewAssets(pressed.map(photoToMediaAsset));
    setPreviewVisible(true);
  }, []);

  const handleClosePreview = useCallback(() => setPreviewVisible(false), []);

  const backButtonInner = (
    <Ionicons name="chevron-back" size={24} color="#000" />
  );

  return (
    <View style={styles.container}>
      <AlbumMap photos={photos} onPressPhotos={handlePressPhotos} />

      <Pressable
        onPress={handleBack}
        style={[styles.backButton, { top: insets.top + 8 }]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        {isLiquidGlassAvailable() ? (
          <GlassView
            style={styles.backButtonFill}
            glassEffectStyle="regular"
            isInteractive
          >
            {backButtonInner}
          </GlassView>
        ) : (
          <BlurView intensity={40} tint="light" style={styles.backButtonFill}>
            {backButtonInner}
          </BlurView>
        )}
      </Pressable>

      <PhotoViewer
        visible={previewVisible}
        assets={previewAssets}
        initialIndex={0}
        onClose={handleClosePreview}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  backButton: {
    position: "absolute",
    left: 16,
    width: BACK_BUTTON_SIZE,
    height: BACK_BUTTON_SIZE,
  },
  backButtonFill: {
    width: "100%",
    height: "100%",
    borderRadius: BACK_BUTTON_SIZE / 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default AlbumMapScreen;
