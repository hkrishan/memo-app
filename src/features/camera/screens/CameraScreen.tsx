/**
 * CameraScreen
 * Snapchat-style camera:
 * - Tap capture for photo, hold for video, drag up while holding to zoom
 * - Zoom presets (0.5x ultra-wide / 1x / 2x / 3x) + pinch to zoom
 * - Tap to focus with iOS-style exposure slider
 * - Side toolbar: flip, flash, self-timer, grid, night mode
 * - Screen flash for front camera, torch for back-camera video
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Linking,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { BlurView } from "expo-blur";
import { notify } from "@/components/global";
import { uploadIndicator } from "@/components/global/uploadIndicator";
import Animated, {
  useAnimatedStyle,
  useAnimatedProps,
  useAnimatedReaction,
  interpolate,
  Extrapolation,
  runOnJS,
  useSharedValue,
  withSequence,
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
import { useDeletePhotoMutation } from "@/features/album/api/photo.queries";
import {
  useCaptureDestinationStore,
  CaptureDestination,
} from "@/features/camera/store/captureDestinationStore";

// Camera system imports
import {
  CameraPosition,
  CaptureMode,
  FlashMode,
  TimerMode,
  CapturedMedia,
} from "../types";
import { RECORDING_CONFIG } from "../constants";
import { useCameraZoom, useVideoRecording } from "../hooks";
import {
  CaptureButton,
  ModeToggle,
  VideoTimer,
  MediaPreview,
  PhotoSaveSheet,
  PhotoSaveStatus,
  ZoomPresetSelector,
  CameraToolbar,
  GridOverlay,
  CountdownOverlay,
  FocusExposureControl,
  LastCaptureThumbnail,
  CaptureDestinationButton,
  DestinationPickerSheet,
} from "../components";

const ReanimatedCamera = Animated.createAnimatedComponent(Camera);

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Camera formats are landscape, so the screen's aspect as width/height
// is height/width (≈2.16 on modern phones); the closest sensor format
// is 16:9. Used only as a front-camera tie-break — the back camera
// deliberately prefers full-sensor 4:3 formats for their wider FOV.
const SCREEN = Dimensions.get("screen");
const SCREEN_ASPECT_RATIO = SCREEN.height / SCREEN.width;

interface CameraScreenProps {
  /**
   * Album-capture mode: the post-capture save sheet offers ONLY this album,
   * so a snap lands directly in it (after the user confirms via the sheet).
   */
  albumId?: string;
  /** Renders a close button (the camera is a pushed route, not a tab). */
  onRequestClose?: () => void;
  /**
   * Fired after a capture finishes uploading to an album (photo or video).
   * Lets callers chain follow-up work onto the new album photo — e.g. a
   * moment submission when the camera was opened from "Post now".
   */
  onPhotoUploaded?: (photo: { photoId: string }) => void;
}

