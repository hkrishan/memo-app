/**
 * DropCaptureScreen — the BeReal-style full-screen capture for a drop.
 * Focused on speed: countdown header, shutter, flip. One tap captures the
 * current camera, flips to the other, and auto-captures the second shot
 * once that session is up (both cameras stay mounted so the flip is just
 * an isActive switch). Preview shows the back shot fullscreen with the
 * front shot as a PiP; tapping the PiP swaps which photo is submitted as
 * primary. Send uploads both photos to the album, then submits
 * { photoId, frontPhotoId } to the event.
 *
 * Deliberately NOT the 1400-line CameraScreen — no zoom, video, filters,
 * flash or save-sheet. Single-camera devices (simulators) degrade to a
 * one-shot submission without frontPhotoId.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  StatusBar,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";

import { isApiError, queryClient } from "@/lib/api";
import { notify } from "@/components/global";
import { useUploadPhotoMutation } from "@/features/album/api/album.queries";
import {
  momentKeys,
  useSubmitToMomentMutation,
} from "../api/moments.queries";
import { dismissDropTakeover } from "../hooks/useDropTakeover";
import { LATE_WINDOW_MS } from "../types/moment.types";
import { formatMmSs, useNow } from "../utils/time";

/**
 * The 1 Hz countdown label, isolated so its tick re-renders ONLY this
 * pill. It used to live in the screen body — every second re-rendered
 * the entire 700-line capture screen, pushing fresh props onto two live
 * native camera views.
 */
const DropCountdownPill: React.FC<{
  deadlineMs: number;
  lateWindowMs: number;
  active: boolean;
}> = ({ deadlineMs, lateWindowMs, active }) => {
  const now = useNow(1000, active);
  const remainingMs = deadlineMs - now;
  const isLate = remainingMs <= 0;
  const missed = remainingMs + lateWindowMs <= 0;
  const urgent = !isLate && remainingMs < 60 * 1000;
  if (missed) return null;
  return (
    <View style={styles.countdownRow}>
      {isLate && (
        <View style={styles.lateBadge}>
          <Text style={styles.lateBadgeLabel}>LATE</Text>
        </View>
      )}
      <Text
        style={[
          styles.countdown,
          urgent && styles.countdownUrgent,
          isLate && styles.countdownLate,
        ]}
      >
        {formatMmSs(isLate ? remainingMs + lateWindowMs : remainingMs)}
      </Text>
    </View>
  );
};

const URGENT = "#FF3B30";
const LATE_ACCENT = "#FF9500";

type CameraSide = "back" | "front";

type Shot = { uri: string; position: CameraSide };

type Phase = "capture" | "between" | "preview" | "sending" | "sent";

