/**
 * Camera Feature Constants
 * Configuration values and preset definitions
 */

import {
  FlashMode,
  ZoomLevel,
  CameraAnimationConfig,
  TimerMode,
} from '../types';

// ============================================================================
// Zoom Constants
// ============================================================================

/**
 * Standard zoom presets available across devices
 * Actual availability depends on device capabilities
 */
export const ZOOM_PRESETS: ZoomLevel[] = [
  {
    label: '0.5x',
    value: 0.5,
    isUltraWide: true,
  },
  {
    label: '1x',
    value: 1,
    isDefault: true,
  },
  {
    label: '2x',
    value: 2,
  },
  {
    label: '3x',
    value: 3,
    isTelephoto: true,
  },
];

/**
 * Zoom configuration
 */
export const ZOOM_CONFIG = {
  // Default zoom level
  DEFAULT_ZOOM: 1,

  // Minimum zoom (ultra-wide)
  MIN_ZOOM: 0.5,

  // Maximum zoom (digital zoom limit for quality)
  MAX_ZOOM: 10,

  // Pinch gesture sensitivity
  PINCH_SENSITIVITY: 0.01,

  // Zoom animation spring config
  ANIMATION: {
    damping: 15,
    stiffness: 150,
  },

  // Slider configuration
  SLIDER: {
    MIN_TRACK_COLOR: '#FFFFFF',
    MAX_TRACK_COLOR: 'rgba(255, 255, 255, 0.3)',
    THUMB_COLOR: '#FFFFFF',
    THUMB_SIZE: 24,
  },
} as const;

// ============================================================================
// Flash Constants
// ============================================================================

/**
 * Flash mode cycle order
 */
export const FLASH_MODE_CYCLE: FlashMode[] = [
  FlashMode.OFF,
  FlashMode.ON,
  FlashMode.AUTO,
];

/**
 * Flash mode icons (Ionicons names)
 */
export const FLASH_ICONS: Record<FlashMode, string> = {
  [FlashMode.OFF]: 'flash-off',
  [FlashMode.ON]: 'flash',
  [FlashMode.AUTO]: 'flash-outline',
};

/**
 * Flash mode labels
 */
export const FLASH_LABELS: Record<FlashMode, string> = {
  [FlashMode.OFF]: 'Off',
  [FlashMode.ON]: 'On',
  [FlashMode.AUTO]: 'Auto',
};

// ============================================================================
// Timer Constants
// ============================================================================

/**
 * Photo self-timer cycle order (seconds; 0 = off)
 */
export const TIMER_MODE_CYCLE: TimerMode[] = [0, 3, 10];

// ============================================================================
// Dual Camera Constants
// ============================================================================

/**
 * Dual-camera layout cycle order. Side-by-side leads because it's the
 * layout that reads as "two cameras" at a glance; the inset (PiP) is last
 * since it's the least destructive to the main shot.
 */
export const DUAL_LAYOUT_CYCLE = [
  'horizontal',
  'vertical',
  'pip',
] as const;

// ============================================================================
// Capture Gesture Constants
// ============================================================================

export const CAPTURE_GESTURE_CONFIG = {
  // How long the button must be held before video recording starts (ms)
  HOLD_DURATION: 350,

  // px of upward drag per e-fold of zoom while recording (higher = slower)
  DRAG_ZOOM_SENSITIVITY: 200,
} as const;

// ============================================================================
// Recording Constants
// ============================================================================

export const RECORDING_CONFIG = {
  // Maximum recording duration in seconds
  MAX_DURATION: 60,

  // Minimum recording duration in seconds
  MIN_DURATION: 1,

  // Recording timer update interval in ms
  TIMER_INTERVAL: 100,

  // Video quality preset
  VIDEO_QUALITY: 'high' as const,

  // Video codec
  VIDEO_CODEC: 'h264' as const,

  // File type
  FILE_TYPE: 'mp4' as const,
} as const;

// ============================================================================
// Capture Button Constants
// ============================================================================

