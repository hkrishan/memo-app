import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  InteractionManager,
  Pressable,
  FlatList,
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

import { usePendingUploadsStore } from "../store/pendingUploadsStore";
import { startUploadBatch } from "../store/uploadManager";
import { useGetAlbumQuery } from "../api/album.queries";
import { gpsFromExif } from "@/utils/image";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 4;
const GRID_SPACING = 2;
const ITEM_WIDTH =
  (SCREEN_WIDTH - GRID_SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;
// The app's universal portrait tile ratio (matches the full-view grids)
const ITEM_HEIGHT = ITEM_WIDTH * 1.4;

const AddPhotosScreen: React.FC = () => {
  const { albumId, autoPick } = useLocalSearchParams<{
    albumId: string;
    autoPick?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: album } = useGetAlbumQuery(albumId as string);

  const pendingAssets = usePendingUploadsStore((s) => s.assets);
  const setPendingAssets = usePendingUploadsStore((s) => s.setAssets);
  const addPendingAssets = usePendingUploadsStore((s) => s.addAssets);
  const removeAsset = usePendingUploadsStore((s) => s.removeAsset);

  const uploadCompletedRef = useRef(false);

  // With autoPick, the gallery pushed this screen bare and the system
  // picker runs from here — after its "Add", the picker keeps transcoding
  // for a while before resolving, and this flag keeps a "Preparing"
  // state up (instead of bouncing straight back) until it settles.
  const [isPicking, setIsPicking] = useState(autoPick === "1");

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

  const openImagePicker = useCallback(
    async (replaceSelection = false) => {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        // No client re-encode (quality) — it transcodes every image before
        // the picker resolves, freezing "Done" for seconds on big batches.
        // Originals are handed off; the server downsizes for thumbnails.
        selectionLimit: 0,
        exif: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const assets = result.assets.map((asset) => {
          const fileName = asset.fileName || asset.uri.split("/").pop() || "photo.jpg";
          const gps = gpsFromExif(asset.exif);
          return {
            uri: asset.uri,
            fileName,
            mimeType: asset.mimeType || inferMimeType(fileName),
            ...(gps ?? {}),
          };
        });
        // The entry pick replaces whatever a previous batch left behind
        // (matching the old gallery-side setAssets); "Add more" appends
        if (replaceSelection) {
          setPendingAssets(assets);
        } else {
          addPendingAssets(assets);
        }
      }
    },
    [addPendingAssets, setPendingAssets],
  );

  // autoPick entry: launch the system picker once we're on screen. This
  // runs AFTER the modal's present transition settles — launching the
  // system picker mid-transition makes iOS silently drop it and leaves its
  // promise hanging (the screen then sits on "Preparing photos" forever).
  const autoPickStartedRef = useRef(false);
  useEffect(() => {
    if (autoPick !== "1" || autoPickStartedRef.current) return;
    autoPickStartedRef.current = true;
    const handle = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          await openImagePicker(true);
        } catch {
          // Picker failed to launch — fall through to the empty state,
          // which navigates back rather than hanging
        } finally {
          setIsPicking(false);
        }
      })();
    });
    return () => handle.cancel();
  }, [autoPick, openImagePicker]);

  // Go back when there's nothing to show: picker canceled/denied, or no
  // assets on mount without autoPick. Skip while the picker is still out,
  // and once the batch has been handed off (we navigate back ourselves)
  useEffect(() => {
    if (pendingAssets.length === 0 && !isPicking && !uploadCompletedRef.current) {
      router.back();
    }
  }, [pendingAssets.length, isPicking, router]);

  // Hand the whole batch to the global upload manager (which keeps the
  // uploads running through backgrounding) and leave immediately — the
  // floating progress pill takes over from here. Successful photos are
  // removed from the pending list by the manager, so anything left after
  // the batch settles is exactly what failed.
  const handleUpload = useCallback(() => {
    if (!pendingAssets.length || !albumId) return;
    uploadCompletedRef.current = true;
    startUploadBatch(albumId as string, album?.title ?? "Album", [
      ...pendingAssets,
    ]);
    router.back();
  }, [albumId, album?.title, pendingAssets, router]);

  const keyExtractor = useCallback(
    (asset: (typeof pendingAssets)[number]) => asset.uri,
    [],
  );

  const renderPendingItem = useCallback(
    ({ item: asset }: { item: (typeof pendingAssets)[number] }) => (
      <View style={styles.gridItem}>
        <Image
          source={{ uri: asset.uri }}
          style={styles.gridImage}
          contentFit="cover"
          recyclingKey={asset.uri}
        />
        <Pressable
          style={styles.removeButton}
          onPress={() => removeAsset(asset.uri)}
        >
          <Ionicons name="close" size={16} color="#fff" />
        </Pressable>
      </View>
    ),
    [removeAsset],
  );

  const selectedCount = pendingAssets.length;

  // No assets yet: while the picker is out this sits behind the system
  // sheet, and once it dismisses it covers the picker's transcoding wait
  // (which can run a couple of seconds for big batches). Otherwise blank —
  // the effect above navigates back.
  if (pendingAssets.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        {isPicking && (
          <View style={styles.preparingContainer}>
            <ActivityIndicator size="small" color="#666" />
            <Text style={styles.preparingText}>Preparing photos...</Text>
          </View>
        )}
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
        <Pressable
          style={styles.addMoreButton}
          onPress={() => openImagePicker()}
        >
          <Ionicons name="add" size={18} color="#111" />
          <Text style={styles.addMoreText}>Add more</Text>
        </Pressable>
      </View>

      {/* Selected photos grid — virtualized: selections can be huge now */}
      <FlatList
        data={pendingAssets}
        keyExtractor={keyExtractor}
        renderItem={renderPendingItem}
        numColumns={NUM_COLUMNS}
        style={styles.scrollContainer}
        contentContainerStyle={styles.gridContainer}
        showsVerticalScrollIndicator={false}
        initialNumToRender={18}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
      />

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[styles.primaryButton, !selectedCount && styles.buttonDisabled]}
          onPress={handleUpload}
          disabled={!selectedCount}
        >
          <Text
            style={[
              styles.primaryButtonText,
              !selectedCount && styles.buttonDisabledText,
            ]}
          >
            Upload {selectedCount} photo{selectedCount !== 1 ? "s" : ""}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={18}
            color={selectedCount ? "#fff" : "#c5c5c5"}
            style={{ marginLeft: 6 }}
          />
        </Pressable>
      </View>
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
    fontFamily: "InstrumentSans_700Bold",
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
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#111",
  },
  scrollContainer: {
    flex: 1,
  },
  gridContainer: {
    paddingLeft: GRID_SPACING,
    paddingTop: GRID_SPACING,
    paddingBottom: 100,
  },
  gridItem: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
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
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    fontSize: 16,
  },
  buttonDisabled: {
    backgroundColor: "#e5e5e5",
  },
  buttonDisabledText: {
    color: "#a0a0a0",
  },
  preparingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  preparingText: {
    fontSize: 14,
    color: "#666",
  },
});

export default AddPhotosScreen;
