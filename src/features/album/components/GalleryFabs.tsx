/**
 * The gallery's floating action pair: add photos from the library and
 * open the album camera. Shared by the Gallery tab's overview and the
 * pushed full-gallery grid so both surfaces keep identical entry points.
 */

import React, { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
} from "react-native";
import { IconButton, Text } from "react-native-paper";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { usePendingUploadsStore } from "../store/pendingUploadsStore";
import { gpsFromExif } from "@/utils/image";

const inferMimeType = (fileName: string): string => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

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
  const setPendingAssets = usePendingUploadsStore((s) => s.setAssets);
  // While the system picker's post-"Add" transcode resolves (seconds for a
  // big batch) we show a light overlay here — then push the review screen.
  const [preparing, setPreparing] = useState(false);
  const router = useRouter();

  // Opens the app's own camera scoped to this album — after a snap, its
  // save sheet asks before anything is uploaded here
  const handleTakePhoto = useCallback(() => {
    if (albumId) router.push(`/album/${albumId}/camera`);
  }, [router, albumId]);

  // Launch the system picker HERE, on the settled gallery screen — not from
  // a just-mounted modal, where iOS silently fails to present it (leaving
  // the old "Preparing photos" screen hung). Once photos are picked, stash
  // them and push the review screen.
  const handleAddPhoto = useCallback(async () => {
    if (!albumId) return;
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        // No client-side re-encode: quality:0.8 transcodes EVERY selected
        // image before the picker resolves — a multi-second frozen "Done"
        // for a big batch. The server already downsizes for thumbnails, so
        // we hand off the originals and the review screen opens instantly.
        selectionLimit: 0,
        exif: true,
      });
      if (result.canceled || result.assets.length === 0) return;

      setPreparing(true);
      const assets = result.assets.map((asset) => {
        const fileName =
          asset.fileName || asset.uri.split("/").pop() || "photo.jpg";
        const gps = gpsFromExif(asset.exif);
        return {
          uri: asset.uri,
          fileName,
          mimeType: asset.mimeType || inferMimeType(fileName),
          ...(gps ?? {}),
        };
      });
      setPendingAssets(assets);
      router.push(`/album/${albumId}/add-photos`);
    } catch {
      // Picker failed — stay on the gallery rather than hang
    } finally {
      setPreparing(false);
    }
  }, [router, albumId, setPendingAssets]);

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

      <Modal visible={preparing} transparent animationType="fade">
        <View style={styles.preparingBackdrop}>
          <View style={styles.preparingCard}>
            <ActivityIndicator size="small" color="#666" />
            <Text style={styles.preparingText}>Preparing photos…</Text>
          </View>
        </View>
      </Modal>
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
  preparingBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  preparingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#fff",
  },
  preparingText: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
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
