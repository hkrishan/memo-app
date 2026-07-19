/**
 * ModeToggle Component
 * Toggle slider to switch between Photo and Video modes
 */

import React from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { CaptureMode } from '../types';
import { CAMERA_UI_CONFIG } from '../constants';

interface ModeToggleProps {
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  disabled?: boolean;
}

const TIMING_CONFIG = {
  duration: 200,
  easing: Easing.out(Easing.quad),
};

export const ModeToggle: React.FC<ModeToggleProps> = ({
  mode,
  onModeChange,
  disabled,
}) => {
  const isVideo = mode === CaptureMode.VIDEO;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withTiming(isVideo ? 60 : 0, TIMING_CONFIG),
      },
    ],
  }));

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      {/* Sliding indicator */}
      <Animated.View style={[styles.indicator, indicatorStyle]} />

      {/* Photo option */}
      <Pressable
        style={styles.option}
        onPress={() => onModeChange(CaptureMode.PHOTO)}
        disabled={disabled}
      >
        <Text style={[styles.optionText, !isVideo && styles.optionTextActive]}>
          Photo
        </Text>
      </Pressable>

      {/* Video option */}
      <Pressable
        style={styles.option}
        onPress={() => onModeChange(CaptureMode.VIDEO)}
        disabled={disabled}
      >
        <Text style={[styles.optionText, isVideo && styles.optionTextActive]}>
          Video
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 20,
    padding: 4,
    position: 'relative',
  },
  disabled: {
    opacity: 0.5,
  },
  indicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 60,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 16,
  },
  option: {
    width: 60,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  optionTextActive: {
    color: '#fff',
  },
});

export default ModeToggle;
