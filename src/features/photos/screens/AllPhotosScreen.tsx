/**
 * AllPhotosScreen
 * The full "My Photos" library: a paginated 3-column grid of the user's
 * server-side Memo library with the shared fullscreen viewer. Each photo
 * offers Delete (removes it from the library) and Add to album (copies it
 * into an album). Infinite scroll + pull to refresh.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PhotoBrowser } from "../components";
import { useMergedLibrary } from "../api/library.queries";
import { libraryPhotoToAsset } from "../utils/libraryAsset";
import { useLibraryPhotoViewerExtras } from "../hooks/useLibraryPhotoViewerExtras";

const AllPhotosScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const {
    photos,
    isLoading,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useMergedLibrary();

  const [refreshing, setRefreshing] = useState(false);

  // Local-first: mid-upload captures render from their on-device files at
  // the front of the grid; they swap to the server copy when the upload
  // settles (the queue refetches the library before dropping the entry)
  const assets = useMemo(
    () => photos.map(libraryPhotoToAsset),
    [photos],
  );

  const { renderSocialOverlay, poppingIds } =
    useLibraryPhotoViewerExtras(assets);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const Header = useMemo(
    () => (
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={28} color="#000" />
          </Pressable>
          <Text style={styles.title}>My Photos</Text>
        </View>
      </View>
    ),
    [handleBack, insets.top],
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {Header}
      {assets.length === 0 ? (
        <View style={styles.centered}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#999" />
          ) : (
            <>
              <Ionicons name="images-outline" size={48} color="#ccc" />
              <Text style={styles.emptyTitle}>No photos yet</Text>
              <Text style={styles.emptyText}>
                Photos you capture in Memo will show up here.
              </Text>
            </>
          )}
        </View>
      ) : (
        <PhotoBrowser
          assets={assets}
          sectioned
          onEndReached={handleEndReached}
          refreshing={refreshing || isRefetching}
          onRefresh={handleRefresh}
          isLoadingMore={isFetchingNextPage}
          hasMore={hasNextPage}
          totalCount={hasNextPage ? null : assets.length}
          renderSocialOverlay={renderSocialOverlay}
          poppingIds={poppingIds}
        />
      )}
    </View>
  );
};

export default AllPhotosScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    backgroundColor: "#fff",
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
    zIndex: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: "#000",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
});
