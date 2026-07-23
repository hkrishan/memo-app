/**
 * The gallery's floating action pair: add photos from the library and
 * open the album camera. Shared by the Gallery tab's overview and the
 * pushed full-gallery grid so both surfaces keep identical entry points.
 */

import React, { useCallback } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { IconButton } from "react-native-paper";
import { useRouter } from "expo-router";

interface GalleryFabsProps {
  albumId: string | undefined;
  /**
   * Distance from the screen bottom. Defaults to clearing the album
   * tab bar; screens without one (the pushed full gallery) pass less.
   */
  bottom?: number;
}

export const GalleryFabs: React.FC<GalleryFabsProps> = ({
  albumId,
  bottom = 110,
}) => {
  const router = useRouter();

  // Opens the app's own camera scoped to this album — after a snap, its
  // save sheet asks before anything is uploaded here
  const handleTakePhoto = useCallback(() => {
    if (albumId) router.push(`/album/${albumId}/camera`);
  }, [router, albumId]);

  // Push the add-photos screen right away and let IT run the system
  // picker — the picker's post-"Add" transcode takes seconds, and this
  // way that wait happens on the upload view (with a preparing state)
  // instead of as dead air on the gallery.
  const handleAddPhoto = useCallback(() => {
    if (albumId) router.push(`/album/${albumId}/add-photos?autoPick=1`);
  }, [router, albumId]);

  return (
    <View style={[styles.fabRow, { bottom }]} pointerEvents="box-none">
      <IconButton
        icon="plus"
        iconColor="#fff"
        style={styles.addButton}
        onPress={handleAddPhoto}
      />
      <Pressable
        onPress={handleTakePhoto}
        style={styles.cameraButton}
        accessibilityRole="button"
        accessibilityLabel="Take a photo for this album"
      >
        {/* Shutter ring, mirroring the main tab bar's camera icon */}
        <View style={styles.shutterRing} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  fabRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
  },
  addButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#000",
    margin: 0,
  },
  cameraButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: "#fff",
  },
});

export default GalleryFabs;
