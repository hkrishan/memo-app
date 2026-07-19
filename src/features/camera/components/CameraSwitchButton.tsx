/**
 * CameraSwitchButton Component
 * Animated button to switch between front and back cameras
 */

import React, { useCallback } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { CameraPosition, CameraSwitchButtonProps } from '../types';
import { CAMERA_UI_CONFIG } from '../constants';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TIMING_CONFIG = {
  duration: 200,
  easing: Easing.out(Easing.quad),
};

export const CameraSwitchButton: React.FC<CameraSwitchButtonProps> = ({
  position,
  onSwitch,
  disabled,
  size = CAMERA_UI_CONFIG.CONTROL_BUTTON.SIZE,
}) => {
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);

  const handlePress = useCallback(() => {
    rotation.value = withTiming(rotation.value + 180, TIMING_CONFIG);

    scale.value = withSequence(
      withTiming(0.9, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );

    onSwitch();
  }, [onSwitch, rotation, scale]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isFrontCamera = position === CameraPosition.FRONT;

  return (
    <View style={styles.container}>
      <AnimatedPressable
        onPress={handlePress}
        disabled={disabled}
        style={[
          styles.button,
          { width: size, height: size, borderRadius: size / 2 },
          disabled && styles.buttonDisabled,
          animatedButtonStyle,
        ]}
      >
        <Animated.View style={animatedIconStyle}>
          <Ionicons
            name="camera-reverse-outline"
            size={CAMERA_UI_CONFIG.CONTROL_BUTTON.ICON_SIZE}
            color={CAMERA_UI_CONFIG.COLORS.TEXT}
          />
        </Animated.View>
      </AnimatedPressable>

      <View style={styles.indicatorContainer}>
        <View
          style={[
            styles.indicator,
            isFrontCamera && styles.indicatorActive,
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  button: {
    backgroundColor: CAMERA_UI_CONFIG.CONTROL_BUTTON.BACKGROUND,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  indicatorContainer: {
    marginTop: 6,
    alignItems: 'center',
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    backgroundColor: CAMERA_UI_CONFIG.COLORS.ACCENT,
  },
});

export default CameraSwitchButton;
