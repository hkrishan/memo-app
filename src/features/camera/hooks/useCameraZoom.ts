/**
 * useCameraZoom Hook
 * Handles zoom functionality with pinch-to-zoom gesture support
 */

import { useCallback, useMemo, useState } from 'react';
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
  // Get device zoom limits
  const minZoom = device?.minZoom ?? ZOOM_CONFIG.MIN_ZOOM;
  const maxZoom = Math.min(device?.maxZoom ?? ZOOM_CONFIG.MAX_ZOOM, ZOOM_CONFIG.MAX_ZOOM);

  // State for UI updates
  const [currentZoom, setCurrentZoom] = useState(initialZoom);
  const [activePreset, setActivePreset] = useState<ZoomLevel | null>(
    ZOOM_PRESETS.find((p) => p.isDefault) ?? null
  );

  // Animated zoom value for smooth transitions
  const animatedZoom = useSharedValue(initialZoom);
  const savedZoom = useSharedValue(initialZoom);

  // Filter zoom presets based on device capabilities
  const zoomLevels = useMemo(() => {
    return ZOOM_PRESETS.filter((preset) => {
      if (preset.value < minZoom || preset.value > maxZoom) {
        return false;
      }
      if (preset.isUltraWide && minZoom > 0.5) {
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
    [minZoom, maxZoom]
  );

  // Update zoom with timing animation
  const setZoom = useCallback(
    (zoom: number) => {
      const clampedZoom = Math.max(minZoom, Math.min(maxZoom, zoom));

      animatedZoom.value = withTiming(clampedZoom, TIMING_CONFIG);

      setCurrentZoom(clampedZoom);
      savedZoom.value = clampedZoom;

      const matchingPreset = zoomLevels.find(
        (p) => Math.abs(p.value - clampedZoom) < 0.05
      );
      setActivePreset(matchingPreset ?? null);

      onZoomChange?.(clampedZoom);
    },
    [animatedZoom, savedZoom, minZoom, maxZoom, zoomLevels, onZoomChange]
  );

  // Set zoom to a specific preset
  const setZoomPreset = useCallback(
    (preset: ZoomLevel) => {
      setZoom(preset.value);
      setActivePreset(preset);
    },
    [setZoom]
  );

  // Pinch gesture handler for zoom
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          savedZoom.value = animatedZoom.value;
        })
        .onUpdate((event) => {
          const scaleFactor = event.scale;
          const newZoom = savedZoom.value * scaleFactor;
          const clampedZoom = clampZoom(newZoom);

          animatedZoom.value = clampedZoom;
          runOnJS(setCurrentZoom)(clampedZoom);
        })
        .onEnd(() => {
          savedZoom.value = animatedZoom.value;

          const currentValue = animatedZoom.value;
          const closestPreset = zoomLevels.find(
            (p) => Math.abs(p.value - currentValue) < 0.1
          );

          if (closestPreset) {
            animatedZoom.value = withTiming(closestPreset.value, TIMING_CONFIG);
            savedZoom.value = closestPreset.value;
            runOnJS(setCurrentZoom)(closestPreset.value);
            runOnJS(setActivePreset)(closestPreset);
          } else {
            runOnJS(setActivePreset)(null);
          }

          if (onZoomChange) {
            runOnJS(onZoomChange)(animatedZoom.value);
          }
        }),
    [animatedZoom, savedZoom, clampZoom, zoomLevels, onZoomChange]
  );

  return {
    zoom: currentZoom,
    minZoom,
    maxZoom,
    setZoom,
    zoomLevels,
    activePreset,
    setZoomPreset,
    pinchGestureHandler: pinchGesture,
    animatedZoom,
  };
}

export default useCameraZoom;