export const CAPTURE_BUTTON_CONFIG = {
  // Button sizes
  SIZE: {
    OUTER: 80,
    INNER: 64,
    RECORDING_INNER: 32,
  },

  // Colors
  COLORS: {
    OUTER_RING: '#FFFFFF',
    INNER_PHOTO: '#FFFFFF',
    INNER_VIDEO: '#FF4444',
    RECORDING: '#FF4444',
    DISABLED: 'rgba(255, 255, 255, 0.5)',
  },

  // Border widths
  BORDER: {
    OUTER: 4,
    INNER: 0,
  },

  // Animation durations
  ANIMATION: {
    PRESS_DURATION: 100,
    MODE_SWITCH_DURATION: 200,
    RECORDING_PULSE_DURATION: 1000,
  },

  // Long press threshold for video (ms)
  LONG_PRESS_THRESHOLD: 500,
} as const;

// ============================================================================
// UI Constants
// ============================================================================

export const CAMERA_UI_CONFIG = {
  // Control button sizes
  CONTROL_BUTTON: {
    SIZE: 44,
    ICON_SIZE: 24,
    BACKGROUND: 'rgba(0, 0, 0, 0.3)',
    ACTIVE_BACKGROUND: 'rgba(255, 255, 255, 0.3)',
  },

  // Spacing
  SPACING: {
    CONTROLS_BOTTOM: 100,
    CONTROLS_HORIZONTAL: 16,
    ZOOM_INDICATOR_BOTTOM: 120,
    FLASH_TOP: 60,
    TOP_CONTROLS_TOP: 50,
  },

  // Colors
  COLORS: {
    OVERLAY: 'rgba(0, 0, 0, 0.5)',
    TEXT: '#FFFFFF',
    TEXT_SECONDARY: 'rgba(255, 255, 255, 0.7)',
    ACCENT: '#FFD700',
    DANGER: '#FF4444',
  },

  // Typography
  TYPOGRAPHY: {
    TIMER_SIZE: 16,
    ZOOM_LABEL_SIZE: 12,
    CONTROL_LABEL_SIZE: 10,
  },

  // Safe area
  SAFE_AREA: {
    TOP: 50,
    BOTTOM: 34,
  },
} as const;

// ============================================================================
// Animation Constants
// ============================================================================

export const ANIMATION_CONFIG: Record<string, CameraAnimationConfig> = {
  // Camera switch animation
  CAMERA_SWITCH: {
    duration: 300,
    damping: 15,
    stiffness: 100,
  },

  // Flash animation
  FLASH: {
    duration: 150,
  },

  // Zoom animation
  ZOOM: {
    duration: 200,
    damping: 20,
    stiffness: 200,
  },

  // Capture animation
  CAPTURE: {
    duration: 100,
  },

  // Recording pulse
  RECORDING_PULSE: {
    duration: 1000,
  },

  // Preview fade
  PREVIEW_FADE: {
    duration: 250,
  },
};

// ============================================================================
// Gesture Constants
// ============================================================================

export const GESTURE_CONFIG = {
  // Pinch zoom
  PINCH: {
    MIN_POINTERS: 2,
    MAX_POINTERS: 2,
    VELOCITY_FACTOR: 0.5,
  },

  // Tap to focus
  TAP: {
    MAX_DURATION: 200,
    MAX_DISTANCE: 10,
  },

  // Double tap to switch camera
  DOUBLE_TAP: {
    MAX_DELAY: 300,
  },

  // Long press for video
  LONG_PRESS: {
    MIN_DURATION: 500,
  },
} as const;

// ============================================================================
// Permission Constants
// ============================================================================

export const PERMISSION_CONFIG = {
  CAMERA_PERMISSION_TEXT: 'Camera access is required to take photos and videos',
  MICROPHONE_PERMISSION_TEXT: 'Microphone access is required to record videos with audio',
  SETTINGS_BUTTON_TEXT: 'Open Settings',
  REQUEST_BUTTON_TEXT: 'Grant Access',
} as const;

// ============================================================================
// Export all constants
// ============================================================================

export const CAMERA_CONSTANTS = {
  ZOOM_PRESETS,
  ZOOM_CONFIG,
  FLASH_MODE_CYCLE,
  FLASH_ICONS,
  FLASH_LABELS,
  RECORDING_CONFIG,
  CAPTURE_BUTTON_CONFIG,
  CAMERA_UI_CONFIG,
  ANIMATION_CONFIG,
  GESTURE_CONFIG,
  PERMISSION_CONFIG,
} as const;
