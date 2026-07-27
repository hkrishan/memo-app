/**
 * DualCameraPreview Component
 * Fullscreen preview for the dual (front + back at once) camera.
 *
 * A thin wrapper over the native view so the screen never has to reason
 * about the module being missing: on a device or build without multi-cam
 * support this renders nothing and the screen keeps using VisionCamera.
 */

import React, { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import {
  DualCameraView,
  isDualCameraSupported,
  type DualCameraLayout,
} from "../../../../modules/dual-camera";

interface DualCameraPreviewProps {
  /** Starts/stops the capture session — false releases both cameras. */
  isActive: boolean;
  layout: DualCameraLayout;
  /** Front camera fills the main pane instead of the back one. */
  swapped: boolean;
  /** First composited frame is on screen (clears the activation shade). */
  onPreviewStarted?: () => void;
  onError?: (message: string) => void;
  /** Tapping the small/second pane promotes it, Snapchat-style. */
  onTapSecondaryPane?: () => void;
}

export const DualCameraPreview: React.FC<DualCameraPreviewProps> = ({
  isActive,
  layout,
  swapped,
  onPreviewStarted,
  onError,
  onTapSecondaryPane,
}) => {
  const handleTapPane = useCallback(
    (event: { nativeEvent: { pane: "main" | "secondary" } }) => {
      if (event.nativeEvent.pane === "secondary") onTapSecondaryPane?.();
    },
    [onTapSecondaryPane],
  );

  const handleError = useCallback(
    (event: { nativeEvent: { message: string } }) => {
      onError?.(event.nativeEvent.message);
    },
    [onError],
  );

  if (!isDualCameraSupported || !DualCameraView) {
    return <View style={styles.fallback} />;
  }

  return (
    <DualCameraView
      style={StyleSheet.absoluteFill}
      isActive={isActive}
      layout={layout}
      swapped={swapped}
      onPreviewStarted={onPreviewStarted}
      onError={handleError}
      onTapPane={handleTapPane}
    />
  );
};

const styles = StyleSheet.create({
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
});

export default DualCameraPreview;
