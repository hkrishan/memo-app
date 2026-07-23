/**
 * AlbumCameraScreen
 * The app camera as a pushed route, capturing straight into one album.
 * CameraScreen normally lives inside the swipeable tab layout — here it
 * gets a provider with pinned values so it always counts as the active
 * page (camera stays live), plus a close button and an album-scoped
 * save sheet.
 *
 * When opened from a moment's "Post now" the route also carries
 * momentId + eventId: after the captured photo uploads to the album, it
 * is submitted to that moment event (see useMomentUploadSubmission).
 */

import React, { useCallback } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSharedValue } from "react-native-reanimated";

import { SwipeableTabsProvider } from "@/contexts/SwipeableTabsContext";
import { useMomentUploadSubmission } from "@/features/moments/api/moments.queries";
import CameraScreen from "./CameraScreen";

const AlbumCameraScreen = () => {
  const router = useRouter();
  const { albumId, momentId, eventId } = useLocalSearchParams<{
    albumId: string;
    momentId?: string;
    eventId?: string;
  }>();

  // Pinned at the "camera page" position: distance 0 → camera active
  const scrollPosition = useSharedValue(1);
  const currentPage = useSharedValue(1);

  const handleClose = useCallback(() => router.back(), [router]);

  // undefined unless this capture is tied to a moment event
  const handlePhotoUploaded = useMomentUploadSubmission({
    albumId,
    momentId,
    eventId,
  });

  return (
    <SwipeableTabsProvider
      scrollPosition={scrollPosition}
      currentPage={currentPage}
      pageIndex={1}
    >
      <CameraScreen
        albumId={albumId}
        onRequestClose={handleClose}
        onPhotoUploaded={handlePhotoUploaded}
      />
    </SwipeableTabsProvider>
  );
};

export default AlbumCameraScreen;
