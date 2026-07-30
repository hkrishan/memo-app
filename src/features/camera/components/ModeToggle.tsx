/**
 * ModeToggle Component
 * Photo/Video capture mode switch below the capture button — bare text tabs
 * with a short underline sliding beneath the active one (no pill chrome).
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

import { font } from '@/lib/tokens';
import { CaptureMode } from '../types';

const OPTION_WIDTH = 72;
const UNDERLINE_WIDTH = 24;

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
      <Animated.View style={[styles.underlineTrack, indicatorStyle]}>
        <View style={styles.underline} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingBottom: 7,
  },
  disabled: {
    opacity: 0.4,
  },
  option: {
    width: OPTION_WIDTH,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    ...font.medium,
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 15,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  optionTextActive: {
    ...font.bold,
    color: '#fff',
  },
  underlineTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: OPTION_WIDTH,
    alignItems: 'center',
  },
  underline: {
    width: UNDERLINE_WIDTH,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#fff',
  },
});

export default ModeToggle;
