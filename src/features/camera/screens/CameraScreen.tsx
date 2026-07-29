/**
 * CameraScreen
 * Snapchat-style camera:
 * - Tap capture for photo, hold for video, drag up while holding to zoom
 * - Zoom presets (0.5x ultra-wide / 1x / 2x / 3x) + pinch to zoom
 * - Tap to focus with iOS-style exposure slider
 * - Side toolbar: flip, flash, self-timer, grid, night mode, dual camera
 * - Screen flash for front camera, torch for back-camera video
 * - Dual mode (iOS A12+): front AND back live at once, composited into a
 *   single photo/video by a native AVCaptureMultiCamSession
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Linking,
  TouchableOpacity,
  Dimensions,
  Pressable,
  InteractionManager,
} from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
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
import { useGetAlbumsQuery } from "@/features/album/api/album.queries";
import {
  useCaptureExtrasStore,
  CaptureExtras,
} from "@/features/camera/store/captureDestinationStore";
import { enqueueCapture } from "@/features/photos/store/libraryUploadQueue";
import {
  selectHasSeenLocationPrimer,
  useOnboardingStore,
} from "@/features/onboarding/store/onboardingStore";
import { useLibraryViewerSession } from "@/features/photos/hooks/useLibraryViewerSession";
import { PhotoViewer, type Frame } from "@/features/photos/components";

// Camera system imports
import {
  CameraPosition,
  CaptureMode,
  FlashMode,
  TimerMode,
  CapturedMedia,
} from "../types";
import { RECORDING_CONFIG } from "../constants";
import { useCameraZoom, useDualCamera, useVideoRecording } from "../hooks";
import { useCameraDevices } from "../hooks/useCameraDevices";
import { useCaptureLocation } from "../hooks/useCaptureLocation";
import {
  isDualCameraSupported,
  setDualAudioEnabled,
  type DualCameraLayout,
} from "../../../../modules/dual-camera";
import {
  CaptureButton,
  ModeToggle,
  VideoTimer,
  MediaPreview,
  ZoomPresetSelector,
  CameraToolbar,
  GridOverlay,
  CountdownOverlay,
  FocusExposureControl,
  LastCaptureThumbnail,
  CaptureDestinationButton,
  CaptureExtrasSheet,
  DualCameraPreview,
  DualLayoutPicker,
  LocationPrimerSheet,
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
   * Set when the camera was opened from a moment's "Post now": the capture
   * is submitted to that event by the upload queue, once its album copy
   * exists (so it survives this screen being closed mid-upload).
   */
  momentTarget?: { momentId: string; eventId: string };
}

