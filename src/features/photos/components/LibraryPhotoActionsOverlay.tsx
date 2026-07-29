/**
 * Per-photo actions shown over the fullscreen library viewer: Add to album
 * (a checkbox picker that edits the photo's full album membership) and
 * Delete — icon-only buttons stacked vertically in the top-right corner
 * (the viewer's top chrome keeps that corner empty as a spacer). Fades in
 * lockstep with the viewer chrome.
 *
 * Both actions work while a capture is still UPLOADING. Such a photo has no
 * server id yet, so its actions are applied to the upload-queue entry
 * instead: deleting cancels the upload (and tears down anything already
 * created), and album changes are recorded as targets the processor applies
 * once the upload lands.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet } from "react-native";
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { notify } from "@/components/global";
import { MediaAsset } from "@/features/album/hooks";
import { useGetAlbumsQuery } from "@/features/album/api/album.queries";
import { cancelEntry, setEntryAlbums } from "../store/libraryUploadQueue";
import { AlbumMultiSelectSheet } from "./AlbumMultiSelectSheet";
import {
  useDeleteLibraryPhotoMutation,
  useMergedLibrary,
  useSetLibraryPhotoAlbumsMutation,
} from "../api/library.queries";

interface LibraryPhotoActionsOverlayProps {
  asset: MediaAsset;
  chromeVisible: boolean;
  /** Chrome visibility as a UI-thread value — the bar fades in sync. */
  visibility: SharedValue<number>;
  bottomInset: number;
  requestClose: () => void;
  onDeleteStarted: (photoId: string) => void;
  onDeleteFailed: (photoId: string) => void;
}

export const LibraryPhotoActionsOverlay: React.FC<
  LibraryPhotoActionsOverlayProps
> = ({
  asset,
  chromeVisible,
  visibility,
  bottomInset,
  requestClose,
  onDeleteStarted,
  onDeleteFailed,
}) => {
  const insets = useSafeAreaInsets();
  const { data: albums } = useGetAlbumsQuery();
  const deleteMutation = useDeleteLibraryPhotoMutation();
  const setAlbumsMutation = useSetLibraryPhotoAlbumsMutation();
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);

  // Queue-local ids mark a capture whose upload hasn't settled — its actions
  // go through the upload queue rather than the server
  const isPending = asset.id.startsWith("cap-");

  // Which albums this photo already lives in (from the library feed's
  // membership data; pending captures carry their queued targets)
  const { photos: libraryPhotos } = useMergedLibrary();
  const memberAlbums = useMemo(
    () => libraryPhotos.find((p) => p.photoId === asset.id)?.albums ?? [],
    [libraryPhotos, asset.id],
  );
  const memberAlbumIds = useMemo(
    () => memberAlbums.map((a) => a.albumId),
    [memberAlbums],
  );

  const barStyle = useAnimatedStyle(() => ({ opacity: visibility.value }));

  const handleDelete = () => {
    Alert.alert(
      "Delete photo",
      isPending
        ? "This photo is still uploading. Deleting cancels the upload and removes it everywhere."
        : "Remove this photo from your Memo library? This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const photoId = asset.id;
            onDeleteStarted(photoId);
            // The viewer STAYS OPEN: both delete paths drop the photo from
            // the merged library straight away, and the viewer advances to
            // the next one (closing itself only when nothing is left).
            if (isPending) {
              // Cancels the in-flight upload and tears down anything it
              // already created (library photo and/or album copies)
              void cancelEntry(photoId).catch(() => {
                onDeleteFailed(photoId);
                notify.error("Delete failed", "Could not remove the photo.");
              });
              return;
            }

            deleteMutation.mutate(photoId, {
              onError: () => {
                onDeleteFailed(photoId);
                notify.error("Delete failed", "Could not remove the photo.");
              },
            });
          },
        },
      ],
    );
  };

  const describeResult = useCallback(
    (albumIds: string[]) => {
      if (albumIds.length === 0) return "Saved to your Memo photos only";
      if (albumIds.length === 1) {
        const album = albums?.find((a) => a.albumId === albumIds[0]);
        return album?.title ?? "1 album";
      }
      return `${albumIds.length} albums`;
    },
    [albums],
  );

  const handleConfirmAlbums = useCallback(
    (albumIds: string[]) => {
      setShowAlbumPicker(false);

      const nextAlbums = albumIds.map((albumId) => ({
        albumId,
        title: albums?.find((a) => a.albumId === albumId)?.title ?? "Album",
      }));

      if (isPending) {
        // The queue entry is patched synchronously, so the label re-renders
        // from the merged library on the very next frame
        void setEntryAlbums(asset.id, nextAlbums).catch(() =>
          notify.error("Couldn't update albums", "Please try again"),
        );
        notify.success("Albums updated", describeResult(albumIds));
        return;
      }

      setAlbumsMutation.mutate(
        {
          libraryPhotoId: asset.id,
          current: memberAlbums.map((a) => ({
            albumId: a.albumId,
            photoId: a.photoId,
          })),
          nextAlbums,
        },
        {
          onSuccess: () =>
            notify.success("Albums updated", describeResult(albumIds)),
          onError: () =>
            notify.error("Couldn't update albums", "Please try again"),
        },
      );
    },
    [
      isPending,
      albums,
      asset.id,
      memberAlbums,
      setAlbumsMutation,
      describeResult,
    ],
  );

  return (
    <>
      {memberAlbums.length > 0 && (
        <Animated.View
          style={[styles.albumBanner, { bottom: bottomInset + 16 }, barStyle]}
          pointerEvents="none"
        >
          <Ionicons name="albums" size={12} color="#fff" />
          <Text style={styles.albumBannerText} numberOfLines={1}>
            In {memberAlbums[0].title}
            {memberAlbums.length > 1
              ? ` +${memberAlbums.length - 1} more`
              : ""}
          </Text>
        </Animated.View>
      )}

      {/* Icon stack in the top-right corner, aligned with the chrome's
          close button row and growing downward */}
      <Animated.View
        style={[styles.stack, { top: insets.top + 4 }, barStyle]}
        pointerEvents={chromeVisible ? "box-none" : "none"}
      >
        <Pressable
          onPress={() => setShowAlbumPicker(true)}
          style={styles.iconButton}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Add to album"
        >
          <Ionicons name="albums-outline" size={20} color="#fff" />
        </Pressable>
        <Pressable
          onPress={handleDelete}
          style={styles.iconButton}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Delete photo"
        >
          <Ionicons name="trash-outline" size={20} color="#FF6961" />
        </Pressable>
      </Animated.View>

      <AlbumMultiSelectSheet
        visible={showAlbumPicker}
        albums={albums}
        selectedAlbumIds={memberAlbumIds}
        onConfirm={handleConfirmAlbums}
        onClose={() => setShowAlbumPicker(false)}
        busy={setAlbumsMutation.isPending}
      />
    </>
  );
};

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    right: 12,
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  albumBanner: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 260,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  albumBannerText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
});

export default LibraryPhotoActionsOverlay;
