/**
 * CameraScreen
 * Snapchat-style camera with zoom, flash, video recording, and front/back switching
 */

import React, { useCallback, useRef, useState } from "react";
import { View, StyleSheet, Linking, TouchableOpacity } from "react-native";
import * as MediaLibrary from "expo-media-library";
import { notify } from "@/components/global";
import Animated, {
  useAnimatedStyle,
  useAnimatedProps,
  useAnimatedReaction,
  interpolate,
  Extrapolation,
  runOnJS,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
} from "react-native-vision-camera";

import {
  useSwipeableTabs,
  TOP_BAR_HEIGHT,
} from "@/contexts/SwipeableTabsContext";
import { useGalleryStore } from "@/features/album/store/galleryStore";
import { usePhotoAlbumStore } from "@/features/album/store/photoAlbumStore";
import {
  useUploadPhotoMutation,
  useGetAlbumsQuery,
} from "@/features/album/api/album.queries";

// Camera system imports
import {
  CameraPosition,
  CaptureMode,
  FlashMode,
  CapturedMedia,
} from "../types";
import { RECORDING_CONFIG } from "../constants";
import { useCameraZoom, useVideoRecording } from "../hooks";
import {
  FlashButton,
  CameraSwitchButton,
  CaptureButton,
  VideoTimer,
  ZoomLevelIndicator,
  MediaPreview,
  ModeToggle,
} from "../components";

