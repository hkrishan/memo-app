import React, { useState, useCallback, useMemo, memo } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Text,
  Dimensions,
  FlatList,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useCreatePostMutation } from "../api/pagePost.queries";
import { useGetPhotosQuery } from "@/features/album/api/photo.queries";
import { PhotoWithUploader } from "@/features/album/types/album.types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SELECTED_THUMBNAIL_SIZE = (SCREEN_WIDTH - 48 - 16) / 4;
const NUM_COLUMNS = 3;
const GRID_SPACING = 2;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - GRID_SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

// Memoized grid item for performance
const GridItem = memo<{
  photo: PhotoWithUploader;
  isSelected: boolean;
  selectionIndex: number;
  onToggle: (photo: PhotoWithUploader) => void;
}>(({ photo, isSelected, selectionIndex, onToggle }) => {
  const handlePress = useCallback(() => {
    onToggle(photo);
  }, [photo, onToggle]);

  return (
    <Pressable onPress={handlePress} style={styles.gridItem}>
      <Image
        source={{ uri: photo.thumbnailUrl ?? photo.url }}
        style={styles.gridImage}
        contentFit="cover"
        recyclingKey={photo.photoId}
        transition={100}
      />
      <View
        style={[
          styles.selectionOverlay,
          isSelected && styles.selectionOverlaySelected,
        ]}
      >
        {isSelected ? (
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedBadgeText}>{selectionIndex + 1}</Text>
          </View>
        ) : (
          <View style={styles.unselectedCircle} />
        )}
      </View>
    </Pressable>
  );
});

type SelectedPhoto = {
  id: string;
  uri: string;
  thumbnailUri?: string;
};

type PostLocation = {
  latitude: number;
  longitude: number;
  /** City-level label from reverse geocoding; null when it failed. */
  name: string | null;
};

const CreatePostScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { albumId, pageId } = useLocalSearchParams<{
    albumId: string;
    pageId: string;
  }>();

  const [caption, setCaption] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postLocation, setPostLocation] = useState<PostLocation | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);

  const { data: photos, isLoading: isLoadingPhotos } = useGetPhotosQuery(albumId ?? "");
  const createPostMutation = useCreatePostMutation();

  // Sort photos newest first
  const sortedPhotos = useMemo(() => {
    if (!photos) return [];
    return [...photos].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [photos]);

  const isValid = useMemo(() => {
    return selectedPhotos.length > 0;
  }, [selectedPhotos]);

  const selectedIds = useMemo(() => {
    return new Set(selectedPhotos.map((p) => p.id));
  }, [selectedPhotos]);

  const handleBack = useCallback(() => {
    if (selectedPhotos.length > 0 || caption.trim()) {
      Alert.alert(
        "Discard Post?",
        "You have unsaved changes. Are you sure you want to discard them?",
        [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => router.back(),
          },
        ]
      );
    } else {
      router.back();
    }
  }, [selectedPhotos, caption, router]);

  const handleTogglePhoto = useCallback((photo: PhotoWithUploader) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPhotos((prev) => {
      const exists = prev.find((p) => p.id === photo.photoId);
      if (exists) {
        return prev.filter((p) => p.id !== photo.photoId);
      }
      if (prev.length >= 10) {
        return prev;
      }
      return [
        ...prev,
        {
          id: photo.photoId,
          uri: photo.url,
          thumbnailUri: photo.thumbnailUrl ?? undefined,
        },
      ];
    });
  }, []);

  const handleRemovePhoto = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleDragEnd = useCallback(
    ({ data }: { data: SelectedPhoto[] }) => {
      setSelectedPhotos(data);
    },
    []
  );

  // Tap to attach "where I am" (tap again to clear). The permission ask is
  // contextual — it fires from this explicit tap, so requesting here is
  // fine even though useCaptureLocation itself never prompts. The label is
  // city-level on purpose: posts are public-ish (page followers, web), so
  // never expose a street address.
  const handleToggleLocation = useCallback(async () => {
    if (isFetchingLocation) return;
    if (postLocation) {
      setPostLocation(null);
      Haptics.selectionAsync().catch(() => {});
      return;
    }
    setIsFetchingLocation(true);
    try {
      let { status, canAskAgain } =
        await Location.getForegroundPermissionsAsync();
      if (status !== "granted" && canAskAgain) {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== "granted") {
        Alert.alert(
          "Location unavailable",
          "Allow location access in Settings to tag posts with where you are.",
        );
        return;
      }
      // A recent cached fix is instant; otherwise get a fresh one
      let position = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
      });
      if (!position) {
        position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      }
      const { latitude, longitude } = position.coords;
      let name: string | null = null;
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        name =
          place?.city ?? place?.district ?? place?.subregion ?? place?.region ?? null;
      } catch {
        // A label-less location is still worth keeping (coordinates saved)
      }
      setPostLocation({ latitude, longitude, name });
      Haptics.selectionAsync().catch(() => {});
    } catch {
      Alert.alert(
        "Location unavailable",
        "Couldn't get your current location. Try again in a moment.",
      );
    } finally {
      setIsFetchingLocation(false);
    }
  }, [isFetchingLocation, postLocation]);

  const handleSubmit = useCallback(async () => {
    if (!isValid || isSubmitting || !albumId || !pageId) return;

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await createPostMutation.mutateAsync({
        albumId,
        pageId,
        input: {
          caption: caption.trim() || null,
          latitude: postLocation?.latitude ?? null,
          longitude: postLocation?.longitude ?? null,
          locationName: postLocation?.name ?? null,
          media: selectedPhotos.map((photo, index) => ({
            mediaType: "image" as const,
            url: photo.uri,
            thumbnailUrl: photo.thumbnailUri ?? null,
            sortOrder: index,
          })),
        },
      });

      router.back();
    } catch (error) {
      if (__DEV__) console.error("Failed to create post:", error);
      Alert.alert("Error", "Failed to create post. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isValid,
    isSubmitting,
    albumId,
    pageId,
    caption,
    postLocation,
    selectedPhotos,
    createPostMutation,
    router,
  ]);

  const renderSelectedItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<SelectedPhoto>) => (
      <ScaleDecorator>
        <Pressable
          onLongPress={drag}
          disabled={isActive}
          style={[
            styles.selectedThumb,
            isActive && styles.selectedThumbActive,
          ]}
        >
          <Image
            source={{ uri: item.thumbnailUri || item.uri }}
            style={styles.selectedThumbImage}
            contentFit="cover"
            recyclingKey={item.id}
            transition={100}
          />
          <Pressable
            onPress={() => handleRemovePhoto(item.id)}
            style={styles.removeButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={22} color="#fff" />
          </Pressable>
          <View style={styles.orderBadge}>
            <Text style={styles.orderBadgeText}>
              {selectedPhotos.findIndex((p) => p.id === item.id) + 1}
            </Text>
          </View>
        </Pressable>
      </ScaleDecorator>
    ),
    [handleRemovePhoto, selectedPhotos]
  );

  const renderGridItem = useCallback(
    ({ item }: { item: PhotoWithUploader }) => {
      const isSelected = selectedIds.has(item.photoId);
      const selectionIndex = selectedPhotos.findIndex((p) => p.id === item.photoId);

      return (
        <GridItem
          photo={item}
          isSelected={isSelected}
          selectionIndex={selectionIndex}
          onToggle={handleTogglePhoto}
        />
      );
    },
    [selectedIds, selectedPhotos, handleTogglePhoto]
  );

  const keyExtractor = useCallback((item: PhotoWithUploader) => item.photoId, []);

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: GRID_ITEM_SIZE + GRID_SPACING,
      offset: (GRID_ITEM_SIZE + GRID_SPACING) * Math.floor(index / NUM_COLUMNS),
      index,
    }),
    []
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={handleBack}
          style={styles.headerButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={28} color="#000" />
        </Pressable>
        <Text style={styles.headerTitle}>New Post</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={!isValid || isSubmitting}
          style={[
            styles.shareButton,
            (!isValid || isSubmitting) && styles.shareButtonDisabled,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text
              style={[
                styles.shareButtonText,
                (!isValid || isSubmitting) && styles.shareButtonTextDisabled,
              ]}
            >
              Share
            </Text>
          )}
        </Pressable>
      </View>

      {/* Selected photos strip */}
      {selectedPhotos.length > 0 && (
        <View style={styles.selectedSection}>
          <DraggableFlatList
            data={selectedPhotos}
            renderItem={renderSelectedItem}
            keyExtractor={(item) => item.id}
            onDragEnd={handleDragEnd}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectedList}
          />
          <Text style={styles.hint}>
            {selectedPhotos.length}/10 selected • Hold to reorder
          </Text>
        </View>
      )}

      {/* Caption input */}
      <View style={styles.captionSection}>
        <TextInput
          style={styles.captionInput}
          value={caption}
          onChangeText={setCaption}
          placeholder="Write a caption…"
          placeholderTextColor="#999"
          multiline
          maxLength={2200}
        />
      </View>

      {/* Optional location tag — tap to attach, tap again to clear */}
      <Pressable
        style={styles.locationRow}
        onPress={handleToggleLocation}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel={postLocation ? "Remove location" : "Add location"}
      >
        <Ionicons
          name={postLocation ? "location" : "location-outline"}
          size={20}
          color={postLocation ? "#111" : "#999"}
        />
        <Text
          style={[
            styles.locationText,
            postLocation && styles.locationTextActive,
          ]}
          numberOfLines={1}
        >
          {isFetchingLocation
            ? "Finding your location…"
            : postLocation
              ? (postLocation.name ?? "Location added")
              : "Add location"}
        </Text>
        {isFetchingLocation ? (
          <ActivityIndicator size="small" color="#999" />
        ) : postLocation ? (
          <Ionicons name="close-circle" size={20} color="#c7c7cc" />
        ) : null}
      </Pressable>

      {/* Album photos grid */}
      <View style={styles.gridSection}>
        <Text style={styles.sectionLabel}>Select from Album</Text>
        {isLoadingPhotos ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#000" />
          </View>
        ) : sortedPhotos.length > 0 ? (
          <FlatList
            data={sortedPhotos}
            renderItem={renderGridItem}
            keyExtractor={keyExtractor}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            getItemLayout={getItemLayout}
            initialNumToRender={12}
            maxToRenderPerBatch={9}
            windowSize={5}
            removeClippedSubviews
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No photos in this album yet</Text>
          </View>
        )}
      </View>
    </GestureHandlerRootView>
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  shareButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: "#000",
    borderRadius: 20,
    minWidth: 70,
    alignItems: "center",
  },
  shareButtonDisabled: {
    backgroundColor: "#e0e0e0",
  },
  shareButtonText: {
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#fff",
  },
  shareButtonTextDisabled: {
    color: "#999",
  },
  selectedSection: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  selectedList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  selectedThumb: {
    width: SELECTED_THUMBNAIL_SIZE,
    height: SELECTED_THUMBNAIL_SIZE,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
  },
  selectedThumbActive: {
    opacity: 0.8,
    transform: [{ scale: 1.05 }],
  },
  selectedThumbImage: {
    width: "100%",
    height: "100%",
  },
  removeButton: {
    position: "absolute",
    top: 2,
    right: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  orderBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "#000",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  orderBadgeText: {
    fontSize: 11,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
  },
  hint: {
    fontSize: 12,
    color: "#888",
    marginTop: 8,
    paddingHorizontal: 16,
  },
  captionSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  locationText: {
    flex: 1,
    fontSize: 15,
    color: "#999",
  },
  locationTextActive: {
    color: "#111",
  },
  captionInput: {
    fontSize: 16,
    color: "#000",
    maxHeight: 80,
  },
  gridSection: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
    paddingHorizontal: 16,
    paddingVertical: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  gridContent: {
    paddingHorizontal: GRID_SPACING,
    paddingBottom: 100,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    margin: GRID_SPACING / 2,
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  selectionOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    padding: 6,
  },
  selectionOverlaySelected: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  unselectedCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedBadgeText: {
    fontSize: 12,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: "#888",
  },
});

export default CreatePostScreen;
