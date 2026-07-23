/**
 * Camera Feature Types
 * Comprehensive type definitions for the camera system
 */

import type { PhotoFile, VideoFile } from 'react-native-vision-camera';
import type { SharedValue } from 'react-native-reanimated';

// ============================================================================
// Enums
// ============================================================================

export enum CameraPosition {
  BACK = 'back',
  FRONT = 'front',
}

export enum FlashMode {
  OFF = 'off',
  ON = 'on',
  AUTO = 'auto',
}

export enum CaptureMode {
  PHOTO = 'photo',
  VIDEO = 'video',
}

export enum RecordingState {
  IDLE = 'idle',
  RECORDING = 'recording',
  PAUSED = 'paused',
  STOPPING = 'stopping',
}

/** Photo self-timer: seconds of countdown before capture (0 = off) */
export type TimerMode = 0 | 3 | 10;

// ============================================================================
// Zoom Types
// ============================================================================

export interface ZoomLevel {
  label: string;
  value: number;
  isUltraWide?: boolean;
  isDefault?: boolean;
  isTelephoto?: boolean;
}

export interface ZoomState {
  currentZoom: number;
  minZoom: number;
  maxZoom: number;
  activePreset: ZoomLevel | null;
}

export interface ZoomControlsProps {
  currentZoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomChange: (zoom: number) => void;
  zoomLevels: ZoomLevel[];
  activePreset: ZoomLevel | null;
  onPresetSelect: (preset: ZoomLevel) => void;
  disabled?: boolean;
}

// ============================================================================
// Flash Types
// ============================================================================

export interface FlashState {
  mode: FlashMode;
  isAvailable: boolean;
  isTorchOn: boolean;
}

export interface FlashButtonProps {
  mode: FlashMode;
  onModeChange: (mode: FlashMode) => void;
  disabled?: boolean;
  showLabel?: boolean;
}

// ============================================================================
// Camera Switch Types
// ============================================================================

export interface CameraSwitchState {
  position: CameraPosition;
  isAnimating: boolean;
}

export interface CameraSwitchButtonProps {
  position: CameraPosition;
  onSwitch: () => void;
  disabled?: boolean;
  size?: number;
}

// ============================================================================
// Capture Types
// ============================================================================

export interface CaptureState {
  mode: CaptureMode;
  isCapturing: boolean;
  recordingState: RecordingState;
  recordingDuration: number;
}

export interface CaptureButtonProps {
  mode: CaptureMode;
  onCapture: () => void;
  onRecordStart: () => void;
  onRecordStop: () => void;
  isRecording: boolean;
  disabled?: boolean;
  size?: number;
  /**
   * Display-zoom shared value; the hold-and-drag gesture writes to it
   * directly on the UI thread for 60fps zoom while recording.
   */
  zoomValue: SharedValue<number>;
  minZoom: number;
  maxZoom: number;
  /** Called with the final zoom when a drag-to-zoom gesture ends */
  onZoomSettled: (zoom: number) => void;
}

// ============================================================================
// Media Types
// ============================================================================

export interface CapturedPhoto extends PhotoFile {
  timestamp: number;
  position: CameraPosition;
  flashUsed: boolean;
  zoomLevel: number;
}

export interface CapturedVideo extends VideoFile {
  timestamp: number;
  position: CameraPosition;
  flashUsed: boolean;
  duration: number;
}

export type CapturedMedia = CapturedPhoto | CapturedVideo;

export interface MediaPreviewProps {
  media: CapturedMedia | null;
  onClose: () => void;
  onSave: (albumId?: string) => void;
  onDelete: () => void;
  visible: boolean;
  isUploading?: boolean;
}

// ============================================================================
// Video Recording Types
// ============================================================================

export interface VideoRecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  maxDuration: number;
}

export interface VideoTimerProps {
  duration: number;
  maxDuration?: number;
  isRecording: boolean;
  showMaxDuration?: boolean;
}

// ============================================================================
// Camera State Types
// ============================================================================

export interface CameraState {
  // Permission
  hasPermission: boolean;
  isRequestingPermission: boolean;

  // Device
  position: CameraPosition;
  isDeviceReady: boolean;

  // Capture
  captureMode: CaptureMode;
  isCapturing: boolean;

  // Recording
  recordingState: RecordingState;
  recordingDuration: number;

  // Zoom
  zoom: ZoomState;

  // Flash
  flash: FlashState;

  // Media
  capturedMedia: CapturedMedia | null;
  showPreview: boolean;
}

// ============================================================================
// Camera Actions Types
// ============================================================================

export interface CameraActions {
  // Permission
  requestPermission: () => Promise<boolean>;

  // Device
  switchCamera: () => void;

  // Capture
  setCaptureMode: (mode: CaptureMode) => void;
  takePhoto: () => Promise<CapturedPhoto | null>;

  // Recording
  startRecording: () => void;
  stopRecording: () => Promise<CapturedVideo | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;

  // Zoom
  setZoom: (zoom: number) => void;
  setZoomPreset: (preset: ZoomLevel) => void;

  // Flash
  setFlashMode: (mode: FlashMode) => void;
  toggleTorch: () => void;

  // Media
  clearCapturedMedia: () => void;
  setShowPreview: (show: boolean) => void;
}

// ============================================================================
// Hook Return Types
// ============================================================================

export interface UseCameraZoomReturn {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  /** Native camera zoom factor that maps to 1x display zoom */
  neutralZoom: number;
  setZoom: (zoom: number) => void;
  zoomLevels: ZoomLevel[];
  activePreset: ZoomLevel | null;
  setZoomPreset: (preset: ZoomLevel) => void;
  /** Sync JS state after a gesture wrote to animatedZoom on the UI thread */
  syncZoomState: (zoom: number) => void;
  pinchGestureHandler: any; // Gesture handler type
  animatedZoom: SharedValue<number>;
}

export interface UseVideoRecordingReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  startRecording: (camera: any) => void;
  stopRecording: () => Promise<VideoFile | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  resetRecording: () => void;
}

export interface UseCameraFlashReturn {
  mode: FlashMode;
  setMode: (mode: FlashMode) => void;
  cycleMode: () => void;
  isAvailable: boolean;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface CameraControlsProps {
  // Zoom
  zoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomChange: (zoom: number) => void;
  zoomLevels: ZoomLevel[];
  activeZoomPreset: ZoomLevel | null;
  onZoomPresetSelect: (preset: ZoomLevel) => void;

  // Flash
  flashMode: FlashMode;
  onFlashModeChange: (mode: FlashMode) => void;

  // Camera Switch
  cameraPosition: CameraPosition;
  onCameraSwitch: () => void;

  // Capture
  captureMode: CaptureMode;
  onCaptureModeChange: (mode: CaptureMode) => void;
  onCapture: () => void;
  onRecordStart: () => void;
  onRecordStop: () => void;
  isRecording: boolean;
  recordingDuration: number;

  // General
  disabled?: boolean;
}

export interface CameraOverlayProps {
  visible: boolean;
  opacity?: number;
  children?: React.ReactNode;
}

// ============================================================================
// Animation Types
// ============================================================================

export interface CameraAnimationConfig {
  duration: number;
  damping?: number;
  stiffness?: number;
}

export interface ZoomAnimationState {
  scale: number;
  isPinching: boolean;
  focalPoint: { x: number; y: number };
}