export default function CameraScreen({
  albumId,
  onRequestClose,
  onPhotoUploaded,
}: CameraScreenProps = {}) {
  const insets = useSafeAreaInsets();
  // Stable per-camera refs (both cameras stay mounted). Never swap one
  // ref object between the two Animated cameras conditionally — Reanimated
  // captures the ref object and warns when React reassigns .current
  // ("Tried to modify key `current` of an object ... passed to a worklet").
  const backCameraRef = useRef<Camera>(null);
  const frontCameraRef = useRef<Camera>(null);

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
  // Ref mirror so capture/focus/record callbacks can resolve the active
  // camera without depending on render-scoped state
  const cameraPositionRef = useRef(cameraPosition);
  cameraPositionRef.current = cameraPosition;
  const getActiveCamera = useCallback(
    () =>
      cameraPositionRef.current === CameraPosition.BACK
        ? backCameraRef.current
        : frontCameraRef.current,
    [],
  );
  const [flashMode, setFlashMode] = useState<FlashMode>(FlashMode.OFF);
  const [captureMode, setCaptureMode] = useState<CaptureMode>(
    CaptureMode.PHOTO,
  );
  const [timerMode, setTimerMode] = useState<TimerMode>(0);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [nightMode, setNightMode] = useState(false);

  // Media state (video preview flow)
  const [capturedMedia, setCapturedMedia] = useState<CapturedMedia | null>(
    null,
  );
  const [showPreview, setShowPreview] = useState(false);
  const [isSavingMedia, setIsSavingMedia] = useState(false);

  // Quick-save photo flow (auto-save + thumbnail drop + confirmation sheet)
  const [quickPhoto, setQuickPhoto] = useState<string | null>(null);
  const [quickPhotoStatus, setQuickPhotoStatus] =
    useState<PhotoSaveStatus>("saving");
  // Where THIS capture auto-saved (drives the confirmation sheet's content)
  const [quickPhotoDestKind, setQuickPhotoDestKind] = useState<
    "gallery" | "album"
  >("gallery");
  const [quickPhotoAlbumTitle, setQuickPhotoAlbumTitle] = useState<
    string | undefined
  >(undefined);
  const quickPhotoAssetRef = useRef<MediaLibrary.Asset | null>(null);
  // The album this capture was auto-uploaded to (photoId filled on success),
  // so the sheet's remove/move/retry actions can target the uploaded photo
  const quickAlbumRef = useRef<{
    albumId: string;
    title: string;
    photoId: string | null;
  } | null>(null);
  // Sticky destination picker (opened from the button right of the shutter)
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);

  // iOS-camera-style last-capture thumbnail next to the capture button.
  // Seeded from the device library's newest photo OR video (only when
  // permission is already granted — opening the camera must not prompt),
  // then kept current by in-session captures.
  const [lastCapture, setLastCapture] = useState<{
    uri: string;
    mediaType: "photo" | "video";
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await MediaLibrary.getPermissionsAsync();
        if (status !== "granted") return;
        const { assets } = await MediaLibrary.getAssetsAsync({
          first: 1,
          mediaType: [
            MediaLibrary.MediaType.photo,
            MediaLibrary.MediaType.video,
          ],
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        const asset = assets[0];
        if (!asset || cancelled) return;
        // ph:// asset uris need resolving to a displayable local uri
        const info = await MediaLibrary.getAssetInfoAsync(asset);
        if (cancelled) return;
        const uri = info.localUri ?? asset.uri;
        const mediaType: "photo" | "video" =
          asset.mediaType === "video" ? "video" : "photo";
        // A capture that landed while this resolved wins over the seed
        setLastCapture((prev) => prev ?? { uri, mediaType });
      } catch {
        // No seed — the thumbnail appears after the first capture
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Self-timer countdown state
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // Focus & exposure state
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const exposureBias = useSharedValue(0);

  // Screen-flash (front camera) and shutter blink overlays
  const [screenFlashOn, setScreenFlashOn] = useState(false);
  const shutterBlink = useSharedValue(0);

  // Blur shade over the preview during front/back flips. While the native
  // session reconfigures, the preview layer letterboxes the old camera's
  // last frame (a visible "zoom out" with black bars) before the new device
  // streams — a live blur of the stale/incoming preview hides that (iOS;
  // Android falls back to a translucent scrim), then fades out on
  // onPreviewStarted.
  const flipShade = useSharedValue(0);
  const flipShadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Black shade masking camera (re)activation: opaque while the session is
  // spinning up (first mount, or swiping back to this tab), fading out once
  // the preview actually streams — no startup flicker reaches the eye.
  const activationShade = useSharedValue(1);

  // Devices: multi-cam back device so 0.5x engages the ultra-wide lens
  const backDevice = useCameraDevice("back", {
    physicalDevices: [
      "ultra-wide-angle-camera",
      "wide-angle-camera",
      "telephoto-camera",
    ],
  });
  const frontDevice = useCameraDevice("front");
  const device =
    cameraPosition === CameraPosition.BACK ? backDevice : frontDevice;

  // Back format: widest field of view first, matching the native camera /
  // Snapchat at 1x. Screen-aspect (16:9) formats on iPhones are often
  // narrower-FOV sensor readouts than the full 4:3 formats the native
  // camera previews — preferring them made 1x look zoomed-in. So: among
  // formats meeting fps/resolution floors, take the widest FOV,
  // tie-breaking on photo then video resolution. Captured photos are
  // full-sensor 4:3 while the fullscreen preview shows a center
  // cover-crop of that frame — identical to Snapchat's behavior.
  // Computed for the BACK device unconditionally — both cameras stay
  // mounted with their sessions configured (see the render), so a flip
  // only stops one session and starts the other instead of
  // reconfiguring from scratch.
  const backFormat = useMemo(() => {
    if (!backDevice) return undefined;
    const hd = backDevice.formats.filter(
      (f) => f.maxFps >= 30 && f.videoWidth >= 1920,
    );
    const sd = backDevice.formats.filter(
      (f) => f.maxFps >= 30 && f.videoWidth >= 1280,
    );
    const pool =
      hd.length > 0 ? hd : sd.length > 0 ? sd : backDevice.formats;
    return [...pool].sort((a, b) => {
      const fovDiff = b.fieldOfView - a.fieldOfView;
      if (Math.abs(fovDiff) > 0.1) return fovDiff;
      // Prefer the 12MP-class sensor readouts over the 48MP ones: the
      // native camera also shoots 12MP by default, and takePhoto on the
      // 48MP formats fails with AVFoundation -11803 ("Cannot record")
      const aStd = a.photoWidth <= 4100 ? 1 : 0;
      const bStd = b.photoWidth <= 4100 ? 1 : 0;
      if (aStd !== bStd) return bStd - aStd;
      // VIDEO resolution before photo: the preview streams at the format's
      // video size, so at equal FOV the 4K variant gives a Snapchat-crisp
      // preview where the 1080p one looks soft on modern screens. Photo
      // capture is 12MP-class either way (the aStd/bStd gate above).
      const videoDiff =
        b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight;
      if (videoDiff !== 0) return videoDiff;
      return b.photoWidth * b.photoHeight - a.photoWidth * a.photoHeight;
    })[0];
  }, [backDevice]);

  // The default ranking picks a narrow field-of-view format on the front
  // camera, which makes selfies look cropped/zoomed-in. Choose the widest
  // FOV the front camera offers (among formats meeting fps/resolution
  // floors), tie-breaking on photo resolution.
  const frontFormat = useMemo(() => {
    if (!frontDevice) return undefined;
    const candidates = frontDevice.formats.filter(
      (f) => f.maxFps >= 30 && f.videoWidth >= 1280,
    );
    const pool = candidates.length > 0 ? candidates : frontDevice.formats;
    return [...pool].sort((a, b) => {
      const fovDiff = b.fieldOfView - a.fieldOfView;
      if (Math.abs(fovDiff) > 0.1) return fovDiff;
      // Prefer screen-shaped (16:9) photos over squarish 4:3 ones so
      // selfies keep the preview's full height when saved
      const aspectDistA = Math.abs(
        a.photoWidth / a.photoHeight - SCREEN_ASPECT_RATIO,
      );
      const aspectDistB = Math.abs(
        b.photoWidth / b.photoHeight - SCREEN_ASPECT_RATIO,
      );
      if (Math.abs(aspectDistA - aspectDistB) > 0.05) {
        return aspectDistA - aspectDistB;
      }
      // Preview streams at video size — prefer the crisper variant first
      const videoDiff =
        b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight;
      if (videoDiff !== 0) return videoDiff;
      return b.photoWidth * b.photoHeight - a.photoWidth * a.photoHeight;
    })[0];
  }, [frontDevice]);

  // Stabilization OFF, matching Snapchat / the native camera's PHOTO mode:
  // EIS ("standard" and up) center-crops the preview ~10%, which read as
  // "the camera is zoomed in" next to Snapchat, and its processing softens
  // the live preview. Hardware OIS still smooths handheld shots, and video
  // recordings trade a little shake for the honest full-width FOV — the
  // same trade Snapchat makes.
  const backStabilization = "off" as const;
  const frontStabilization = "off" as const;

  // Runtime spec visibility: what each camera actually resolved to
  useEffect(() => {
    if (!__DEV__) return;
    const describe = (
      label: string,
      f: typeof backFormat,
      stab: string | undefined,
    ) => {
      if (!f) return;
      console.log(
        `[camera] ${label}: photo ${f.photoWidth}x${f.photoHeight}, ` +
          `video ${f.videoWidth}x${f.videoHeight}@${f.maxFps}fps, ` +
          `FOV ${f.fieldOfView.toFixed(1)}°, stabilization ${stab ?? "off"}, ` +
          `photoHDR ${f.supportsPhotoHdr}`,
      );
    };
    describe("back", backFormat, backStabilization);
    describe("front", frontFormat, frontStabilization);
  }, [backFormat, frontFormat, backStabilization, frontStabilization]);

  // Zoom hook (display-zoom space: 1 = neutral wide lens)
  const {
    zoom,
    minZoom,
    maxZoom,
    neutralZoom,
    setZoom,
    zoomLevels,
    activePreset,
    setZoomPreset,
    syncZoomState,
    pinchGestureHandler,
    animatedZoom,
  } = useCameraZoom({ device });

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
  const [isCameraVisible, setIsCameraVisible] = useState(true);
  const updateCameraVisibility = useCallback(
    (visible: boolean) => {
      setIsCameraVisible(visible);
      // Leaving the tab: snap the shade opaque so the NEXT activation
      // starts black instead of flashing the stale/starting preview
      if (!visible) {
        activationShade.value = 1;
      }
    },
    [activationShade],
  );

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
  // Album-capture mode narrows the sheet's album picker to the target album,
  // preserving that flow (auto-save to gallery, add to the one album on a
  // user action). The main tab's picker sees every album.
  const saveSheetAlbums = albumId
    ? albums?.filter((album) => album.albumId === albumId)
    : albums;
  const uploadPhotoMutation = useUploadPhotoMutation();
  const deletePhotoMutation = useDeletePhotoMutation();
  const addAlbumAssociation = usePhotoAlbumStore(
    (state) => state.addAssociation,
  );

  // Sticky auto-save destination (main-tab camera only). Album-capture mode
  // (albumId prop) keeps its own flow and never reads this.
  const destination = useCaptureDestinationStore((state) => state.destination);
  const setDestination = useCaptureDestinationStore(
    (state) => state.setDestination,
  );
  // Resolve at the read site: a stored album that no longer exists falls
  // back to gallery (the store itself doesn't know the album list).
  const resolvedDestination: CaptureDestination =
    destination.type === "album" &&
    !albums?.some((a) => a.albumId === destination.albumId)
      ? { type: "gallery" }
      : destination;
  // Ref mirror so the memoized capture callback reads the latest value
  // without being re-created on every destination/albums change.
  const resolvedDestinationRef = useRef(resolvedDestination);
  resolvedDestinationRef.current = resolvedDestination;

  // Animated camera props: display zoom → native zoom, plus exposure
  // bias. One set PER camera (both stay mounted for instant flips), each
  // clamping to its own device's ranges. The shared animatedZoom resets
  // to 1 on every flip, and neutralZoom differs per device, so the
  // inactive camera idles at sane values.
  const backMinZoom = backDevice?.minZoom ?? 1;
  const backMaxZoom = backDevice?.maxZoom ?? 1;
  const backNeutral = backDevice?.neutralZoom ?? 1;
  const backMinExposure = backDevice?.minExposure ?? 0;
  const backMaxExposure = backDevice?.maxExposure ?? 0;
  const frontMinZoom = frontDevice?.minZoom ?? 1;
  const frontMaxZoom = frontDevice?.maxZoom ?? 1;
  const frontNeutral = frontDevice?.neutralZoom ?? 1;
  const frontMinExposure = frontDevice?.minExposure ?? 0;
  const frontMaxExposure = frontDevice?.maxExposure ?? 0;

  const backAnimatedProps = useAnimatedProps(() => {
    const nativeZoom = Math.max(
      backMinZoom,
      Math.min(backMaxZoom, animatedZoom.value * backNeutral),
    );
    const exposure = interpolate(
      exposureBias.value,
      [-1, 0, 1],
      [backMinExposure, 0, backMaxExposure],
      Extrapolation.CLAMP,
    );
    return { zoom: nativeZoom, exposure };
  }, [backMinZoom, backMaxZoom, backNeutral, backMinExposure, backMaxExposure]);

  const frontAnimatedProps = useAnimatedProps(() => {
    const nativeZoom = Math.max(
      frontMinZoom,
      Math.min(frontMaxZoom, animatedZoom.value * frontNeutral),
    );
    const exposure = interpolate(
      exposureBias.value,
      [-1, 0, 1],
      [frontMinExposure, 0, frontMaxExposure],
      Extrapolation.CLAMP,
    );
    return { zoom: nativeZoom, exposure };
  }, [
    frontMinZoom,
    frontMaxZoom,
    frontNeutral,
    frontMinExposure,
    frontMaxExposure,
  ]);

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

  const shutterBlinkStyle = useAnimatedStyle(() => ({
    opacity: shutterBlink.value,
  }));

  const flipShadeStyle = useAnimatedStyle(() => ({
    opacity: flipShade.value,
  }));

  const activationShadeStyle = useAnimatedStyle(() => ({
    opacity: activationShade.value,
  }));

  const endFlipShade = useCallback(() => {
    if (flipShadeTimerRef.current) {
      clearTimeout(flipShadeTimerRef.current);
      flipShadeTimerRef.current = null;
    }
    flipShade.value = withTiming(0, { duration: 200 });
  }, [flipShade]);

  // The new device's preview is streaming — reveal it. (Also fires on the
  // initial session start, where the shade is already down — harmless.)
  const handlePreviewStarted = useCallback(() => {
    endFlipShade();
    // Session is streaming — reveal the live preview with a smooth fade
    activationShade.value = withTiming(0, { duration: 300 });
  }, [endFlipShade, activationShade]);

  // The shade timer must never outlive the screen
  useEffect(
    () => () => {
      if (flipShadeTimerRef.current) {
        clearTimeout(flipShadeTimerRef.current);
      }
    },
    [],
  );

  // Camera flip (toolbar button + double tap). The shade snaps on fully
  // opaque in the same frame — no fade-in, or the reconfigure artifact
  // would peek through — and the device toggles immediately underneath.
  const flipCamera = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flipShade.value = 1;
    // Failsafe: if onPreviewStarted never comes (camera error), reveal
    // whatever is there rather than staying black
    if (flipShadeTimerRef.current) {
      clearTimeout(flipShadeTimerRef.current);
    }
    flipShadeTimerRef.current = setTimeout(endFlipShade, 1500);
    setCameraPosition((prev) =>
      prev === CameraPosition.BACK ? CameraPosition.FRONT : CameraPosition.BACK,
    );
    setFocusPoint(null);
    exposureBias.value = 0;
  }, [exposureBias, flipShade, endFlipShade]);

  // Tap to focus: show reticle + exposure slider, focus the camera
  const handleFocus = useCallback(
    (x: number, y: number) => {
      exposureBias.value = 0;
      setFocusPoint({ x, y });

      if (device?.supportsFocus) {
        getActiveCamera()
          ?.focus({ x, y })
          .catch(() => {
            // Focus was cancelled by a newer focus request — ignore
          });
      }
    },
    [device?.supportsFocus, exposureBias, getActiveCamera],
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

  // ---------------------------------------------------------------------
  // Capture location: fetched in the background whenever something is
  // captured, so an upload that follows can tag the photo with where it
  // was taken. Permission is asked on the first capture (contextual),
  // and everything is best-effort — captures never wait on a GPS fix.
  // ---------------------------------------------------------------------
  const captureLocationRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  // Guards a slow fix from tagging a later capture
  const locationFetchIdRef = useRef(0);

  const captureCurrentLocation = useCallback(async () => {
    const fetchId = ++locationFetchIdRef.current;
    captureLocationRef.current = null;
    try {
      let { status, canAskAgain } =
        await Location.getForegroundPermissionsAsync();
      if (status !== "granted" && canAskAgain) {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== "granted") return;

      // A recent cached fix is instant; otherwise get a fresh one
      let position = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
      });
      if (!position) {
        position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      }
      if (!position || locationFetchIdRef.current !== fetchId) return;
      captureLocationRef.current = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch {
      // No location for this capture — the photo simply goes untagged
    }
  }, []);

  // Auto-save a captured photo to the device gallery
  const saveQuickPhotoToGallery = useCallback(
    async (fileUri: string) => {
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") {
          setQuickPhotoStatus("unsaved");
          return;
        }
        const asset = await MediaLibrary.createAssetAsync(fileUri);
        quickPhotoAssetRef.current = asset;
        setQuickPhotoStatus("saved");
        triggerGalleryRefresh();
      } catch (error) {
        if (__DEV__) console.error("Failed to auto-save photo:", error);
        setQuickPhotoStatus("unsaved");
      }
    },
    [triggerGalleryRefresh],
  );

  // Auto-upload a captured photo straight to an album (destination = album:
  // the photo is NOT written to the device gallery). Mirrors the album
  // "Adding to…" pill pattern; tracks the uploaded photoId so the sheet's
  // remove/move/retry actions can act on it.
  const uploadQuickPhotoToAlbum = useCallback(
    (fileUri: string, targetAlbumId: string, title: string) => {
      const entry = { albumId: targetAlbumId, title, photoId: null as string | null };
      quickAlbumRef.current = entry;
      setQuickPhotoStatus("saving");

      const location = captureLocationRef.current;
      const uploadId = `album-upload-${Date.now()}`;
      uploadIndicator.begin(uploadId, `Adding to ${title}…`);
      uploadPhotoMutation
        .mutateAsync({
          albumId: targetAlbumId,
          fileUri,
          fileName: `capture_${Date.now()}.jpg`,
          mimeType: "image/jpeg",
          latitude: location?.latitude,
          longitude: location?.longitude,
        })
        .then((data) => {
          entry.photoId = data.photoId;
          // Only reflect status if this is still the active capture's upload
          if (quickAlbumRef.current === entry) {
            setQuickPhotoStatus("saved");
          }
          uploadIndicator.succeed(uploadId, `Added to ${title}`);
          onPhotoUploaded?.(data);
        })
        .catch(() => {
          if (quickAlbumRef.current === entry) {
            setQuickPhotoStatus("failed");
          }
          uploadIndicator.fail(uploadId);
        });
    },
    [uploadPhotoMutation, onPhotoUploaded],
  );

  // Photo capture — auto-saves to the current destination, then the frame
  // drops into a bottom-left thumbnail with a confirmation sheet
  const capturePhoto = useCallback(async () => {
    const camera = getActiveCamera();
    if (!camera) return;

    const useScreenFlash =
      cameraPosition === CameraPosition.FRONT && flashMode !== FlashMode.OFF;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (useScreenFlash) {
        // Light the screen and give the sensor a moment to adjust
        setScreenFlashOn(true);
        await delay(220);
      } else {
        shutterBlink.value = withSequence(
          withTiming(0.85, { duration: 40 }),
          withTiming(0, { duration: 160 }),
        );
      }

      const photo = await camera.takePhoto({
        flash:
          cameraPosition === CameraPosition.BACK && device?.hasFlash
            ? flashMode === FlashMode.ON
              ? "on"
              : flashMode === FlashMode.AUTO
                ? "auto"
                : "off"
            : "off",
        enableShutterSound: true,
      });

      const fileUri = photo.path.startsWith("file://")
        ? photo.path
        : `file://${photo.path}`;

      quickPhotoAssetRef.current = null;
      quickAlbumRef.current = null;
      setQuickPhoto(fileUri);
      setLastCapture({ uri: fileUri, mediaType: "photo" });

      // Fetch where this was taken while the sheet is up (before the upload
      // reads captureLocationRef in the album branch)
      captureCurrentLocation();

      // Auto-save to the current destination. In album-capture mode
      // (albumId prop) there is no destination button — keep gallery.
      const dest = albumId
        ? ({ type: "gallery" } as CaptureDestination)
        : resolvedDestinationRef.current;
      if (dest.type === "album") {
        const album = albums?.find((a) => a.albumId === dest.albumId);
        const title = album?.title ?? "Album";
        setQuickPhotoDestKind("album");
        setQuickPhotoAlbumTitle(title);
        // Destination = album: upload straight to it, NOT to the gallery
        uploadQuickPhotoToAlbum(fileUri, dest.albumId, title);
      } else {
        setQuickPhotoDestKind("gallery");
        setQuickPhotoAlbumTitle(undefined);
        setQuickPhotoStatus("saving");
        // Save immediately in the background; the sheet reflects the status
        saveQuickPhotoToGallery(fileUri);
      }
    } catch (error) {
      if (__DEV__) console.error("Failed to take photo:", error);
      notify.error("Capture Failed", "Could not take photo. Please try again.");
    } finally {
      setScreenFlashOn(false);
    }
  }, [
    flashMode,
    cameraPosition,
    device?.hasFlash,
    shutterBlink,
    saveQuickPhotoToGallery,
    captureCurrentLocation,
    getActiveCamera,
    albumId,
    albums,
    uploadQuickPhotoToAlbum,
  ]);

  // Quick-save sheet handlers
  // Remove: gallery destination → delete the device asset; album destination
  // → delete the uploaded album photo. Then the sheet dismisses.
  const handleQuickRemove = useCallback(async () => {
    const asset = quickPhotoAssetRef.current;
    const album = quickAlbumRef.current;
    quickPhotoAssetRef.current = null;
    quickAlbumRef.current = null;
    setQuickPhoto(null);
    if (album?.photoId) {
      deletePhotoMutation
        .mutateAsync({ albumId: album.albumId, photoId: album.photoId })
        .catch((error) => {
          if (__DEV__) console.error("Failed to remove album photo:", error);
          notify.error("Remove Failed", "Could not remove photo from album");
        });
    } else if (asset) {
      try {
        await MediaLibrary.deleteAssetsAsync([asset]);
        triggerGalleryRefresh();
      } catch (error) {
        if (__DEV__) console.error("Failed to remove photo:", error);
        notify.error("Remove Failed", "Could not remove photo from gallery");
      }
    }
  }, [triggerGalleryRefresh, deletePhotoMutation]);

  // Save to Gallery: album destination → write the captured file to the
  // gallery too (a side action, tracked via the pill so it doesn't overwrite
  // the sheet's destination status); gallery destination → retry the save
  // (shown only when permission was denied).
  const handleQuickSaveToGallery = useCallback(() => {
    if (!quickPhoto) return;
    if (quickAlbumRef.current) {
      const fileUri = quickPhoto;
      const saveId = `gallery-save-${Date.now()}`;
      uploadIndicator.begin(saveId, "Saving to gallery…");
      MediaLibrary.requestPermissionsAsync()
        .then(async ({ status }) => {
          if (status !== "granted") {
            uploadIndicator.fail(saveId);
            return;
          }
          const asset = await MediaLibrary.createAssetAsync(fileUri);
          quickPhotoAssetRef.current = asset;
          triggerGalleryRefresh();
          uploadIndicator.succeed(saveId, "Saved to gallery");
        })
        .catch(() => uploadIndicator.fail(saveId));
    } else {
      setQuickPhotoStatus("saving");
      saveQuickPhotoToGallery(quickPhoto);
    }
  }, [quickPhoto, saveQuickPhotoToGallery, triggerGalleryRefresh]);

  // Change album (one-off — does NOT change the sticky preference):
  // gallery destination → add to the chosen album (photo stays in gallery);
  // album destination → MOVE (upload to the new album, then delete from the
  // original once the new upload succeeds). Progress shows via the pill.
  const handleQuickChangeAlbum = useCallback(
    (targetAlbumId: string) => {
      if (!quickPhoto) return;
      const fileUri = quickPhoto;
      const album = albums?.find((a) => a.albumId === targetAlbumId);
      const title = album?.title ?? "Album";
      const prev = quickAlbumRef.current;
      const asset = quickPhotoAssetRef.current;

      // Gallery destination keeps the local asset associated with the album
      if (!prev && album && asset?.uri) {
        addAlbumAssociation(asset.uri, targetAlbumId, title);
      }

      const location = captureLocationRef.current;
      const uploadId = `album-upload-${Date.now()}`;
      uploadIndicator.begin(uploadId, `Adding to ${title}…`);
      uploadPhotoMutation
        .mutateAsync({
          albumId: targetAlbumId,
          fileUri,
          fileName: `capture_${Date.now()}.jpg`,
          mimeType: "image/jpeg",
          latitude: location?.latitude,
          longitude: location?.longitude,
        })
        .then((data) => {
          uploadIndicator.succeed(uploadId, `Added to ${title}`);
          onPhotoUploaded?.(data);
          // Album destination: this was a MOVE — remove from the original
          // album only after the new upload succeeded (a failed move keeps
          // the photo safe in its original album).
          if (prev?.photoId && prev.albumId !== targetAlbumId) {
            deletePhotoMutation
              .mutateAsync({ albumId: prev.albumId, photoId: prev.photoId })
              .catch(() => {});
          }
        })
        .catch(() => uploadIndicator.fail(uploadId));

      quickPhotoAssetRef.current = null;
      quickAlbumRef.current = null;
      setQuickPhoto(null);
    },
    [
      quickPhoto,
      albums,
      addAlbumAssociation,
      uploadPhotoMutation,
      deletePhotoMutation,
      onPhotoUploaded,
    ],
  );

  // Retry a failed album auto-upload (offline)
  const handleQuickRetry = useCallback(() => {
    if (!quickPhoto) return;
    const album = quickAlbumRef.current;
    if (album) {
      uploadQuickPhotoToAlbum(quickPhoto, album.albumId, album.title);
    }
  }, [quickPhoto, uploadQuickPhotoToAlbum]);

  const handleQuickDismiss = useCallback(() => {
    quickPhotoAssetRef.current = null;
    quickAlbumRef.current = null;
    setQuickPhoto(null);
  }, []);

  // Sticky destination picker (button right of the shutter)
  const handleSelectGalleryDestination = useCallback(() => {
    setDestination({ type: "gallery" });
    setShowDestinationPicker(false);
  }, [setDestination]);

  const handleSelectAlbumDestination = useCallback(
    (targetAlbumId: string) => {
      setDestination({ type: "album", albumId: targetAlbumId });
      setShowDestinationPicker(false);
    },
    [setDestination],
  );

  // Self-timer countdown
  const cancelCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
  }, []);

  const handleCapturePress = useCallback(() => {
    if (countdown != null) return;

    if (timerMode === 0) {
      capturePhoto();
      return;
    }

    let remaining = timerMode as number;
    setCountdown(remaining);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        cancelCountdown();
        capturePhoto();
      } else {
        setCountdown(remaining);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }, 1000);
  }, [countdown, timerMode, capturePhoto, cancelCountdown]);

  useEffect(() => cancelCountdown, [cancelCountdown]);

  // Video recording handlers (driven by the capture button hold gesture)
  const handleRecordStart = useCallback(() => {
    const camera = getActiveCamera();
    if (!camera) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startRecording(camera);
  }, [startRecording, getActiveCamera]);

  const handleRecordStop = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await stopRecording();
  }, [stopRecording]);

  // Toolbar handlers
  const handleFlashChange = useCallback((mode: FlashMode) => {
    Haptics.selectionAsync();
    setFlashMode(mode);
  }, []);

  const handleTimerChange = useCallback((mode: TimerMode) => {
    Haptics.selectionAsync();
    setTimerMode(mode);
  }, []);

  const handleToggleGrid = useCallback(() => {
    Haptics.selectionAsync();
    setGridEnabled((v) => !v);
  }, []);

  const handleToggleNight = useCallback(() => {
    Haptics.selectionAsync();
    setNightMode((v) => !v);
  }, []);

  const handleModeChange = useCallback((mode: CaptureMode) => {
    Haptics.selectionAsync();
    setCaptureMode(mode);
  }, []);

  // Zoom preset handler
  const handleZoomPreset = useCallback(
    (preset: (typeof zoomLevels)[number]) => {
      Haptics.selectionAsync();
      setZoomPreset(preset);
    },
    [setZoomPreset],
  );

  // Media preview handlers
  const handleClosePreview = useCallback(() => {
    setShowPreview(false);
    setCapturedMedia(null);
    resetRecording();
  }, [resetRecording]);

  // The video/preview flow captures via the recording hook — fetch the
  // location as soon as its media lands, mirroring the photo path
  useEffect(() => {
    if (capturedMedia) {
      captureCurrentLocation();
    }
  }, [capturedMedia, captureCurrentLocation]);

  const handleSaveMedia = useCallback(
    async (albumId?: string) => {
      // Guard against double-tap: a second press while the first save is
      // in flight would save (and upload) the media twice
      if (!capturedMedia?.path || isSavingMedia) return;
      setIsSavingMedia(true);

      const fileUri = capturedMedia.path.startsWith("file://")
        ? capturedMedia.path
        : `file://${capturedMedia.path}`;

      // Determine file info. The extension/mimetype must match the actual
      // recorded container — iOS records .mov (video/quicktime); uploading
      // it renamed as .mp4 made the backend store an unplayable "photo".
      const isVideo = "duration" in capturedMedia;
      let extension = "jpg";
      let mimeType = "image/jpeg";
      if (isVideo) {
        const pathExtension = capturedMedia.path
          .split(".")
          .pop()
          ?.toLowerCase();
        if (pathExtension === "mov") {
          extension = "mov";
          mimeType = "video/quicktime";
        } else if (pathExtension === "webm") {
          extension = "webm";
          mimeType = "video/webm";
        } else {
          extension = "mp4";
          mimeType = "video/mp4";
        }
      }
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
        // In-session video/photo saves update the docked thumbnail too
        setLastCapture({
          uri: fileUri,
          mediaType: isVideo ? "video" : "photo",
        });

        // If saving to album, upload in background (don't await)
        if (albumId) {
          const album = albums?.find((a) => a.albumId === albumId);

          // Store album association immediately for the local asset
          if (album && asset.uri) {
            addAlbumAssociation(asset.uri, albumId, album.title);
          }

          const location = captureLocationRef.current;
          const uploadId = `album-upload-${Date.now()}`;
          uploadIndicator.begin(uploadId, "Adding to album…");
          // See the quick-photo path above: mutateAsync so unmount can't
          // swallow the success/fail callback and strand the pill.
          uploadPhotoMutation
            .mutateAsync({
              albumId,
              fileUri,
              fileName,
              mimeType,
              latitude: location?.latitude,
              longitude: location?.longitude,
            })
            .then((data) => {
              uploadIndicator.succeed(uploadId, "Added to album");
              onPhotoUploaded?.(data);
            })
            .catch(() => {
              uploadIndicator.fail(uploadId);
            });
        } else {
          // No network work happened — flash a brief success pill so the
          // save still gets acknowledged (begin+succeed jumps straight to
          // the checkmark state, per the indicator contract)
          const saveId = `gallery-save-${Date.now()}`;
          uploadIndicator.begin(saveId);
          uploadIndicator.succeed(saveId, "Saved to gallery");
        }

        // Close preview immediately
        handleClosePreview();
      } catch (error) {
        if (__DEV__) console.error("Failed to save media:", error);
        notify.error("Save Failed", "Could not save media to gallery");
      } finally {
        setIsSavingMedia(false);
      }
    },
    [
      capturedMedia,
      isSavingMedia,
      handleClosePreview,
      triggerGalleryRefresh,
      uploadPhotoMutation,
      albums,
      addAlbumAssociation,
      onPhotoUploaded,
    ],
  );

  const handleDeleteMedia = useCallback(() => {
    handleClosePreview();
  }, [handleClosePreview]);

  // Flash is available on back camera (hardware) or front camera (screen flash)
  const isFlashAvailable =
    device?.hasFlash || cameraPosition === CameraPosition.FRONT;

  // Front video with flash on: light up the screen edges as a soft torch
  const showFrontTorch =
    isRecording &&
    cameraPosition === CameraPosition.FRONT &&
    flashMode !== FlashMode.OFF;

  // Pushed-route fullscreen (album capture) has neither the tabs' top bar
  // above nor the tab bar below — the tabbed offsets would strand the top
  // buttons too low and the capture button too high there
  const isFullscreen = onRequestClose != null;
  const topControlsTop = insets.top + (isFullscreen ? 10 : TOP_BAR_HEIGHT + 10);
  const bottomControlsPadding = insets.bottom + (isFullscreen ? 24 : 80);

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
      {/* Camera with tap-to-focus, double-tap flip, pinch zoom */}
      <GestureDetector gesture={combinedGesture}>
        <View style={StyleSheet.absoluteFill}>
          {/* BOTH cameras stay mounted with configured sessions — a flip
              only stops one and starts the other (fast) instead of
              tearing down and rebuilding a session (slow, especially for
              the triple-lens back device). Only the active one runs
              (iOS allows a single running session); the inactive one
              hides underneath at opacity 0. Each camera keeps its own
              stable ref; capture/focus/record resolve the active one via
              getActiveCamera(). */}
          {backDevice && (
            <ReanimatedCamera
              ref={backCameraRef}
              style={[
                StyleSheet.absoluteFill,
                cameraPosition !== CameraPosition.BACK && styles.cameraHidden,
              ]}
              device={backDevice}
              format={backFormat}
              isActive={
                isCameraVisible &&
                !showPreview &&
                cameraPosition === CameraPosition.BACK
              }
              photo={true}
              video={true}
              audio={hasMicPermission}
              animatedProps={backAnimatedProps}
              enableZoomGesture={false}
              photoQualityBalance="quality"
              photoHdr={backFormat?.supportsPhotoHdr === true}
              videoStabilizationMode={backStabilization}
              lowLightBoost={nightMode && backDevice.supportsLowLightBoost}
              onPreviewStarted={handlePreviewStarted}
            />
          )}
          {frontDevice && (
            <ReanimatedCamera
              ref={frontCameraRef}
              style={[
                StyleSheet.absoluteFill,
                cameraPosition !== CameraPosition.FRONT && styles.cameraHidden,
              ]}
              device={frontDevice}
              format={frontFormat}
              isActive={
                isCameraVisible &&
                !showPreview &&
                cameraPosition === CameraPosition.FRONT
              }
              photo={true}
              video={true}
              audio={hasMicPermission}
              animatedProps={frontAnimatedProps}
              enableZoomGesture={false}
              photoQualityBalance="quality"
              photoHdr={frontFormat?.supportsPhotoHdr === true}
              videoStabilizationMode={frontStabilization}
              lowLightBoost={nightMode && frontDevice.supportsLowLightBoost}
              onPreviewStarted={handlePreviewStarted}
            />
          )}
        </View>
      </GestureDetector>

      {/* Black activation shade: opaque until the (re)activated session
          actually streams, then fades out — masks the startup flicker when
          swiping back to the camera tab. Sits above the preview, below the
          controls so the UI stays visible on the black. */}
      <Animated.View
        style={[styles.activationShade, activationShadeStyle]}
        pointerEvents="none"
      />

      {/* Blur hiding the preview while a flip reconfigures the session.
          iOS blurs the stale/incoming preview live beneath; Android's
          translucent fallback is acceptable. Opacity is driven by the
          same flipShade shared value as before. */}
      <Animated.View
        style={[styles.flipShade, flipShadeStyle]}
        pointerEvents="none"
      >
        <BlurView
          intensity={70}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Rule-of-thirds grid */}
      <GridOverlay visible={gridEnabled} />

      {/* Focus reticle + exposure slider */}
      <FocusExposureControl point={focusPoint} exposureBias={exposureBias} />

      {/* Close button (pushed-route mode, e.g. album capture) */}
      {onRequestClose && !isRecording && (
        <Animated.View
          style={[
            styles.closeButtonContainer,
            { top: topControlsTop },
            controlsFadeStyle,
          ]}
        >
          <TouchableOpacity
            onPress={onRequestClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close camera"
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Side toolbar (hidden while recording, like Snapchat) */}
      {!isRecording && (
        <Animated.View
          style={[
            styles.toolbarContainer,
            { top: topControlsTop },
            controlsFadeStyle,
          ]}
        >
          <CameraToolbar
            cameraPosition={cameraPosition}
            onFlip={flipCamera}
            flashAvailable={!!isFlashAvailable}
            flashMode={flashMode}
            onFlashChange={handleFlashChange}
            timerMode={timerMode}
            onTimerChange={handleTimerChange}
            gridEnabled={gridEnabled}
            onToggleGrid={handleToggleGrid}
            nightSupported={device.supportsLowLightBoost}
            nightMode={nightMode}
            onToggleNight={handleToggleNight}
            disabled={countdown != null}
          />
        </Animated.View>
      )}

      {/* Recording timer */}
      {isRecording && (
        <Animated.View
          style={[
            styles.timerContainer,
            { top: topControlsTop + 60 },
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

      {/* Bottom controls */}
      <Animated.View
        style={[
          styles.bottomControlsContainer,
          { paddingBottom: bottomControlsPadding },
          controlsFadeStyle,
        ]}
      >
        {/* Zoom presets (0.5x / 1x / 2x / 3x) */}
        <View style={styles.zoomPresetContainer}>
          <ZoomPresetSelector
            zoomLevels={zoomLevels}
            activePreset={activePreset}
            currentZoom={zoom}
            onSelect={handleZoomPreset}
            disabled={countdown != null}
          />
        </View>

        {/* Capture button: tap = photo (or start/stop video), hold = video, drag = zoom */}
        <View style={styles.captureButtonContainer}>
          {/* iOS-style last-photo thumbnail, docked left of the shutter.
              Hidden while recording, and while the quick-save sheet's own
              docked thumb occupies the bottom-left corner. */}
          {!isRecording && !quickPhoto && (
            <View style={styles.lastCaptureContainer} pointerEvents="box-none">
              <LastCaptureThumbnail capture={lastCapture} />
            </View>
          )}
          <CaptureButton
            mode={captureMode}
            onCapture={handleCapturePress}
            onRecordStart={handleRecordStart}
            onRecordStop={handleRecordStop}
            isRecording={isRecording}
            recordingDuration={recordingDuration}
            maxDuration={RECORDING_CONFIG.MAX_DURATION}
            zoomValue={animatedZoom}
            minZoom={minZoom}
            maxZoom={maxZoom}
            onZoomSettled={syncZoomState}
            disabled={countdown != null}
          />
          {/* Auto-save destination chip, docked right of the shutter
              (mirrors the thumbnail on the left). Main-tab camera only —
              album-capture mode (albumId prop) hides it and keeps its flow. */}
          {!isRecording && !quickPhoto && !albumId && (
            <View
              style={styles.destinationContainer}
              pointerEvents="box-none"
            >
              <CaptureDestinationButton
                destination={resolvedDestination}
                albums={albums}
                onPress={() => setShowDestinationPicker(true)}
              />
            </View>
          )}
        </View>

        {/* Photo/Video mode toggle + hint */}
        {!isRecording && (
          <>
            <View style={styles.modeToggleContainer}>
              <ModeToggle
                mode={captureMode}
                onModeChange={handleModeChange}
                disabled={countdown != null}
              />
            </View>
            <Text style={styles.captureHint}>
              {captureMode === CaptureMode.PHOTO
                ? "Hold for video"
                : "Tap to record"}
            </Text>
          </>
        )}
      </Animated.View>

      {/* Front-camera "torch": bright screen edges while recording */}
      {showFrontTorch && (
        <View style={styles.frontTorchFrame} pointerEvents="none" />
      )}

      {/* Front-camera screen flash for photos */}
      {screenFlashOn && (
        <View style={styles.screenFlash} pointerEvents="none" />
      )}

      {/* Shutter blink */}
      <Animated.View
        style={[styles.shutterBlink, shutterBlinkStyle]}
        pointerEvents="none"
      />

      {/* Self-timer countdown */}
      <CountdownOverlay
        secondsRemaining={countdown}
        onCancel={cancelCountdown}
      />

      {/* Quick-save photo flow: thumbnail drop + destination confirmation */}
      <PhotoSaveSheet
        photoUri={quickPhoto}
        destinationKind={quickPhotoDestKind}
        albumTitle={quickPhotoAlbumTitle}
        currentAlbumId={quickAlbumRef.current?.albumId}
        status={quickPhotoStatus}
        albums={saveSheetAlbums}
        onRemove={handleQuickRemove}
        onSaveToGallery={handleQuickSaveToGallery}
        onChangeAlbum={handleQuickChangeAlbum}
        onRetry={handleQuickRetry}
        onDismiss={handleQuickDismiss}
      />

      {/* Sticky destination picker (main-tab camera only) */}
      {!albumId && (
        <DestinationPickerSheet
          visible={showDestinationPicker}
          albums={albums}
          showGallery
          title="Save captures to"
          selectedType={resolvedDestination.type}
          selectedAlbumId={
            resolvedDestination.type === "album"
              ? resolvedDestination.albumId
              : null
          }
          onSelectGallery={handleSelectGalleryDestination}
          onSelectAlbum={handleSelectAlbumDestination}
          onClose={() => setShowDestinationPicker(false)}
        />
      )}

      {/* Media preview overlay (videos) */}
      <MediaPreview
        media={capturedMedia}
        onClose={handleClosePreview}
        onSave={handleSaveMedia}
        onDelete={handleDeleteMedia}
        visible={showPreview}
        isUploading={isSavingMedia}
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
  toolbarContainer: {
    position: "absolute",
    right: 16,
  },
  closeButtonContainer: {
    position: "absolute",
    left: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
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
  zoomPresetContainer: {
    marginBottom: 18,
    alignItems: "center",
  },
  captureButtonContainer: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  lastCaptureContainer: {
    position: "absolute",
    left: 26,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  destinationContainer: {
    position: "absolute",
    right: 26,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  modeToggleContainer: {
    marginTop: 18,
    alignItems: "center",
  },
  captureHint: {
    marginTop: 10,
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 12,
    fontWeight: "500",
  },
  screenFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
  },
  frontTorchFrame: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 48,
    borderColor: "rgba(255, 255, 255, 0.95)",
  },
  shutterBlink: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  flipShade: {
    ...StyleSheet.absoluteFillObject,
  },
  activationShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  cameraHidden: {
    opacity: 0,
  },
  scrollOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
});
