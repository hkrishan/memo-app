/**
 * useCameraZoom Hook
 * Handles zoom in "display zoom" space (what the user sees: 0.5x / 1x / 2x…).
 *
 * VisionCamera's native zoom factor treats the device's widest lens as its
 * minimum — on multi-cam devices the ultra-wide sits at zoom 1 and the regular
 * wide lens at `device.neutralZoom`. All values in this hook are display zoom;
 * multiply by `neutralZoom` at the Camera prop boundary to get native zoom.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import type { CameraDevice } from 'react-native-vision-camera';

import { ZoomLevel, UseCameraZoomReturn } from '../types';
import { ZOOM_PRESETS, ZOOM_CONFIG } from '../constants';

interface UseCameraZoomOptions {
  device: CameraDevice | undefined;
  initialZoom?: number;
  onZoomChange?: (zoom: number) => void;
}

const TIMING_CONFIG = {
  duration: 150,
  easing: Easing.out(Easing.quad),
};

export function useCameraZoom({
  device,
  initialZoom = ZOOM_CONFIG.DEFAULT_ZOOM,
  onZoomChange,
}: UseCameraZoomOptions): UseCameraZoomReturn {
  const neutralZoom = device?.neutralZoom ?? 1;

  // Display-space zoom limits
  const minZoom = (device?.minZoom ?? 1) / neutralZoom;
  const maxZoom = Math.min(
    (device?.maxZoom ?? ZOOM_CONFIG.MAX_ZOOM) / neutralZoom,
    ZOOM_CONFIG.MAX_ZOOM,
  );

  // State for UI updates
  const [currentZoom, setCurrentZoom] = useState(initialZoom);
  const [activePreset, setActivePreset] = useState<ZoomLevel | null>(
    ZOOM_PRESETS.find((p) => p.isDefault) ?? null,
  );

  // Animated zoom value (display space) for smooth transitions
  const animatedZoom = useSharedValue(initialZoom);
  const savedZoom = useSharedValue(initialZoom);

  // Reset to 1x whenever the device changes (front/back flip)
  useEffect(() => {
    animatedZoom.value = 1;
    savedZoom.value = 1;
    setCurrentZoom(1);
    setActivePreset(ZOOM_PRESETS.find((p) => p.isDefault) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id]);

  // Filter zoom presets based on device capabilities
  const zoomLevels = useMemo(() => {
    return ZOOM_PRESETS.filter((preset) => {
      // Small tolerance: 0.5x preset should match a 0.498 min zoom
      if (preset.value < minZoom - 0.02 || preset.value > maxZoom) {
        return false;
      }
      return true;
    });
  }, [minZoom, maxZoom]);

  // Clamp zoom value to valid range
  const clampZoom = useCallback(
    (zoom: number): number => {
      'worklet';
      return Math.max(minZoom, Math.min(maxZoom, zoom));
    },
    [minZoom, maxZoom],
  );

  const findPreset = useCallback(
    (zoom: number, tolerance: number) =>
      zoomLevels.find((p) => Math.abs(p.value - zoom) < tolerance) ?? null,
    [zoomLevels],
  );

  // Called from gesture worklets when zoom settles
  const syncZoomState = useCallback(
    (zoom: number) => {
      setCurrentZoom(zoom);
      setActivePreset(findPreset(zoom, 0.05));
      onZoomChange?.(zoom);
    },
    [findPreset, onZoomChange],
  );

  // Update zoom with timing animation
  const setZoom = useCallback(
    (zoom: number) => {
      const clampedZoom = Math.max(minZoom, Math.min(maxZoom, zoom));

      animatedZoom.value = withTiming(clampedZoom, TIMING_CONFIG);
      savedZoom.value = clampedZoom;

      setCurrentZoom(clampedZoom);
      setActivePreset(findPreset(clampedZoom, 0.05));
      onZoomChange?.(clampedZoom);
    },
    [animatedZoom, savedZoom, minZoom, maxZoom, findPreset, onZoomChange],
  );

  // Set zoom to a specific preset
  const setZoomPreset = useCallback(
    (preset: ZoomLevel) => {
      setZoom(preset.value);
      setActivePreset(preset);
    },
    [setZoom],
  );

  // Pinch gesture handler for zoom
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          savedZoom.value = animatedZoom.value;
        })
        .onUpdate((event) => {
          const newZoom = clampZoom(savedZoom.value * event.scale);
          animatedZoom.value = newZoom;
          runOnJS(setCurrentZoom)(newZoom);
        })
        .onEnd(() => {
          savedZoom.value = animatedZoom.value;
          runOnJS(syncZoomState)(animatedZoom.value);
        }),
    [animatedZoom, savedZoom, clampZoom, syncZoomState],
  );

  return {
    zoom: currentZoom,
    minZoom,
    maxZoom,
    neutralZoom,
    setZoom,
    zoomLevels,
    activePreset,
    setZoomPreset,
    syncZoomState,
    pinchGestureHandler: pinchGesture,
    animatedZoom,
  };
}

export default useCameraZoom;
