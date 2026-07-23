/**
 * ModeToggle Component
 * Photo/Video capture mode switch below the capture button.
 * Photo mode still supports hold-to-record; video mode makes a tap
 * start/stop recording.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { CaptureMode } from '../types';

const OPTION_WIDTH = 76;
const OPTION_HEIGHT = 32;

interface ModeToggleProps {
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  disabled?: boolean;
}

const TIMING_CONFIG = {
  duration: 180,
  easing: Easing.out(Easing.quad),
};

export const ModeToggle: React.FC<ModeToggleProps> = ({
  mode,
  onModeChange,
  disabled,
}) => {
  const indicatorX = useSharedValue(mode === CaptureMode.PHOTO ? 0 : OPTION_WIDTH);

  useEffect(() => {
    indicatorX.value = withTiming(
      mode === CaptureMode.PHOTO ? 0 : OPTION_WIDTH,
      TIMING_CONFIG,
    );
  }, [mode, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <Animated.View style={[styles.indicator, indicatorStyle]} />
      <Pressable
        onPress={() => onModeChange(CaptureMode.PHOTO)}
        disabled={disabled}
        style={styles.option}
      >
        <Text
          style={[
            styles.optionText,
            mode === CaptureMode.PHOTO && styles.optionTextActive,
          ]}
        >
          Photo
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onModeChange(CaptureMode.VIDEO)}
        disabled={disabled}
        style={styles.option}
      >
        <Text
          style={[
            styles.optionText,
            mode === CaptureMode.VIDEO && styles.optionTextActive,
          ]}
        >
          Video
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: (OPTION_HEIGHT + 8) / 2,
    padding: 4,
  },
  disabled: {
    opacity: 0.4,
  },
  indicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: OPTION_WIDTH,
    height: OPTION_HEIGHT,
    borderRadius: OPTION_HEIGHT / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  option: {
    width: OPTION_WIDTH,
    height: OPTION_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  optionTextActive: {
    color: '#000',
  },
});

export default ModeToggle;
