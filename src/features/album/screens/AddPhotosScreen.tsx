import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  FadeIn,
  FadeOut,
  ZoomIn,
  SlideOutLeft,
  SlideInRight,
} from "react-native-reanimated";

import albumApi from "../api/album.api";
import { photoKeys } from "../api/photo.queries";
import { usePhotoAlbumStore } from "../store/photoAlbumStore";
import { usePendingUploadsStore } from "../store/pendingUploadsStore";
import { useGetAlbumQuery } from "../api/album.queries";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const GRID_SPACING = 2;
const ITEM_SIZE =
  (SCREEN_WIDTH - GRID_SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

// Animated component for showing current upload with success animation
const AnimatedUploadPhoto = ({
  uri,
  isComplete,
}: {
  uri: string;
  isComplete: boolean;
}) => {
  const successOpacity = useSharedValue(0);
  const successScale = useSharedValue(0.5);
  const checkScale = useSharedValue(0);

  useEffect(() => {
    if (isComplete) {
      successOpacity.value = withTiming(1, { duration: 300 });
      successScale.value = withSpring(1, { damping: 12, stiffness: 200 });
      checkScale.value = withDelay(
        150,
        withSpring(1, { damping: 10, stiffness: 300 })
      );
    } else {
      successOpacity.value = 0;
      successScale.value = 0.5;
      checkScale.value = 0;
    }
  }, [isComplete, successOpacity, successScale, checkScale]);

  const successOverlayStyle = useAnimatedStyle(() => ({
    opacity: successOpacity.value,
    transform: [{ scale: successScale.value }],
  }));

  const checkmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  return (
    <View style={styles.uploadPhotoContainer}>
      <Animated.View
        entering={SlideInRight.duration(400).springify()}
        exiting={SlideOutLeft.duration(300)}
        style={styles.uploadPhotoWrapper}
      >
        <Image
          source={{ uri }}
          style={styles.uploadPhoto}
          contentFit="cover"
          transition={200}
        />
        {!isComplete && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={styles.uploadingOverlay}
          >
            <View style={styles.uploadingSpinner}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          </Animated.View>
        )}
        <Animated.View style={[styles.successOverlay, successOverlayStyle]}>
          <Animated.View style={[styles.successCheckCircle, checkmarkStyle]}>
            <Ionicons name="checkmark" size={40} color="#fff" />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

// Progress dots showing upload queue
const ProgressDots = ({
  total,
  current,
  uploadedCount,
}: {
  total: number;
  current: number;
  uploadedCount: number;
}) => {
  const maxDots = Math.min(total, 7);
  const dots = [];

  for (let i = 0; i < maxDots; i++) {
    const isCompleted = i < uploadedCount;
    const isCurrent = i === current;
    const isPending = i > current;

    dots.push(
      <Animated.View
        key={i}
        entering={ZoomIn.delay(i * 50).duration(200)}
        style={[
          styles.progressDot,
          isCompleted && styles.progressDotCompleted,
          isCurrent && styles.progressDotCurrent,
          isPending && styles.progressDotPending,
        ]}
      >
        {isCompleted && (
          <Ionicons name="checkmark" size={10} color="#fff" />
        )}
      </Animated.View>
    );
  }

  if (total > maxDots) {
    dots.push(
      <Animated.View
        key="more"
        entering={ZoomIn.delay(maxDots * 50).duration(200)}
        style={styles.progressDotMore}
      >
        <Text style={styles.progressDotMoreText}>+{total - maxDots}</Text>
      </Animated.View>
    );
  }

  return <View style={styles.progressDotsContainer}>{dots}</View>;
};

const AddPhotosScreen: React.FC = () => {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: album } = useGetAlbumQuery(albumId as string);

  // Get assets from store (set by GalleryPage before navigating here)
  const pendingAssets = usePendingUploadsStore((s) => s.assets);
  const addPendingAssets = usePendingUploadsStore((s) => s.addAssets);
  const clearPendingAssets = usePendingUploadsStore((s) => s.clearAssets);
  const removeAsset = usePendingUploadsStore((s) => s.removeAsset);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadedCount, setUploadedCount] = useState(0);
  const [currentUploadUri, setCurrentUploadUri] = useState<string | null>(null);
  const uploadCompletedRef = useRef(false);

  const addAssociation = usePhotoAlbumStore((state) => state.addAssociation);

  const inferMimeType = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".heic")) return "image/heic";
    if (lower.endsWith(".heif")) return "image/heif";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    return "image/jpeg";
  };

  const openImagePicker = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 1,
      selectionLimit: 20,
    });

    if (!result.canceled && result.assets.length > 0) {
      const assets = result.assets.map((asset) => {
        const fileName = asset.fileName || asset.uri.split("/").pop() || "photo.jpg";
        return {
          uri: asset.uri,
          fileName,
          mimeType: asset.mimeType || inferMimeType(fileName),
        };
      });
      addPendingAssets(assets);
    }
  }, [addPendingAssets]);

  // Go back if no assets on initial mount (shouldn't happen normally)
  // Skip if upload just completed (we handle navigation in handleUpload)
  useEffect(() => {
    if (pendingAssets.length === 0 && !uploadCompletedRef.current) {
      router.back();
    }
  }, [pendingAssets.length, router]);

  const handleUpload = useCallback(async () => {
    if (!pendingAssets.length || uploading || !albumId) return;

    setUploading(true);
    setUploadError(null);
    setUploadProgress({ current: 0, total: pendingAssets.length });
    setUploadedCount(0);
    setCurrentUploadUri(null);

    try {
      for (let i = 0; i < pendingAssets.length; i++) {
        const asset = pendingAssets[i];

        setCurrentUploadUri(asset.uri);
        setUploadProgress({ current: i, total: pendingAssets.length });

        await albumApi.uploadPhoto({
          albumId: albumId as string,
          fileUri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
        });

        addAssociation(asset.uri, albumId as string, album?.title ?? "Album");
        setUploadedCount((prev) => prev + 1);

        // Wait for success animation
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      setUploadProgress({ current: pendingAssets.length, total: pendingAssets.length });

      uploadCompletedRef.current = true;
      clearPendingAssets();
      queryClient.invalidateQueries({ queryKey: photoKeys.byAlbum(albumId) });
      queryClient.invalidateQueries({ queryKey: ["albums", albumId] });
      router.back();
    } catch (error) {
      console.error("Upload failed", error);
      setUploadError("Failed to upload photos. Please try again.");
    } finally {
      setUploading(false);
      setCurrentUploadUri(null);
    }
  }, [addAssociation, album?.title, albumId, clearPendingAssets, pendingAssets, queryClient, router, uploading]);

  const selectedCount = pendingAssets.length;

  // Show nothing if no assets
  if (pendingAssets.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>
          {selectedCount} photo{selectedCount !== 1 ? "s" : ""} selected
        </Text>
        <Pressable style={styles.addMoreButton} onPress={openImagePicker}>
          <Ionicons name="add" size={18} color="#111" />
          <Text style={styles.addMoreText}>Add more</Text>
        </Pressable>
      </View>

      {/* Selected photos grid */}
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.gridContainer}
        showsVerticalScrollIndicator={false}
      >
        {pendingAssets.map((asset) => (
          <View key={asset.uri} style={styles.gridItem}>
            <Image
              source={{ uri: asset.uri }}
              style={styles.gridImage}
              contentFit="cover"
            />
            <Pressable
              style={styles.removeButton}
              onPress={() => removeAsset(asset.uri)}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[
            styles.primaryButton,
            (!selectedCount || uploading) && styles.buttonDisabled,
          ]}
          onPress={handleUpload}
          disabled={!selectedCount || uploading}
        >
          <Text
            style={[
              styles.primaryButtonText,
              (!selectedCount || uploading) && styles.buttonDisabledText,
            ]}
          >
            {uploading
              ? "Uploading..."
              : `Upload ${selectedCount} photo${selectedCount !== 1 ? "s" : ""}`}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={18}
            color={selectedCount && !uploading ? "#fff" : "#c5c5c5"}
            style={{ marginLeft: 6 }}
          />
        </Pressable>
      </View>

      {/* Upload progress overlay */}
      {uploading && (
        <View style={styles.loadingOverlay}>
          <Animated.View
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(200)}
            style={styles.loadingCard}
          >
            <ProgressDots
              total={uploadProgress.total}
              current={uploadProgress.current}
              uploadedCount={uploadedCount}
            />

            {currentUploadUri && (
              <AnimatedUploadPhoto
                key={currentUploadUri}
                uri={currentUploadUri}
                isComplete={uploadedCount > uploadProgress.current}
              />
            )}

            <Animated.Text
              entering={FadeIn.delay(100).duration(200)}
              style={styles.loadingTitle}
            >
              {uploadedCount === uploadProgress.total
                ? "All photos uploaded!"
                : `Uploading ${uploadProgress.current + 1} of ${uploadProgress.total}`}
            </Animated.Text>

            <View style={styles.progressBarContainer}>
              <Animated.View
                style={[
                  styles.progressBar,
                  {
                    width: `${(uploadedCount / uploadProgress.total) * 100}%`,
                  },
                ]}
              />
            </View>

            <Text style={styles.loadingSubtitle}>
              Keep the app open until it finishes
            </Text>
          </Animated.View>
        </View>
      )}

      {uploadError && (
        <View style={styles.errorToast}>
          <Text style={styles.errorText}>{uploadError}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5e5",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
  },
  addMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addMoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
  },
  scrollContainer: {
    flex: 1,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingLeft: GRID_SPACING,
    paddingTop: GRID_SPACING,
    paddingBottom: 100,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    marginRight: GRID_SPACING,
    marginBottom: GRID_SPACING,
  },
  gridImage: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  removeButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e5e5",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  buttonDisabled: {
    backgroundColor: "#e5e5e5",
  },
  buttonDisabledText: {
    color: "#a0a0a0",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "86%",
    alignItems: "center",
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  loadingTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111",
  },
  loadingSubtitle: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
  },
  progressBarContainer: {
    width: "100%",
    height: 6,
    backgroundColor: "#e5e5e5",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#111",
    borderRadius: 3,
  },
  errorToast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 120,
    backgroundColor: "#fceaea",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#f3c6c6",
  },
  errorText: {
    color: "#b3261e",
    fontSize: 13,
    textAlign: "center",
  },
  uploadPhotoContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  uploadPhotoWrapper: {
    width: SCREEN_WIDTH * 0.55,
    height: SCREEN_WIDTH * 0.55,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  uploadPhoto: {
    width: "100%",
    height: "100%",
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadingSpinner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(34, 197, 94, 0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  successCheckCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  progressDotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  progressDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#e5e5e5",
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotCompleted: {
    backgroundColor: "#22c55e",
  },
  progressDotCurrent: {
    backgroundColor: "#111",
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  progressDotPending: {
    backgroundColor: "#e5e5e5",
  },
  progressDotMore: {
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#e5e5e5",
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotMoreText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666",
  },
});

export default AddPhotosScreen;
