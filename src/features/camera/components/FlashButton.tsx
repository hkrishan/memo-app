/**
 * FlashButton Component
 * Toggle button for camera flash modes (off, on, auto)
 */

import React, { useCallback } from 'react';
import { StyleSheet, Pressable, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { FlashMode, FlashButtonProps } from '../types';
import {
  FLASH_MODE_CYCLE,
  FLASH_ICONS,
  FLASH_LABELS,
  CAMERA_UI_CONFIG,
} from '../constants';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TIMING_CONFIG = {
  duration: 100,
  easing: Easing.out(Easing.quad),
};

export const FlashButton: React.FC<FlashButtonProps> = ({
  mode,
  onModeChange,
  disabled,
  showLabel = false,
}) => {
  const scale = useSharedValue(1);

  const handlePress = useCallback(() => {
    const currentIndex = FLASH_MODE_CYCLE.indexOf(mode);
    const nextIndex = (currentIndex + 1) % FLASH_MODE_CYCLE.length;
    const nextMode = FLASH_MODE_CYCLE[nextIndex];

    scale.value = withSequence(
      withTiming(0.85, TIMING_CONFIG),
      withTiming(1, TIMING_CONFIG)
    );

    onModeChange(nextMode);
  }, [mode, onModeChange, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getIconName = (): keyof typeof Ionicons.glyphMap => {
    return FLASH_ICONS[mode] as keyof typeof Ionicons.glyphMap;
  };

  const isActive = mode !== FlashMode.OFF;

  return (
    <View style={styles.container}>
      <AnimatedPressable
        onPress={handlePress}
        disabled={disabled}
        style={[
          styles.button,
          isActive && styles.buttonActive,
          disabled && styles.buttonDisabled,
          animatedStyle,
        ]}
      >
        <Ionicons
          name={getIconName()}
          size={CAMERA_UI_CONFIG.CONTROL_BUTTON.ICON_SIZE}
          color={isActive ? CAMERA_UI_CONFIG.COLORS.ACCENT : CAMERA_UI_CONFIG.COLORS.TEXT}
        />
      </AnimatedPressable>

      {showLabel && (
        <Text style={[styles.label, isActive && styles.labelActive]}>
          {FLASH_LABELS[mode]}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  button: {
    width: CAMERA_UI_CONFIG.CONTROL_BUTTON.SIZE,
    height: CAMERA_UI_CONFIG.CONTROL_BUTTON.SIZE,
    borderRadius: CAMERA_UI_CONFIG.CONTROL_BUTTON.SIZE / 2,
    backgroundColor: CAMERA_UI_CONFIG.CONTROL_BUTTON.BACKGROUND,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonActive: {
    backgroundColor: CAMERA_UI_CONFIG.CONTROL_BUTTON.ACTIVE_BACKGROUND,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  label: {
    color: CAMERA_UI_CONFIG.COLORS.TEXT_SECONDARY,
    fontSize: CAMERA_UI_CONFIG.TYPOGRAPHY.CONTROL_LABEL_SIZE,
    marginTop: 4,
    fontWeight: '500',
  },
  labelActive: {
    color: CAMERA_UI_CONFIG.COLORS.ACCENT,
  },
});

export default FlashButton;
