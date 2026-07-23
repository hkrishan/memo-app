/**
 * AllPhotosScreen
 * Camera-roll page: performant 3-column grid of the device library with a
 * fullscreen iPhone-Photos-style viewer.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMediaLibrary } from "@/features/album/hooks";
import { PhotoBrowser } from "../components";

const AllPhotosScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    assets,
    hasPermission,
    isLoading,
    hasMore,
    totalCount,
    requestPermission,
    loadMore,
    refresh,
  } = useMediaLibrary({ first: 100 });

  const [refreshing, setRefreshing] = useState(false);
  // Set when an in-app permission request comes back denied — the OS won't
  // prompt again, so the only way forward is the system settings screen
  const [permissionDenied, setPermissionDenied] = useState(false);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleRequestPermission = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) {
      setPermissionDenied(true);
    }
  }, [requestPermission]);

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  // Sticky header: fixed above the grid, not part of the scroll content
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
          <Text style={styles.title}>All Photos</Text>
          {totalCount != null && (
            <Text style={styles.countText}>
              {totalCount.toLocaleString()}{" "}
              {totalCount === 1 ? "item" : "items"}
            </Text>
          )}
        </View>
      </View>
    ),
    [handleBack, totalCount, insets.top],
  );

  // Permission still resolving
  if (hasPermission === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#999" />
        </View>
      </View>
    );
  }

  // Permission denied
  if (hasPermission === false) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
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
          <Text style={styles.title}>All Photos</Text>
        </View>
        <View style={styles.centered}>
          <Ionicons name="images-outline" size={48} color="#999" />
          <Text style={styles.emptyTitle}>Allow photo access</Text>
          <Text style={styles.emptyText}>
            Memo needs access to your photo library to show your camera roll.
          </Text>
          {permissionDenied ? (
            <Pressable
              onPress={handleOpenSettings}
              style={({ pressed }) => [
                styles.allowButton,
                pressed && styles.allowButtonPressed,
              ]}
            >
              <Text style={styles.allowButtonText}>Open Settings</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleRequestPermission}
              style={({ pressed }) => [
                styles.allowButton,
                pressed && styles.allowButtonPressed,
              ]}
            >
              <Text style={styles.allowButtonText}>Allow Access</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

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
                Photos and videos you take will show up here.
              </Text>
            </>
          )}
        </View>
      ) : (
        <PhotoBrowser
          assets={assets}
          sectioned
          onEndReached={loadMore}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          isLoadingMore={isLoading && assets.length > 0}
          hasMore={hasMore}
          totalCount={totalCount}
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
  countText: {
    fontSize: 13,
    color: "#999",
    marginRight: 12,
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
  allowButton: {
    backgroundColor: "#000",
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 13,
    marginTop: 20,
  },
  allowButtonPressed: {
    opacity: 0.7,
  },
  allowButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
