/**
 * Camera devices, their chosen formats, and the stabilization policy.
 *
 * Format selection is the fiddliest part of the camera and has nothing to
 * do with the screen's state machine, so it lives here: which physical
 * lenses to open, which sensor format to prefer per camera, and why.
 */

import { useEffect, useMemo } from "react";
import { Dimensions } from "react-native";
import { useCameraDevice } from "react-native-vision-camera";

import { CameraPosition } from "../types";

// Camera formats are landscape, so the screen's aspect as width/height
// is height/width (≈2.16 on modern phones); the closest sensor format
// is 16:9. Used only as a front-camera tie-break — the back camera
// deliberately prefers full-sensor 4:3 formats for their wider FOV.
const SCREEN = Dimensions.get("screen");
const SCREEN_ASPECT_RATIO = SCREEN.height / SCREEN.width;

export const useCameraDevices = (cameraPosition: CameraPosition) => {
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

  return {
    backDevice,
    frontDevice,
    device,
    backFormat,
    frontFormat,
    backStabilization,
    frontStabilization,
  };
};
