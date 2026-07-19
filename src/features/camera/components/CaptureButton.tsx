/**
 * CaptureButton Component
 * Capture button - tap for photo, tap to start/stop video
 */

import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { CaptureMode, CaptureButtonProps } from '../types';
import { CAPTURE_BUTTON_CONFIG, RECORDING_CONFIG } from '../constants';

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

export const CaptureButton: React.FC<CaptureButtonProps & {
  recordingDuration?: number;
  maxDuration?: number;
}> = ({
  mode,
  onCapture,
  onRecordStart,
  onRecordStop,
  isRecording,
  disabled,
  size = SIZE.OUTER,
  recordingDuration = 0,
  maxDuration = RECORDING_CONFIG.MAX_DURATION,
}) => {
  const outerScale = useSharedValue(1);
  const innerScale = useSharedValue(1);
  const innerBorderRadius = useSharedValue(SIZE.INNER / 2);
  const innerSize = useSharedValue(SIZE.INNER);
  const pulseOpacity = useSharedValue(1);

  // Update inner button appearance based on mode and recording state
  useEffect(() => {
    if (isRecording) {
      // Recording state - show red square
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );
      innerBorderRadius.value = withTiming(8, TIMING_CONFIG);
      innerSize.value = withTiming(SIZE.RECORDING_INNER, TIMING_CONFIG);
    } else if (mode === CaptureMode.VIDEO) {
      // Video mode but not recording - show red circle
      cancelAnimation(pulseOpacity);
      pulseOpacity.value = 1;
      innerBorderRadius.value = withTiming(SIZE.INNER / 2, TIMING_CONFIG);
      innerSize.value = withTiming(SIZE.INNER, TIMING_CONFIG);
    } else {
      // Photo mode - show white circle
      cancelAnimation(pulseOpacity);
      pulseOpacity.value = 1;
      innerBorderRadius.value = withTiming(SIZE.INNER / 2, TIMING_CONFIG);
      innerSize.value = withTiming(SIZE.INNER, TIMING_CONFIG);
    }
  }, [isRecording, mode, innerBorderRadius, innerSize, pulseOpacity]);

  const handlePress = useCallback(() => {
    // Animate press
    outerScale.value = withSequence(
      withTiming(0.95, { duration: 50 }),
      withTiming(1, { duration: 100 })
    );
    innerScale.value = withSequence(
      withTiming(0.9, { duration: 50 }),
      withTiming(1, { duration: 100 })
    );

    if (mode === CaptureMode.PHOTO) {
      // Photo mode - take photo
      onCapture();
    } else {
      // Video mode - toggle recording
      if (isRecording) {
        onRecordStop();
      } else {
        onRecordStart();
      }
    }
  }, [mode, isRecording, onCapture, onRecordStart, onRecordStop, outerScale, innerScale]);

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

  // Inner button color: white for photo, red for video
  const innerColor = mode === CaptureMode.VIDEO ? COLORS.RECORDING : COLORS.INNER_PHOTO;

  return (
    <View style={styles.container}>
      <RecordingProgress
        isRecording={isRecording}
        duration={recordingDuration}
        maxDuration={maxDuration}
        size={size + 12}
      />

      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={styles.pressable}
      >
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
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
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
