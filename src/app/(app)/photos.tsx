import React, { useCallback } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMediaLibrary } from "@/features/album/hooks";
import { PhotoGrid } from "@/features/album/components";

export default function PhotosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { assets, isLoading, loadMore } = useMediaLibrary({ first: 100 });

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const ListHeader = (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <Pressable onPress={handleBack} style={styles.backButton}>
        <Ionicons name="chevron-back" size={28} color="#000" />
      </Pressable>
      <Text style={styles.title}>All Photos</Text>
      <View style={styles.backButton} />
    </View>
  );

  return (
    <View style={styles.container}>
      <PhotoGrid
        assets={assets}
        onEndReached={loadMore}
        isLoading={isLoading}
        ListHeaderComponent={ListHeader}
        showAlbumIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
});