export default function CameraScreen({
  albumId,
  onRequestClose,
  momentTarget,
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

  // Dual camera: front AND back streaming at the same time, composited
  // into one frame by the native multi-cam module. Unsupported on
  // Android, in Simulator, and on pre-A12 iPhones — where the toggle
  // never appears and this stays false.
  const [dualMode, setDualMode] = useState(false);
  const [dualLayout, setDualLayout] =
    useState<DualCameraLayout>("horizontal");
  const [dualSwapped, setDualSwapped] = useState(false);
  const [showDualLayouts, setShowDualLayouts] = useState(false);
  /** When dual mode last flipped — see handleOpenDualLayouts. */
  const dualToggledAtRef = useRef(0);

  // Entering or leaving dual mode always starts with the picker closed,
  // whatever opened it last.
  useEffect(() => {
    setShowDualLayouts(false);
  }, [dualMode]);

  // The mic has to be wired in before the multi-cam session configures
  // itself — it can't be added to a running one.
  useEffect(() => {
    void setDualAudioEnabled(hasMicPermission);
  }, [hasMicPermission]);

  // Media state (video preview flow)
  const [capturedMedia, setCapturedMedia] = useState<CapturedMedia | null>(
    null,
  );
  const [showPreview, setShowPreview] = useState(false);
  const [isSavingMedia, setIsSavingMedia] = useState(false);

  // Sticky capture-extras preferences sheet (button right of the shutter)
  const [showExtrasSheet, setShowExtrasSheet] = useState(false);

  // iOS-camera-style last-capture thumbnail next to the capture button.
  // Seeded from the device library's newest photo OR video (only when
  // permission is already granted — opening the camera must not prompt),
  // then kept current by in-session captures.
  const [lastCapture, setLastCapture] = useState<{
    uri: string;
    mediaType: "photo" | "video";
  } | null>(null);
  useEffect(() => {
    // Main-tab thumbnail comes from the Memo library (below), not the device
    // roll — only album-capture mode seeds from the device library.
    if (!albumId) return;
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
  }, [albumId]);

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

  const {
    backDevice,
    frontDevice,
    device,
    backFormat,
    frontFormat,
    backStabilization,
    frontStabilization,
  } = useCameraDevices(cameraPosition);

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

  // Video recording hook (single-camera path)
  const {
    isRecording: isVisionRecording,
    duration: visionRecordingDuration,
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
        duration: visionRecordingDuration,
      } as CapturedMedia);
      setShowPreview(true);
    },
  });

  // Dual-camera recording: the native module writes the already-composited
  // frames, so its output lands in the same preview/save flow as a normal
  // recording — the rest of the screen can't tell them apart.
  const dualCamera = useDualCamera({
    maxDuration: RECORDING_CONFIG.MAX_DURATION,
    onRecordingStop: (video) => {
      setCapturedMedia({
        path: video.path,
        width: video.width,
        height: video.height,
        duration: video.duration,
        timestamp: Date.now(),
        position: dualSwapped ? CameraPosition.FRONT : CameraPosition.BACK,
        flashUsed: false,
      });
      setShowPreview(true);
    },
    onError: (error) => {
      notify.error("Recording failed", error.message);
    },
  });

  // Whichever pipeline is live drives the shutter ring, the timer and the
  // "hide the chrome while recording" rules.
  const isRecording = dualMode ? dualCamera.isRecording : isVisionRecording;
  const recordingDuration = dualMode
    ? dualCamera.duration
    : visionRecordingDuration;

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

  // First time the camera is actually on screen with location still
  // undetermined: present the location primer, which owns the OS prompt
  // (useCaptureLocation only READS permission — see its header). One-shot,
  // persisted. The delay lets the tab swipe settle, and runAfterInteractions
  // is the usual iOS guard against a Modal presented mid-transition.
  const hasSeenLocationPrimer = useOnboardingStore(selectHasSeenLocationPrimer);
  const markLocationPrimerSeen = useOnboardingStore(
    (s) => s.markLocationPrimerSeen,
  );
  const [showLocationPrimer, setShowLocationPrimer] = useState(false);
  const locationPrimerAttemptedRef = useRef(false);
  useEffect(() => {
    if (hasSeenLocationPrimer || locationPrimerAttemptedRef.current) return;
    if (!isCameraVisible || showPreview) return;
    locationPrimerAttemptedRef.current = true;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { status, canAskAgain } =
          await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (status === "granted" || !canAskAgain) {
          // Nothing to prime (already granted, or the OS won't ask again)
          markLocationPrimerSeen();
          return;
        }
        InteractionManager.runAfterInteractions(() => {
          if (!cancelled) setShowLocationPrimer(true);
        });
      } catch {
        // Can't read the status — skip the primer rather than mis-ask
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasSeenLocationPrimer, isCameraVisible, showPreview, markLocationPrimerSeen]);

  const handleLocationPrimerAllow = useCallback(async () => {
    markLocationPrimerSeen();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
    } catch {
      // Declined or unavailable — captures simply go untagged
    }
    setShowLocationPrimer(false);
  }, [markLocationPrimerSeen]);

  const handleLocationPrimerDismiss = useCallback(() => {
    markLocationPrimerSeen();
    setShowLocationPrimer(false);
  }, [markLocationPrimerSeen]);

  // Album data
  const { data: albums } = useGetAlbumsQuery();
  const addAlbumAssociation = usePhotoAlbumStore(
    (state) => state.addAssociation,
  );

  // Main-tab camera only: every capture ALWAYS uploads to the Memo library
  // (the base action). These are the sticky OPTIONAL extras. Album-capture
  // mode (albumId prop) keeps its own gallery-base flow and ignores these.
  const alsoDeviceGallery = useCaptureExtrasStore((s) => s.alsoDeviceGallery);
  const alsoAlbumId = useCaptureExtrasStore((s) => s.alsoAlbumId);
  const setAlsoDeviceGallery = useCaptureExtrasStore(
    (s) => s.setAlsoDeviceGallery,
  );
  const setAlsoAlbumId = useCaptureExtrasStore((s) => s.setAlsoAlbumId);
  // Resolve at the read site: a stored album that no longer exists is ignored
  // (the store itself doesn't know the album list).
  const resolvedExtras: CaptureExtras = {
    alsoDeviceGallery,
    alsoAlbumId:
      alsoAlbumId && albums?.some((a) => a.albumId === alsoAlbumId)
        ? alsoAlbumId
        : null,
  };
  // Ref mirror so the memoized capture callback reads the latest value
  // without being re-created on every extras/albums change.
  const resolvedExtrasRef = useRef(resolvedExtras);
  resolvedExtrasRef.current = resolvedExtras;

  // The shared Memo-library carousel (same session the My Albums tab's
  // "My Photos" strip opens): merged local-first library, social overlay,
  // pagination, zoom-flight sizes.
  const libraryViewer = useLibraryViewerSession();
  const handleOpenLibraryViewer = useCallback(
    (originFrame: Frame | null) => libraryViewer.open(0, originFrame),
    [libraryViewer],
  );

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

  // GPS for the capture in flight (best-effort; see the hook)
  const { captureLocationRef, captureCurrentLocation } = useCaptureLocation();

  // Save a captured file to the device camera roll (silent — the banner's
  // icon flipping to a checkmark is the feedback).
  const saveToCameraRoll = useCallback(
    async (fileUri: string): Promise<boolean> => {
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") return false;
        await MediaLibrary.createAssetAsync(fileUri);
        triggerGalleryRefresh();
        return true;
      } catch (error) {
        if (__DEV__) console.error("Failed to save to camera roll:", error);
        return false;
      }
    },
    [triggerGalleryRefresh],
  );

  // Shared tail of every photo capture, whichever pipeline produced the
  // file: instant local-first save — identical for the main tab and the
  // album camera. The only difference: the album camera FORCES its album
  // as the target; the main tab uses the sticky extras. Every capture
  // always lands in the Memo library; the album (if any) gets a copy in
  // the background.
  const deliverCapturedPhoto = useCallback(
    (path: string) => {
      const fileUri = path.startsWith("file://") ? path : `file://${path}`;

      // Fetch where this was taken. The fix is a PROMISE handed to the
      // queue, not a ref read: reading the ref here was a race — the fetch
      // clears it synchronously and resolves after the enqueue, so instant
      // captures were never tagged. The background upload waits briefly on
      // the promise instead; the capture itself still never waits on GPS.
      const locationPromise = captureCurrentLocation();

      const extras = resolvedExtrasRef.current;
      const targetAlbumId = albumId ?? extras.alsoAlbumId ?? null;
      const targetAlbum = targetAlbumId
        ? albums?.find((a) => a.albumId === targetAlbumId)
        : undefined;
      // Camera-roll extra only applies on the main tab (album mode has no
      // sticky prefs UI)
      const alsoRoll = albumId ? false : extras.alsoDeviceGallery;
      if (alsoRoll) {
        void saveToCameraRoll(fileUri);
      }
      void enqueueCapture({
        tempFileUri: fileUri,
        locationPromise,
        albumId: targetAlbumId,
        albumTitle: targetAlbum?.title ?? (albumId ? "Album" : null),
        cameraRollSaved: alsoRoll,
        // "Post now": the queue submits to the event once the album copy
        // exists, so closing the camera can't strand the submission
        ...(targetAlbumId &&
          momentTarget && {
            momentTarget: { albumId: targetAlbumId, ...momentTarget },
          }),
      });
    },
    [albumId, albums, momentTarget, saveToCameraRoll, captureCurrentLocation],
  );

  // Photo capture. Main tab: INSTANT — enqueue for background library upload
  // (local-first; no loader) and flash the top banner. Album-capture mode:
  // unchanged gallery-save + confirmation sheet.
  const capturePhoto = useCallback(async () => {
    // Dual mode hands back the exact frame already on screen — no flash
    // (there's no single camera to light) and no device round-trip.
    if (dualMode) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      shutterBlink.value = withSequence(
        withTiming(0.85, { duration: 40 }),
        withTiming(0, { duration: 160 }),
      );
      const photo = await dualCamera.capturePhoto();
      if (photo) deliverCapturedPhoto(photo.path);
      return;
    }

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

      deliverCapturedPhoto(photo.path);
    } catch (error) {
      if (__DEV__) console.error("Failed to take photo:", error);
      notify.error("Capture failed", "Could not take photo. Please try again.");
    } finally {
      setScreenFlashOn(false);
    }
  }, [
    flashMode,
    cameraPosition,
    device?.hasFlash,
    shutterBlink,
    getActiveCamera,
    deliverCapturedPhoto,
    dualMode,
    dualCamera,
  ]);

  // Sticky capture-extras preferences (button right of the shutter)
  const handleToggleAlbumExtra = useCallback(
    (targetAlbumId: string) => {
      setAlsoAlbumId(alsoAlbumId === targetAlbumId ? null : targetAlbumId);
    },
    [alsoAlbumId, setAlsoAlbumId],
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
    if (dualMode) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      dualCamera.startRecording();
      return;
    }
    const camera = getActiveCamera();
    if (!camera) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startRecording(camera);
  }, [startRecording, getActiveCamera, dualMode, dualCamera]);

  const handleRecordStop = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (dualMode) {
      await dualCamera.stopRecording();
      return;
    }
    await stopRecording();
  }, [stopRecording, dualMode, dualCamera]);

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

  // Dual-camera controls. Toggling swaps one whole capture pipeline for
  // another, so it reuses the flip shade: opaque immediately, revealed by
  // whichever preview starts streaming next (with the same 1.5s failsafe,
  // so a session that never starts can't leave the screen black).
  const handleToggleDual = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flipShade.value = 1;
    if (flipShadeTimerRef.current) {
      clearTimeout(flipShadeTimerRef.current);
    }
    flipShadeTimerRef.current = setTimeout(endFlipShade, 1500);
    setFocusPoint(null);
    exposureBias.value = 0;
    dualToggledAtRef.current = Date.now();
    setShowDualLayouts(false);
    setDualMode((v) => !v);
  }, [flipShade, endFlipShade, exposureBias]);

  const handleOpenDualLayouts = useCallback(() => {
    // Turning dual mode on hides flash and night and adds this button, so
    // the toolbar shrinks and the layout button lands on the slot the
    // finger is still resting on. Without this, enabling dual camera pops
    // the picker open by itself.
    if (Date.now() - dualToggledAtRef.current < 500) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowDualLayouts(true);
  }, []);

  // The picker stays open after a choice so the three arrangements can be
  // compared against the live preview underneath.
  const handleSelectDualLayout = useCallback((next: DualCameraLayout) => {
    setDualLayout(next);
  }, []);

  const handleSwapDual = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDualSwapped((v) => !v);
  }, []);

  // A multi-cam session that dies (thermal, another app grabbing the
  // cameras, a device that lied about support) drops straight back to the
  // single-camera path rather than leaving a dead preview on screen.
  const handleDualError = useCallback(
    (message: string) => {
      // Clear the recording state too — the shutter ring and timer are
      // driven by it, and nothing else will resolve them once the session
      // that fed them is gone.
      dualCamera.resetRecording();
      setDualMode(false);
      notify.error("Dual camera unavailable", message);
    },
    [dualCamera],
  );

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
    dualCamera.resetRecording();
  }, [resetRecording, dualCamera]);

  // The video/preview flow captures via the recording hook — fetch the
  // location as soon as its media lands, mirroring the photo path. The
  // promise is kept so a fast confirm (ref still empty) can still hand the
  // in-flight fix to the upload queue.
  const pendingLocationRef = useRef<ReturnType<
    typeof captureCurrentLocation
  > | null>(null);
  useEffect(() => {
    if (capturedMedia) {
      pendingLocationRef.current = captureCurrentLocation();
    }
  }, [capturedMedia, captureCurrentLocation]);

  const handleSaveMedia = useCallback(
    async (pickedAlbumId?: string) => {
      // Guard against double-tap: a second press while the first save is
      // in flight would save (and upload) the media twice
      if (!capturedMedia?.path || isSavingMedia) return;
      setIsSavingMedia(true);

      const fileUri = capturedMedia.path.startsWith("file://")
        ? capturedMedia.path
        : `file://${capturedMedia.path}`;

      // The mimetype must match the actual recorded container — iOS records
      // .mov (video/quicktime); uploading it renamed as .mp4 made the
      // backend store an unplayable "photo". The queue derives the file
      // extension from this.
      const isVideo = "duration" in capturedMedia;
      let mimeType = "image/jpeg";
      if (isVideo) {
        const pathExtension = capturedMedia.path
          .split(".")
          .pop()
          ?.toLowerCase();
        mimeType =
          pathExtension === "mov"
            ? "video/quicktime"
            : pathExtension === "webm"
              ? "video/webm"
              : "video/mp4";
      }

      // Album-capture mode always targets ITS album; the main tab uses the
      // album the preview's picker selected (if any).
      const targetAlbumId = albumId ?? pickedAlbumId;

      try {
        // Request gallery permission
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") {
          notify.error(
            "Permission required",
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

        if (targetAlbumId) {
          const album = albums?.find((a) => a.albumId === targetAlbumId);
          const title = album?.title ?? "Album";

          // Store album association immediately for the local asset
          if (album && asset.uri) {
            addAlbumAssociation(asset.uri, targetAlbumId, title);
          }

          // Same local-first queue the photo shutter uses: the album shows
          // this capture from its local file (with an uploading badge)
          // straight away, and the transfer survives leaving the camera.
          // Resolved fix tags directly; otherwise the still-pending promise
          // rides along and the background upload waits briefly for it
          const location = captureLocationRef.current;
          await enqueueCapture({
            tempFileUri: fileUri,
            mimeType,
            // A video file can't be painted by the grids — the device
            // library asset we just created renders its poster frame
            ...(isVideo && asset.uri && { posterUri: asset.uri }),
            ...(location && {
              latitude: location.latitude,
              longitude: location.longitude,
            }),
            ...(pendingLocationRef.current && {
              locationPromise: pendingLocationRef.current,
            }),
            albumId: targetAlbumId,
            albumTitle: title,
            cameraRollSaved: true,
            ...(momentTarget && {
              momentTarget: { albumId: targetAlbumId, ...momentTarget },
            }),
          });
          // The upload itself is background work the album tile reports on
          // — acknowledge the save (begin+succeed jumps straight to the
          // checkmark state, per the indicator contract)
          const saveId = `album-save-${Date.now()}`;
          uploadIndicator.begin(saveId);
          uploadIndicator.succeed(saveId, `Saved to ${title}`);
        } else {
          // Gallery only — no upload was queued
          const saveId = `gallery-save-${Date.now()}`;
          uploadIndicator.begin(saveId);
          uploadIndicator.succeed(saveId, "Saved to gallery");
        }

        // Close preview immediately
        handleClosePreview();
      } catch (error) {
        if (__DEV__) console.error("Failed to save media:", error);
        notify.error("Save failed", "Could not save media to gallery");
      } finally {
        setIsSavingMedia(false);
      }
    },
    [
      capturedMedia,
      isSavingMedia,
      handleClosePreview,
      triggerGalleryRefresh,
      albums,
      addAlbumAssociation,
      albumId,
      momentTarget,
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
      {/* Dual mode: a separate native multi-cam session drives both
          cameras. The VisionCamera views below are UNMOUNTED rather than
          just deactivated — two capture sessions can't hold the same
          devices, and unmounting is the only way to be certain they were
          released. Its own tap handling (tap the other pane to promote
          it) lives in the native view, so no GestureDetector here. */}
      {dualMode ? (
        <DualCameraPreview
          isActive={isCameraVisible && !showPreview}
          layout={dualLayout}
          swapped={dualSwapped}
          onPreviewStarted={handlePreviewStarted}
          onError={handleDualError}
          onTapSecondaryPane={handleSwapDual}
        />
      ) : (
        /* Camera with tap-to-focus, double-tap flip, pinch zoom */
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
                videoBitRate={RECORDING_CONFIG.VIDEO_BIT_RATE_MBPS}
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
                videoBitRate={RECORDING_CONFIG.VIDEO_BIT_RATE_MBPS}
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
      )}

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

      {/* Focus reticle + exposure slider (single-camera only — dual mode
          has no one camera to focus, and its taps mean "swap panes") */}
      {!dualMode && (
        <FocusExposureControl point={focusPoint} exposureBias={exposureBias} />
      )}

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
            dualSupported={isDualCameraSupported}
            dualMode={dualMode}
            onToggleDual={handleToggleDual}
            dualLayout={dualLayout}
            onOpenDualLayouts={handleOpenDualLayouts}
            onSwapDual={handleSwapDual}
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
        {/* Sticky destination album, spelled out above the zoom presets so
            it's always obvious where captures are going. Tap = change it.
            Main-tab only, and only when an album is actually targeted. */}
        {/* Album camera: fixed "→ this album" indicator (not changeable). */}
        {albumId && !isRecording && (
          <View style={styles.destinationAlbumPill}>
            <Ionicons name="albums" size={12} color="#fff" />
            <Text style={styles.destinationAlbumText} numberOfLines={1}>
              {albums?.find((a) => a.albumId === albumId)?.title ?? "Album"}
            </Text>
          </View>
        )}
        {!albumId && !isRecording && resolvedExtras.alsoAlbumId != null && (
          <Pressable
            onPress={() => setShowExtrasSheet(true)}
            style={styles.destinationAlbumPill}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Saving to ${
              albums?.find((a) => a.albumId === resolvedExtras.alsoAlbumId)
                ?.title ?? "album"
            }. Tap to change.`}
          >
            <Ionicons name="albums" size={12} color="#fff" />
            <Text style={styles.destinationAlbumText} numberOfLines={1}>
              {albums?.find((a) => a.albumId === resolvedExtras.alsoAlbumId)
                ?.title ?? "Album"}
            </Text>
          </Pressable>
        )}

        {/* Zoom presets (0.5x / 1x / 2x / 3x). Hidden in dual mode: the
            multi-cam session runs both wide lenses at fixed formats, so
            there are no lens presets to switch between. */}
        {!dualMode && (
          <View style={styles.zoomPresetContainer}>
            <ZoomPresetSelector
              zoomLevels={zoomLevels}
              activePreset={activePreset}
              currentZoom={zoom}
              onSelect={handleZoomPreset}
              disabled={countdown != null}
            />
          </View>
        )}

        {/* Capture button: tap = photo (or start/stop video), hold = video, drag = zoom */}
        <View style={styles.captureButtonContainer}>
          {/* iOS-style last-photo thumbnail, docked left of the shutter.
              Hidden while recording. */}
          {!isRecording && (
            <View style={styles.lastCaptureContainer} pointerEvents="box-none">
              <LastCaptureThumbnail
                capture={libraryViewer.newest}
                onPress={handleOpenLibraryViewer}
              />
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
          {!isRecording && !albumId && (
            <View
              style={styles.destinationContainer}
              pointerEvents="box-none"
            >
              <CaptureDestinationButton
                extras={resolvedExtras}
                albums={albums}
                onPress={() => setShowExtrasSheet(true)}
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

      {/* Dual-camera layout picker. Sits above the toolbar so its
          dismiss layer catches taps anywhere on the preview, matching the
          "tap anywhere to close" affordance it advertises. */}
      {dualMode && (
        <DualLayoutPicker
          visible={showDualLayouts}
          layout={dualLayout}
          onSelect={handleSelectDualLayout}
          onDismiss={() => setShowDualLayouts(false)}
          top={topControlsTop + 120}
        />
      )}

      {/* Self-timer countdown */}
      <CountdownOverlay
        secondsRemaining={countdown}
        onCancel={cancelCountdown}
      />

      {/* Memo-library viewer — same for the main tab AND the album camera:
          the last-capture thumbnail opens the standard carousel + filmstrip
          over the merged library (fresh captures first), with the usual
          delete / add-to-album actions and the zoom-from-thumbnail flight. */}
      {/* Mounted only while open (visible clears post-animation) */}
      {libraryViewer.viewerProps.visible && (
        <PhotoViewer {...libraryViewer.viewerProps} />
      )}

      {/* One-shot location priming — owns the OS location prompt */}
      <LocationPrimerSheet
        visible={showLocationPrimer}
        onAllow={handleLocationPrimerAllow}
        onDismiss={handleLocationPrimerDismiss}
      />

      {/* Sticky capture-extras preferences (main-tab camera only) */}
      {!albumId && (
        <CaptureExtrasSheet
          visible={showExtrasSheet}
          albums={albums}
          extras={resolvedExtras}
          onToggleDeviceGallery={setAlsoDeviceGallery}
          onToggleAlbum={handleToggleAlbumExtra}
          onClose={() => setShowExtrasSheet(false)}
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
        lockedAlbumId={albumId}
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
    fontFamily: "InstrumentSans_600SemiBold",
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
    fontFamily: "InstrumentSans_600SemiBold",
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
  destinationAlbumPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 5,
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    marginBottom: 10,
  },
  destinationAlbumText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
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
    fontFamily: "InstrumentSans_500Medium",
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