const toFileUri = (path: string): string =>
  path.startsWith("file://") ? path : `file://${path}`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DropCaptureScreen: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { albumId, momentId, eventId, deadlineAt, albumTitle } =
    useLocalSearchParams<{
      albumId: string;
      momentId: string;
      eventId: string;
      deadlineAt?: string;
      albumTitle?: string;
    }>();

  const { hasPermission, requestPermission } = useCameraPermission();
  const backDevice = useCameraDevice("back");
  const frontDevice = useCameraDevice("front");

  const [position, setPosition] = useState<CameraSide>("back");
  const [phase, setPhase] = useState<Phase>("capture");
  const [shots, setShots] = useState<Shot[]>([]);
  const [primaryIndex, setPrimaryIndex] = useState(0);
  const [sentLabel, setSentLabel] = useState("Posted");

  const backCameraRef = useRef<Camera>(null);
  const frontCameraRef = useRef<Camera>(null);
  // Per-camera session state, read by the second-shot wait loop without
  // re-rendering. Both cameras stay mounted: onInitialized fires once at
  // mount (session configured), onStarted/onStopped track the isActive
  // flip — "streaming" is the signal that the auto-shot can fire.
  const initializedRef = useRef<{ back: boolean; front: boolean }>({
    back: false,
    front: false,
  });
  const streamingRef = useRef<{ back: boolean; front: boolean }>({
    back: false,
    front: false,
  });
  const capturingRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Countdown — only when the route carried the deadline
  const deadlineMs = useMemo(
    () => (deadlineAt ? new Date(deadlineAt).getTime() : null),
    [deadlineAt],
  );
  // Boundary-exact phase flags WITHOUT ticking the whole screen every
  // second: one timeout per upcoming boundary (late, missed) forces a
  // render exactly when a flag flips. The visible countdown ticks inside
  // DropCountdownPill only.
  const [, forcePhaseTick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (deadlineMs == null || phase === "sent") return;
    const scheduledAt = Date.now();
    const timers = [deadlineMs, deadlineMs + LATE_WINDOW_MS]
      .filter((t) => t > scheduledAt)
      .map((t) => setTimeout(forcePhaseTick, t - scheduledAt + 20));
    return () => timers.forEach(clearTimeout);
  }, [deadlineMs, phase]);
  const nowMs = Date.now();
  const remainingMs = deadlineMs != null ? deadlineMs - nowMs : null;
  const isLate = remainingMs != null && remainingMs <= 0;
  const missed = remainingMs != null && remainingMs + LATE_WINDOW_MS <= 0;

  // Identity-stable native camera callbacks (fresh inline arrows used to
  // be diffed onto the live camera views on every render)
  const handleBackInitialized = useCallback(() => {
    initializedRef.current.back = true;
  }, []);
  const handleBackStarted = useCallback(() => {
    streamingRef.current.back = true;
  }, []);
  const handleBackStopped = useCallback(() => {
    streamingRef.current.back = false;
  }, []);
  const handleFrontInitialized = useCallback(() => {
    initializedRef.current.front = true;
  }, []);
  const handleFrontStarted = useCallback(() => {
    streamingRef.current.front = true;
  }, []);
  const handleFrontStopped = useCallback(() => {
    streamingRef.current.front = false;
  }, []);

  // Ask for camera access as soon as the takeover lands
  useEffect(() => {
    if (!hasPermission) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // Single-camera device (e.g. simulator): fall back to whichever exists
  useEffect(() => {
    if (position === "back" && !backDevice && frontDevice) {
      setPosition("front");
    } else if (position === "front" && !frontDevice && backDevice) {
      setPosition("back");
    }
  }, [position, backDevice, frontDevice]);

  // Leaving this screen for any reason parks the takeover for this event
  // (after a successful post the open-drops query drops it anyway)
  useEffect(() => {
    return () => {
      if (eventId) dismissDropTakeover(eventId);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [eventId]);

  const close = useCallback(() => {
    if (eventId) dismissDropTakeover(eventId);
    router.back();
  }, [eventId, router]);

  const takeFrom = useCallback(async (side: CameraSide) => {
    const camera =
      side === "back" ? backCameraRef.current : frontCameraRef.current;
    if (!camera) throw new Error("Camera not mounted");
    const photo = await camera.takePhoto({
      flash: "off",
      enableShutterSound: false,
    });
    return { uri: toFileUri(photo.path), position: side } satisfies Shot;
  }, []);

  // Shutter: shot from the current camera, flip, auto-shot from the other
  const handleShutter = useCallback(async () => {
    if (capturingRef.current || phase !== "capture") return;
    capturingRef.current = true;

    const firstSide = position;
    const secondSide: CameraSide = firstSide === "back" ? "front" : "back";
    const secondDevice = secondSide === "back" ? backDevice : frontDevice;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const firstShot = await takeFrom(firstSide);

      if (!secondDevice) {
        // Only one camera on this device — single-photo drop
        setShots([firstShot]);
        setPrimaryIndex(0);
        setPhase("preview");
        return;
      }

      setPhase("between");
      setPosition(secondSide);

      // Wait until the freshly-activated camera is initialized AND
      // streaming (or give up after 4s and try anyway), then a beat for
      // exposure to settle before the auto-shot
      const waitUntil = Date.now() + 4000;
      while (
        !(
          initializedRef.current[secondSide] &&
          streamingRef.current[secondSide]
        ) &&
        Date.now() < waitUntil
      ) {
        await delay(100);
      }
      await delay(450);

      let taken: Shot[] = [firstShot];
      try {
        const secondShot = await takeFrom(secondSide);
        taken = [firstShot, secondShot];
      } catch {
        // Second camera failed — degrade to the single shot
      }

      setShots(taken);
      const backIndex = taken.findIndex((shot) => shot.position === "back");
      setPrimaryIndex(backIndex >= 0 ? backIndex : 0);
      setPhase("preview");
    } catch (error) {
      if (__DEV__) console.error("[drop] Capture failed:", error);
      notify.error("Capture failed", "Could not take the photo — try again.");
      setPhase("capture");
    } finally {
      capturingRef.current = false;
    }
  }, [phase, position, backDevice, frontDevice, takeFrom]);

  const handleFlip = useCallback(() => {
    if (phase !== "capture" || !backDevice || !frontDevice) return;
    setPosition((side) => (side === "back" ? "front" : "back"));
  }, [phase, backDevice, frontDevice]);

  const handleRetake = useCallback(() => {
    setShots([]);
    setPrimaryIndex(0);
    setPosition(backDevice ? "back" : "front");
    setPhase("capture");
  }, [backDevice]);

  const uploadMutation = useUploadPhotoMutation();
  const submitMutation = useSubmitToMomentMutation();

  const finishSent = useCallback(
    (label: string) => {
      setSentLabel(label);
      setPhase("sent");
      if (eventId) dismissDropTakeover(eventId);
      dismissTimerRef.current = setTimeout(() => router.back(), 900);
    },
    [eventId, router],
  );

  const handleSend = useCallback(async () => {
    if (phase !== "preview" || shots.length === 0) return;
    if (!albumId || !momentId || !eventId) return;
    setPhase("sending");

    const primary = shots[primaryIndex];
    const secondary = shots.length > 1 ? shots[1 - primaryIndex] : undefined;

    try {
      const stamp = Date.now();
      const uploaded = await uploadMutation.mutateAsync({
        albumId,
        fileUri: primary.uri,
        fileName: `drop-${stamp}.jpg`,
        mimeType: "image/jpeg",
      });
      let frontPhotoId: string | undefined;
      if (secondary) {
        const uploadedFront = await uploadMutation.mutateAsync({
          albumId,
          fileUri: secondary.uri,
          fileName: `drop-${stamp}-front.jpg`,
          mimeType: "image/jpeg",
        });
        frontPhotoId = uploadedFront.photoId;
      }

      await submitMutation.mutateAsync({
        albumId,
        momentId,
        eventId,
        photoId: uploaded.photoId,
        frontPhotoId,
      });
      finishSent("Posted");
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        // Someone (or another device) beat us to it — that's still done
        queryClient.invalidateQueries({ queryKey: momentKeys.openDrops });
        finishSent("Already posted");
        return;
      }
      if (__DEV__) console.error("[drop] Send failed:", error);
      notify.error("Couldn't post", "Check your connection and try again.");
      setPhase("preview");
    }
  }, [
    phase,
    shots,
    primaryIndex,
    albumId,
    momentId,
    eventId,
    uploadMutation,
    submitMutation,
    finishSent,
  ]);

  const handleSwapPrimary = useCallback(() => {
    if (shots.length < 2) return;
    setPrimaryIndex((index) => 1 - index);
  }, [shots.length]);

  // ——— render ———

  const primaryShot = shots[primaryIndex];
  const pipShot = shots.length > 1 ? shots[1 - primaryIndex] : undefined;
  const noCamera = !backDevice && !frontDevice;
  const showPreview =
    phase === "preview" || phase === "sending" || phase === "sent";

  let content: React.ReactNode;
  if (missed && !showPreview) {
    content = (
      <View style={styles.centerState}>
        <Ionicons name="hourglass-outline" size={40} color="#8E8E93" />
        <Text style={styles.centerTitle}>You missed this drop</Text>
        <Text style={styles.centerHint}>
          The late window is over — catch the next one when it fires.
        </Text>
        <Pressable style={styles.centerButton} onPress={close}>
          <Text style={styles.centerButtonLabel}>Close</Text>
        </Pressable>
      </View>
    );
  } else if (!hasPermission) {
    content = (
      <View style={styles.centerState}>
        <Ionicons name="camera-outline" size={40} color="#8E8E93" />
        <Text style={styles.centerTitle}>Enable camera</Text>
        <Text style={styles.centerHint}>
          Memo needs the camera to post to this drop.
        </Text>
        <Pressable
          style={styles.centerButton}
          onPress={() => {
            void requestPermission().then((granted) => {
              if (!granted) void Linking.openSettings();
            });
          }}
        >
          <Text style={styles.centerButtonLabel}>Allow camera</Text>
        </Pressable>
      </View>
    );
  } else if (noCamera) {
    content = (
      <View style={styles.centerState}>
        <Ionicons name="camera-outline" size={40} color="#8E8E93" />
        <Text style={styles.centerTitle}>Camera unavailable</Text>
        <Pressable style={styles.centerButton} onPress={close}>
          <Text style={styles.centerButtonLabel}>Close</Text>
        </Pressable>
      </View>
    );
  } else {
    // Cameras stay mounted through preview (isActive off) so Retake never
    // pays a full session re-configure — the preview sits on top.
    content = (
      <>
        {backDevice && (
          <Camera
            ref={backCameraRef}
            style={[
              StyleSheet.absoluteFill,
              position !== "back" && styles.cameraHidden,
            ]}
            device={backDevice}
            isActive={position === "back" && !showPreview}
            photo={true}
            onInitialized={handleBackInitialized}
            onStarted={handleBackStarted}
            onStopped={handleBackStopped}
          />
        )}
        {frontDevice && (
          <Camera
            ref={frontCameraRef}
            style={[
              StyleSheet.absoluteFill,
              position !== "front" && styles.cameraHidden,
            ]}
            device={frontDevice}
            isActive={position === "front" && !showPreview}
            photo={true}
            onInitialized={handleFrontInitialized}
            onStarted={handleFrontStarted}
            onStopped={handleFrontStopped}
          />
        )}

        {phase === "between" && (
          <View style={styles.betweenShade}>
            <Text style={styles.betweenDots}>…</Text>
          </View>
        )}

        {phase === "capture" && (
          <View style={[styles.captureControls, { bottom: insets.bottom + 28 }]}>
            <View style={styles.sideSlot} />
            <Pressable
              style={styles.shutter}
              onPress={handleShutter}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
            >
              <View style={styles.shutterInner} />
            </Pressable>
            <View style={styles.sideSlot}>
              {backDevice && frontDevice && (
                <Pressable
                  style={styles.flipButton}
                  onPress={handleFlip}
                  accessibilityRole="button"
                  accessibilityLabel="Flip camera"
                >
                  <Ionicons name="camera-reverse" size={24} color="#fff" />
                </Pressable>
              )}
            </View>
          </View>
        )}

        {showPreview && primaryShot && (
          <View style={StyleSheet.absoluteFill}>
            <Image
              source={{ uri: primaryShot.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            {pipShot && (
              <Pressable
                style={[styles.pip, { top: insets.top + 86 }]}
                onPress={handleSwapPrimary}
                accessibilityRole="button"
                accessibilityLabel="Swap photos"
              >
                <Image
                  source={{ uri: pipShot.uri }}
                  style={styles.pipImage}
                  contentFit="cover"
                />
              </Pressable>
            )}
            {phase === "sent" ? (
              <View style={styles.sentBanner}>
                <Ionicons name="checkmark-circle" size={22} color="#34C759" />
                <Text style={styles.sentLabel}>{sentLabel}</Text>
              </View>
            ) : (
              <View
                style={[styles.previewActions, { bottom: insets.bottom + 28 }]}
              >
                <Pressable
                  style={styles.retakeButton}
                  onPress={handleRetake}
                  disabled={phase === "sending"}
                  accessibilityRole="button"
                  accessibilityLabel="Retake"
                >
                  <Text style={styles.retakeLabel}>Retake</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.sendButton,
                    phase === "sending" && styles.sendButtonBusy,
                  ]}
                  onPress={handleSend}
                  disabled={phase === "sending"}
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                >
                  {phase === "sending" ? (
                    <>
                      <ActivityIndicator size="small" color="#000" />
                      <Text style={styles.sendLabel}>Sending…</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="paper-plane" size={16} color="#000" />
                      <Text style={styles.sendLabel}>Send</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        )}
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      {content}

      {/* Header stays above every state */}
      <View style={[styles.header, { top: insets.top + 8 }]}>
        <Pressable
          style={styles.closeButton}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {albumTitle || "Drop"}
          </Text>
          {deadlineMs != null && !missed && (
            <DropCountdownPill
              deadlineMs={deadlineMs}
              lateWindowMs={LATE_WINDOW_MS}
              active={phase !== "sent"}
            />
          )}
        </View>
        <View style={styles.closeButton} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000",
  },
  cameraHidden: {
    opacity: 0,
  },
  header: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowRadius: 6,
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  countdown: {
    color: "#fff",
    fontSize: 34,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowRadius: 6,
  },
  countdownUrgent: {
    color: URGENT,
  },
  countdownLate: {
    color: LATE_ACCENT,
  },
  lateBadge: {
    backgroundColor: LATE_ACCENT,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lateBadgeLabel: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  betweenShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  betweenDots: {
    color: "#fff",
    fontSize: 40,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
  captureControls: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
  },
  sideSlot: {
    width: 48,
    alignItems: "center",
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
  },
  flipButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  pip: {
    position: "absolute",
    right: 14,
    width: 92,
    height: 122,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: "#1c1c1e",
  },
  pipImage: {
    width: "100%",
    height: "100%",
  },
  previewActions: {
    position: "absolute",
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  retakeLabel: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
  sendButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: "#fff",
  },
  sendButtonBusy: {
    opacity: 0.85,
  },
  sendLabel: {
    color: "#000",
    fontSize: 16,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
  sentBanner: {
    position: "absolute",
    bottom: 64,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sentLabel: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 10,
  },
  centerTitle: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    marginTop: 6,
  },
  centerHint: {
    color: "#8E8E93",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  centerButton: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  centerButtonLabel: {
    color: "#000",
    fontSize: 15,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
});

export default DropCaptureScreen;
