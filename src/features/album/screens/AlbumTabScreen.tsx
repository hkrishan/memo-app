import React, { useCallback, useEffect } from "react";
import { View, StyleSheet, Pressable, Linking, ScrollView } from "react-native";
import { Button, Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import {
  useSwipeableTabs,
  TOP_BAR_HEIGHT,
} from "../../../contexts/SwipeableTabsContext";
import { useMediaLibrary } from "../hooks";
import { GalleryCarousel, AlbumsGrid } from "../components";
import { useGalleryStore } from "../store/galleryStore";
import { useGetAlbumsQuery } from "../api/album.queries";
import { theme } from "@/lib/theme";

export default function AlbumTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { scrollPosition, pageIndex } = useSwipeableTabs();
  const { assets, hasPermission, requestPermission, refresh } =
    useMediaLibrary();
  const refreshKey = useGalleryStore((state) => state.refreshKey);
  const { data: albums, isLoading: albumsLoading } = useGetAlbumsQuery();

  // Refresh gallery when triggered (e.g., after saving from camera)
  useEffect(() => {
    if (refreshKey > 0) {
      refresh();
    }
  }, [refreshKey, refresh]);

  const handleViewAll = useCallback(() => {
    router.push("/photos");
  }, [router]);

  const handleViewAlbums = useCallback(() => {
    router.push("/album");
  }, [router]);

  const handleAddNewAlbum = useCallback(() => {
    router.push("/album/create");
  }, [router]);

  const contentFadeStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - pageIndex);
    const opacity = interpolate(distance, [0, 1], [1, 0], Extrapolation.CLAMP);

    const translateY = interpolate(
      distance,
      [0, 1],
      [0, -10],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const handleRequestPermission = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) {
      Linking.openSettings();
    }
  }, [requestPermission]);

  // Permission not granted
  if (hasPermission === false) {
    return (
      <View
        style={[styles.container, { paddingTop: insets.top + TOP_BAR_HEIGHT }]}
      >
        <View style={styles.permissionContainer}>
          <Ionicons name="images-outline" size={64} color="#ccc" />
          <Text style={styles.permissionTitle}>Access Your Photos</Text>
          <Text style={styles.permissionText}>
            Allow access to your photo library to view and manage your photos
          </Text>
          <Pressable
            style={styles.permissionButton}
            onPress={handleRequestPermission}
          >
            <Text style={styles.permissionButtonText}>Allow Access</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Loading initial permission check
  if (hasPermission === null) {
    return (
      <View
        style={[styles.container, { paddingTop: insets.top + TOP_BAR_HEIGHT }]}
      >
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingTop: insets.top + TOP_BAR_HEIGHT + 20, gap: 20 }}>
          <Animated.View style={[styles.section, contentFadeStyle]}>
            <View style={styles.sectionHeader}>
              <Pressable onPress={handleViewAll} style={styles.viewAllButton}>
                <Text style={styles.sectionTitle}>My Photos</Text>
                <Ionicons name="chevron-forward" size={20} color="#000" />
              </Pressable>
            </View>
            <GalleryCarousel assets={assets} />
          </Animated.View>

          <Animated.View style={[styles.section, contentFadeStyle]}>
            <View style={styles.sectionHeader}>
              <Pressable
                onPress={handleViewAlbums}
                style={styles.viewAllButton}
              >
                <Text style={styles.sectionTitle}>Albums</Text>
                <Ionicons name="chevron-forward" size={20} color="#000" />
              </Pressable>

              <Button
                onPress={handleAddNewAlbum}
                style={{
                  backgroundColor: theme.colors.primary,
                }}
                textColor={theme.colors.onPrimary}
              >
                + Add new
              </Button>
            </View>
            <AlbumsGrid albums={albums} isLoading={albumsLoading} />
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    paddingBottom: 100,
    flexGrow: 1,
  },
  section: {},
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingBottom: 100,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
    marginTop: 16,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
