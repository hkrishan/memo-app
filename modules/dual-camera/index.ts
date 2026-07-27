/**
 * Dual camera — front and back running at the same time (iOS only).
 *
 * Backed by AVCaptureMultiCamSession, which react-native-vision-camera
 * does not support: a normal capture session can only hold one camera, so
 * the app's regular CameraScreen keeps both mounted and runs one at a
 * time. This module runs a second, separate session that drives both and
 * composites them into a single frame.
 *
 * Every export is safe to call when the native module is absent (Android,
 * Expo Go, or a JS bundle running against an older native build) —
 * `isDualCameraSupported` is false and the capture calls reject, so
 * callers only need to check the flag.
 */
import { requireNativeModule, requireNativeViewManager } from "expo-modules-core";
import type * as React from "react";
import { Platform, type ViewProps } from "react-native";

/** Geometry of the two panes. `main` / `secondary` are swapped by `swapped`. */
export type DualCameraLayout = "pip" | "vertical" | "horizontal";

export interface DualCameraPhoto {
  /** file:// uri of the composited JPEG */
  path: string;
  width: number;
  height: number;
}

export interface DualCameraVideo {
  /** file:// uri of the composited .mp4 */
  path: string;
  width: number;
  height: number;
  /** Seconds actually written to the file */
  duration: number;
}

interface DualCameraNativeModule {
  isSupported: boolean;
  setAudioEnabled: (enabled: boolean) => Promise<void>;
  capturePhoto: () => Promise<DualCameraPhoto>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<DualCameraVideo>;
}

const native: DualCameraNativeModule | null = (() => {
  if (Platform.OS !== "ios") return null;
  try {
    return requireNativeModule<DualCameraNativeModule>("DualCamera");
  } catch {
    // Build without the module — the feature stays hidden
    return null;
  }
})();

/**
 * True when this device can actually run both cameras at once: iOS, A12
 * (iPhone XS / XR) or newer, and a native build that includes the module.
 * Always false in Simulator.
 */
export const isDualCameraSupported: boolean = native?.isSupported ?? false;

export interface DualCameraViewProps extends ViewProps {
  /** Starts/stops the capture session. False releases the cameras. */
  isActive: boolean;
  layout: DualCameraLayout;
  /** Puts the FRONT camera in the main pane instead of the back one. */
  swapped: boolean;
  /** First composited frame reached the screen. */
  onPreviewStarted?: () => void;
  onError?: (event: { nativeEvent: { message: string } }) => void;
  /** Which pane was tapped — used for tap-the-inset-to-swap. */
  onTapPane?: (event: {
    nativeEvent: { pane: "main" | "secondary" };
  }) => void;
}

const NativeView: React.ComponentType<DualCameraViewProps> | null = native
  ? requireNativeViewManager("DualCamera")
  : null;

export const DualCameraView = NativeView;

/**
 * Grab the next composited frame as a JPEG. Because it is the frame the
 * preview is already showing, what lands on disk is exactly what the user
 * framed — including the layout and the PiP rounding.
 */
export async function captureDualPhoto(): Promise<DualCameraPhoto> {
  if (!native) throw new Error("Dual camera is not available on this device");
  return native.capturePhoto();
}

/** Begin writing composited frames (plus mic audio) to an .mp4. */
export async function startDualRecording(): Promise<void> {
  if (!native) throw new Error("Dual camera is not available on this device");
  return native.startRecording();
}

export async function stopDualRecording(): Promise<DualCameraVideo> {
  if (!native) throw new Error("Dual camera is not available on this device");
  return native.stopRecording();
}

/**
 * Wire the mic in (or not) before the session is configured. Ignored once
 * the session exists — audio is not hot-swappable on a running multi-cam
 * session.
 */
export async function setDualAudioEnabled(enabled: boolean): Promise<void> {
  if (!native) return;
  try {
    await native.setAudioEnabled(enabled);
  } catch {
    // Session already configured — keep whatever it was set up with
  }
}
