/**
 * Camera Hooks
 * Export all camera-related hooks
 */

export { useCameraZoom } from './useCameraZoom';
export { useVideoRecording } from './useVideoRecording';
export { useDualCamera } from './useDualCamera';
export type { UseDualCameraReturn } from './useDualCamera';

// Re-export types for convenience
export type {
  UseCameraZoomReturn,
  UseVideoRecordingReturn,
} from '../types';
