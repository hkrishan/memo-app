/**
 * CaptureButton Component
 * Snapchat-style capture button.
 * Photo mode: tap → photo, press & hold → record video.
 * Video mode: tap → start/stop recording.
 * Either way, dragging up/down while recording zooms (written straight
 * to the UI thread).
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { CaptureButtonProps, CaptureMode } from '../types';
import {
  CAPTURE_BUTTON_CONFIG,
  CAPTURE_GESTURE_CONFIG,
  RECORDING_CONFIG,
} from '../constants';

const { SIZE, COLORS, BORDER } = CAPTURE_BUTTON_CONFIG;

const TIMING_CONFIG = {
  duration: 150,
  easing: Easing.out(Easing.quad),
};

interface RecordingProgressProps {
  isRecording: boolean;
  duration: number;
  maxDuration: number;
  size: number;
}

const RecordingProgress: React.FC<RecordingProgressProps> = ({
  isRecording,
  duration,
  maxDuration,
  size,
}) => {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = Math.min(duration / maxDuration, 1);
  const strokeDashoffset = circumference * (1 - progress);

  if (!isRecording && duration === 0) {
    return null;
  }

  return (
    <View style={[styles.progressContainer, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.progressSvg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.RECORDING}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    </View>
  );
};

export const CaptureButton: React.FC<
  CaptureButtonProps & {
    recordingDuration?: number;
    maxDuration?: number;
  }
> = ({
  mode,
  onCapture,
  onRecordStart,
  onRecordStop,
  isRecording,
  disabled,
  size = SIZE.OUTER,
  recordingDuration = 0,
  maxDuration = RECORDING_CONFIG.MAX_DURATION,
  zoomValue,
  minZoom,
  maxZoom,
  onZoomSettled,
}) => {
  const outerScale = useSharedValue(1);
  const innerScale = useSharedValue(1);
  const innerBorderRadius = useSharedValue(SIZE.INNER / 2);
  const innerSize = useSharedValue<number>(SIZE.INNER);
  const pulseOpacity = useSharedValue(1);
  const dragBaseZoom = useSharedValue(1);
  // Whether the hold gesture actually activated (a failed quick-press
  // still finalizes, and must not fire onRecordStop)
  const isHolding = useSharedValue(false);

  // Recording appearance: ring grows, inner shrinks to a pulsing red dot
  useEffect(() => {
    if (isRecording) {
      outerScale.value = withTiming(1.2, TIMING_CONFIG);
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 500 }),
          withTiming(1, { duration: 500 }),
        ),
        -1,
        true,
      );
      innerBorderRadius.value = withTiming(SIZE.RECORDING_INNER / 2, TIMING_CONFIG);
      innerSize.value = withTiming(SIZE.RECORDING_INNER, TIMING_CONFIG);
    } else {
      cancelAnimation(pulseOpacity);
      outerScale.value = withTiming(1, TIMING_CONFIG);
      pulseOpacity.value = 1;
      innerBorderRadius.value = withTiming(SIZE.INNER / 2, TIMING_CONFIG);
      innerSize.value = withTiming(SIZE.INNER, TIMING_CONFIG);
    }
  }, [isRecording, outerScale, innerBorderRadius, innerSize, pulseOpacity]);

  // Photo mode: press & hold → record; vertical drag while holding → zoom
  const holdGesture = Gesture.Pan()
    .enabled(!disabled && mode === CaptureMode.PHOTO && !isRecording)
    .activateAfterLongPress(CAPTURE_GESTURE_CONFIG.HOLD_DURATION)
    .onStart(() => {
      isHolding.value = true;
      dragBaseZoom.value = zoomValue.value;
      runOnJS(onRecordStart)();
    })
    .onUpdate((event) => {
      // Exponential mapping feels linear to the eye across the zoom range
      const factor = Math.exp(
        -event.translationY / CAPTURE_GESTURE_CONFIG.DRAG_ZOOM_SENSITIVITY,
      );
      const newZoom = Math.max(
        minZoom,
        Math.min(maxZoom, dragBaseZoom.value * factor),
      );
      zoomValue.value = newZoom;
    })
    .onFinalize(() => {
      if (!isHolding.value) return;
      isHolding.value = false;
      runOnJS(onZoomSettled)(zoomValue.value);
      runOnJS(onRecordStop)();
    });

  // Video mode while recording: drag on the button → zoom (tap stops)
  const recordingPanGesture = Gesture.Pan()
    .enabled(!disabled && isRecording)
    .minDistance(12)
    .onStart(() => {
      dragBaseZoom.value = zoomValue.value;
    })
    .onUpdate((event) => {
      const factor = Math.exp(
        -event.translationY / CAPTURE_GESTURE_CONFIG.DRAG_ZOOM_SENSITIVITY,
      );
      const newZoom = Math.max(
        minZoom,
        Math.min(maxZoom, dragBaseZoom.value * factor),
      );
      zoomValue.value = newZoom;
    })
    .onEnd(() => {
      runOnJS(onZoomSettled)(zoomValue.value);
    });

  // Tap: photo mode → capture; video mode → start/stop recording
  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    // Must cover the hold threshold so no release window falls between
    // "too long for a tap" and "not long enough for a hold"
    .maxDuration(CAPTURE_GESTURE_CONFIG.HOLD_DURATION)
    .maxDistance(30)
    .onBegin(() => {
      outerScale.value = withTiming(0.92, { duration: 80 });
      innerScale.value = withTiming(0.88, { duration: 80 });
    })
    .onFinalize(() => {
      outerScale.value = withTiming(1, { duration: 120 });
      innerScale.value = withTiming(1, { duration: 120 });
    })
    .onEnd((_event, success) => {
      if (!success) return;
      if (mode === CaptureMode.VIDEO) {
        if (isRecording) {
          runOnJS(onRecordStop)();
        } else {
          runOnJS(onRecordStart)();
        }
      } else if (!isRecording) {
        runOnJS(onCapture)();
      }
    });

  const captureGesture = Gesture.Exclusive(
    holdGesture,
    recordingPanGesture,
    tapGesture,
  );

  const outerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: outerScale.value }],
  }));

  const innerAnimatedStyle = useAnimatedStyle(() => ({
    width: innerSize.value,
    height: innerSize.value,
    borderRadius: innerBorderRadius.value,
    transform: [{ scale: innerScale.value }],
    opacity: pulseOpacity.value,
  }));

  const innerColor =
    isRecording || mode === CaptureMode.VIDEO
      ? COLORS.RECORDING
      : COLORS.INNER_PHOTO;

  return (
    <View style={styles.container}>
      <RecordingProgress
        isRecording={isRecording}
        duration={recordingDuration}
        maxDuration={maxDuration}
        size={size + 24}
      />

      <GestureDetector gesture={captureGesture}>
        <Animated.View
          style={[
            styles.outerRing,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
            disabled && styles.disabled,
            outerAnimatedStyle,
          ]}
        >
          <Animated.View
            style={[
              styles.innerButton,
              { backgroundColor: innerColor },
              innerAnimatedStyle,
            ]}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    backgroundColor: 'transparent',
    borderWidth: BORDER.OUTER,
    borderColor: COLORS.OUTER_RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  disabled: {
    opacity: 0.5,
    borderColor: COLORS.DISABLED,
  },
  progressContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressSvg: {
    position: 'absolute',
  },
});

export default CaptureButton;
