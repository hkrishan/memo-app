/**
 * VideoTimer Component
 * Displays recording duration with animated recording indicator
 */

import React, { useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';

import { VideoTimerProps } from '../types';
import { CAMERA_UI_CONFIG, ANIMATION_CONFIG } from '../constants';

export const VideoTimer: React.FC<VideoTimerProps> = ({
  duration,
  maxDuration,
  isRecording,
  showMaxDuration = false,
}) => {
  const pulseOpacity = useSharedValue(1);

  // Start pulse animation when recording
  React.useEffect(() => {
    if (isRecording) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );
    } else {
      pulseOpacity.value = 1;
    }
  }, [isRecording, pulseOpacity]);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formattedDuration = useMemo(() => formatTime(duration), [duration]);
  const formattedMaxDuration = useMemo(
    () => (maxDuration ? formatTime(maxDuration) : ''),
    [maxDuration]
  );

  if (!isRecording && duration === 0) {
    return null;
  }

  return (
    <Animated.View
      style={styles.container}
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
    >
      {/* Recording indicator dot */}
      <Animated.View style={[styles.recordingDot, pulseAnimatedStyle]} />

      {/* Time display */}
      <View style={styles.timeContainer}>
        <Text style={styles.timeText}>{formattedDuration}</Text>
        {showMaxDuration && maxDuration && (
          <Text style={styles.maxTimeText}>/ {formattedMaxDuration}</Text>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: CAMERA_UI_CONFIG.COLORS.DANGER,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    color: CAMERA_UI_CONFIG.COLORS.TEXT,
    fontSize: CAMERA_UI_CONFIG.TYPOGRAPHY.TIMER_SIZE,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  maxTimeText: {
    color: CAMERA_UI_CONFIG.COLORS.TEXT_SECONDARY,
    fontSize: CAMERA_UI_CONFIG.TYPOGRAPHY.TIMER_SIZE - 2,
    fontWeight: '500',
    marginLeft: 4,
    fontVariant: ['tabular-nums'],
  },
});

export default VideoTimer;