const ReanimatedCamera = Animated.createAnimatedComponent(Camera);

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);

  // Permissions
  const {
    hasPermission: hasCameraPermission,
    requestPermission: requestCameraPermission,
  } = useCameraPermission();
  const {
    hasPermission: hasMicPermission,
    requestPermission: requestMicPermission,
  } = useMicrophonePermission();

  // Camera state
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>(
    CameraPosition.BACK,
  );
  const [flashMode, setFlashMode] = useState<FlashMode>(FlashMode.OFF);
  const [captureMode, setCaptureMode] = useState<CaptureMode>(
    CaptureMode.PHOTO,
  );
  const [isZooming, setIsZooming] = useState(false);

  // Media state
  const [capturedMedia, setCapturedMedia] = useState<CapturedMedia | null>(
    null,
  );
  const [showPreview, setShowPreview] = useState(false);

  // Focus state
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const focusOpacity = useSharedValue(0);
  const focusScale = useSharedValue(1);

  // Get camera device based on position
  const device = useCameraDevice(
    cameraPosition === CameraPosition.BACK ? "back" : "front",
  );

  // Zoom hook
  const { zoom, setZoom, pinchGestureHandler, animatedZoom } = useCameraZoom({
    device,
    onZoomChange: () => setIsZooming(true),
  });

  // Video recording hook
  const {
    isRecording,
    duration: recordingDuration,
    startRecording,
    stopRecording,
    resetRecording,
  } = useVideoRecording({
    maxDuration: RECORDING_CONFIG.MAX_DURATION,
    flashMode,
    onRecordingStop: (video) => {
      setCapturedMedia({
        ...video,
        timestamp: Date.now(),
        position: cameraPosition,
        flashUsed: flashMode !== FlashMode.OFF,
        duration: recordingDuration,
      } as CapturedMedia);
      setShowPreview(true);
    },
  });

  // Swipeable tabs context for overlay animation
  const { scrollPosition, pageIndex } = useSwipeableTabs();
  const triggerGalleryRefresh = useGalleryStore(
    (state) => state.triggerRefresh,
  );

  // Track camera visibility for battery optimization
  // Camera is considered visible when within 0.5 pages of its index
  const [isCameraVisible, setIsCameraVisible] = useState(true);
  const updateCameraVisibility = useCallback((visible: boolean) => {
    setIsCameraVisible(visible);
  }, []);

  useAnimatedReaction(
    () => Math.abs(scrollPosition.value - pageIndex) < 0.5,
    (isVisible, wasVisible) => {
      if (isVisible !== wasVisible) {
        runOnJS(updateCameraVisibility)(isVisible);
      }
    },
    [pageIndex],
  );

  // Album data and mutations
  const { data: albums } = useGetAlbumsQuery();
  const uploadPhotoMutation = useUploadPhotoMutation();
  const addAlbumAssociation = usePhotoAlbumStore(
    (state) => state.addAssociation,
  );

  // Animated props for camera zoom
  const animatedCameraProps = useAnimatedProps(() => ({
    zoom: animatedZoom.value,
  }));

  // Overlay fades in when scrolling away from camera
  const overlayStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - pageIndex);
    const opacity = interpolate(distance, [0, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  // Controls fade out when scrolling away
  const controlsFadeStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - pageIndex);
    const opacity = interpolate(
      distance,
      [0, 0.3],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Focus indicator animated style
  const focusIndicatorStyle = useAnimatedStyle(() => ({
    opacity: focusOpacity.value,
    transform: [{ scale: focusScale.value }],
  }));

  // Double tap to flip camera
  const flipCamera = useCallback(() => {
    setCameraPosition((prev) =>
      prev === CameraPosition.BACK ? CameraPosition.FRONT : CameraPosition.BACK,
    );
    setZoom(1);
  }, [setZoom]);

  // Tap to focus handler
  const handleFocus = useCallback(
    async (x: number, y: number) => {
      if (!cameraRef.current || !device?.supportsFocus) return;

      try {
        // Set focus point for indicator
        setFocusPoint({ x, y });

        // Animate focus indicator
        focusScale.value = 1.3;
        focusOpacity.value = 1;
        focusScale.value = withTiming(1, { duration: 200 });

        // Focus the camera
        await cameraRef.current.focus({ x, y });

        // Fade out after focus
        setTimeout(() => {
          focusOpacity.value = withTiming(0, { duration: 300 });
        }, 800);
      } catch (error) {
        console.log("Focus error:", error);
        focusOpacity.value = withTiming(0, { duration: 200 });
      }
    },
    [device?.supportsFocus, focusOpacity, focusScale],
  );

  // Single tap gesture for focus
  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((event) => {
      runOnJS(handleFocus)(event.x, event.y);
    });

  // Double tap gesture to flip camera
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(flipCamera)();
    });

  // Combine gestures - single tap, double tap and pinch zoom
  const combinedGesture = Gesture.Simultaneous(
    Gesture.Exclusive(doubleTapGesture, singleTapGesture),
    pinchGestureHandler,
  );

  // Permission request handler
  const handleRequestPermission = useCallback(async () => {
    const cameraGranted = await requestCameraPermission();
    const micGranted = await requestMicPermission();

    if (!cameraGranted || !micGranted) {
      Linking.openSettings();
    }
  }, [requestCameraPermission, requestMicPermission]);

  // Camera switch handler
  const handleCameraSwitch = useCallback(() => {
    setCameraPosition((prev) =>
      prev === CameraPosition.BACK ? CameraPosition.FRONT : CameraPosition.BACK,
    );
    // Reset zoom when switching cameras
    setZoom(1);
  }, [setZoom]);

  // Photo capture handler
  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePhoto({
        flash:
          flashMode === FlashMode.ON
            ? "on"
            : flashMode === FlashMode.AUTO
              ? "auto"
              : "off",
        enableShutterSound: true,
      });

      setCapturedMedia({
        ...photo,
        timestamp: Date.now(),
        position: cameraPosition,
        flashUsed: flashMode !== FlashMode.OFF,
        zoomLevel: zoom,
      } as CapturedMedia);
      setShowPreview(true);
    } catch (error) {
      console.error("Failed to take photo:", error);
    }
  }, [flashMode, cameraPosition, zoom]);

  // Video recording handlers
  const handleRecordStart = useCallback(() => {
    if (!cameraRef.current) return;
    startRecording(cameraRef.current);
    setCaptureMode(CaptureMode.VIDEO);
  }, [startRecording]);

  const handleRecordStop = useCallback(async () => {
    await stopRecording();
    setCaptureMode(CaptureMode.PHOTO);
  }, [stopRecording]);

  // Media preview handlers
  const handleClosePreview = useCallback(() => {
    setShowPreview(false);
    setCapturedMedia(null);
    resetRecording();
  }, [resetRecording]);

  const handleSaveMedia = useCallback(
    async (albumId?: string) => {
      if (!capturedMedia?.path) return;

      const fileUri = capturedMedia.path.startsWith("file://")
        ? capturedMedia.path
        : `file://${capturedMedia.path}`;

      // Determine file info
      const isVideo = "duration" in capturedMedia;
      const extension = isVideo ? "mp4" : "jpg";
      const mimeType = isVideo ? "video/mp4" : "image/jpeg";
      const fileName = `capture_${Date.now()}.${extension}`;

      try {
        // Request gallery permission
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") {
          notify.error(
            "Permission Required",
            "Please allow access to save media to your gallery",
          );
          Linking.openSettings();
          return;
        }

        // Always save to local gallery first
        const asset = await MediaLibrary.createAssetAsync(fileUri);
        triggerGalleryRefresh();

        // If saving to album, upload in background (don't await)
        if (albumId) {
          const album = albums?.find((a) => a.albumId === albumId);

          // Store album association immediately for the local asset
          if (album && asset.uri) {
            addAlbumAssociation(asset.uri, albumId, album.title);
          }

          // Fire upload in background - don't await
          uploadPhotoMutation.mutate(
            { albumId, fileUri, fileName, mimeType },
            {
              onSuccess: () => {
                notify.success("Uploaded", "Photo added to album");
              },
              onError: () => {
                notify.error("Upload Failed", "Could not upload to album");
              },
            },
          );

          notify.success("Saved", "Uploading to album...");
        } else {
          notify.success("Saved", "Saved to gallery");
        }

        // Close preview immediately
        handleClosePreview();
      } catch (error) {
        console.error("Failed to save media:", error);
        notify.error("Save Failed", "Could not save media to gallery");
      }
    },
    [
      capturedMedia,
      handleClosePreview,
      triggerGalleryRefresh,
      uploadPhotoMutation,
      albums,
      addAlbumAssociation,
    ],
  );

  const handleDeleteMedia = useCallback(() => {
    handleClosePreview();
  }, [handleClosePreview]);

  // Flash is available on back camera (hardware flash) or front camera (screen flash)
  const isFlashAvailable =
    device?.hasFlash || cameraPosition === CameraPosition.FRONT;

  // Permission not granted
  if (!hasCameraPermission) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="camera-outline" size={64} color="#666" />
        <Text style={styles.permissionText}>Camera access required</Text>
        <Text style={styles.permissionSubtext}>
          We need camera and microphone access to take photos and videos
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={handleRequestPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No camera device found
  if (!device) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="warning-outline" size={64} color="#666" />
        <Text style={styles.permissionText}>No camera device found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera with pinch-to-zoom gesture */}
      <GestureDetector gesture={combinedGesture}>
        <View style={StyleSheet.absoluteFill}>
          <ReanimatedCamera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={isCameraVisible && !showPreview}
            photo={true}
            video={true}
            audio={hasMicPermission}
            animatedProps={animatedCameraProps}
            enableZoomGesture={false}
            photoQualityBalance="quality"
            exposure={0}
          />
        </View>
      </GestureDetector>

      {/* Focus indicator */}
      {focusPoint && (
        <Animated.View
          style={[
            styles.focusIndicator,
            focusIndicatorStyle,
            {
              left: focusPoint.x - 40,
              top: focusPoint.y - 40,
            },
          ]}
          pointerEvents="none"
        />
      )}

      {/* Top controls bar - fades when scrolling away */}
      <Animated.View
        style={[
          styles.topControlsBar,
          { paddingTop: insets.top + TOP_BAR_HEIGHT + 10 },
          controlsFadeStyle,
        ]}
      >
        {/* Flash button */}
        {isFlashAvailable && (
          <FlashButton
            mode={flashMode}
            onModeChange={setFlashMode}
            disabled={isRecording}
          />
        )}

        {/* Spacer */}
        <View style={styles.topControlsSpacer} />

        {/* Camera switch button */}
        <CameraSwitchButton
          position={cameraPosition}
          onSwitch={handleCameraSwitch}
          disabled={isRecording}
        />
      </Animated.View>

      {/* Recording timer */}
      {isRecording && (
        <Animated.View
          style={[
            styles.timerContainer,
            { top: insets.top + TOP_BAR_HEIGHT + 70 },
            controlsFadeStyle,
          ]}
        >
          <VideoTimer
            duration={recordingDuration}
            maxDuration={RECORDING_CONFIG.MAX_DURATION}
            isRecording={isRecording}
            showMaxDuration
          />
        </Animated.View>
      )}

      {/* Bottom controls - fades when scrolling away */}
      <Animated.View
        style={[
          styles.bottomControlsContainer,
          { paddingBottom: insets.bottom + 80 },
          controlsFadeStyle,
        ]}
      >
        {/* Zoom level indicator - positioned delicately above capture button */}
        <View style={styles.zoomIndicatorContainer}>
          <ZoomLevelIndicator
            zoom={zoom}
            isActive={isZooming}
            autoHideDelay={1500}
          />
        </View>

        {/* Capture button */}
        <View style={styles.captureButtonContainer}>
          <CaptureButton
            mode={captureMode}
            onCapture={handleCapture}
            onRecordStart={handleRecordStart}
            onRecordStop={handleRecordStop}
            isRecording={isRecording}
            recordingDuration={recordingDuration}
            maxDuration={RECORDING_CONFIG.MAX_DURATION}
          />
        </View>

        {/* Mode toggle - Photo/Video */}
        <View style={styles.modeToggleContainer}>
          <ModeToggle
            mode={captureMode}
            onModeChange={setCaptureMode}
            disabled={isRecording}
          />
        </View>
      </Animated.View>

      {/* Media preview overlay */}
      <MediaPreview
        media={capturedMedia}
        onClose={handleClosePreview}
        onSave={handleSaveMedia}
        onDelete={handleDeleteMedia}
        visible={showPreview}
      />

      {/* Scroll overlay (fades when swiping to other tabs) */}
      <Animated.View
        style={[styles.scrollOverlay, overlayStyle]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  permissionText: {
    color: "#888",
    fontSize: 18,
    marginTop: 16,
    fontWeight: "600",
  },
  permissionSubtext: {
    color: "#666",
    fontSize: 14,
    marginTop: 8,
    marginBottom: 24,
    textAlign: "center",
  },
  permissionButton: {
    backgroundColor: "#fff",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
  },
  permissionButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600",
  },
  topControlsBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
  },
  topControlsSpacer: {
    flex: 1,
  },
  timerContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  bottomControlsContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingTop: 20,
  },
  zoomIndicatorContainer: {
    marginBottom: 16,
    alignItems: "center",
  },
  captureButtonContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  modeToggleContainer: {
    marginTop: 20,
  },
  scrollOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  focusIndicator: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: "#FFD700",
    backgroundColor: "transparent",
  },
});
