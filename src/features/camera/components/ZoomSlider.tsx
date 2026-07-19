/**
 * ZoomSlider Component
 * Snapchat-style zoom level selector with preset buttons and slider
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { ZoomLevel, ZoomControlsProps } from '../types';
import { ZOOM_CONFIG, CAMERA_UI_CONFIG } from '../constants';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ZoomPresetButtonProps {
  preset: ZoomLevel;
  isActive: boolean;
  onPress: () => void;
  disabled?: boolean;
}

const ZoomPresetButton: React.FC<ZoomPresetButtonProps> = ({
  preset,
  isActive,
  onPress,
  disabled,
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 15, stiffness: 200 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        styles.presetButton,
        isActive && styles.presetButtonActive,
        disabled && styles.presetButtonDisabled,
        animatedStyle,
      ]}
    >
      <Text
        style={[
          styles.presetButtonText,
          isActive && styles.presetButtonTextActive,
          disabled && styles.presetButtonTextDisabled,
        ]}
      >
        {preset.label}
      </Text>
    </AnimatedPressable>
  );
};

interface ZoomSliderTrackProps {
  currentZoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomChange: (zoom: number) => void;
  disabled?: boolean;
}

const ZoomSliderTrack: React.FC<ZoomSliderTrackProps> = ({
  currentZoom,
  minZoom,
  maxZoom,
  onZoomChange,
  disabled,
}) => {
  const sliderWidth = useSharedValue(0);
  const translateX = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const progress = useMemo(() => {
    return (currentZoom - minZoom) / (maxZoom - minZoom);
  }, [currentZoom, minZoom, maxZoom]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    sliderWidth.value = event.nativeEvent.layout.width;
  }, [sliderWidth]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          isDragging.value = true;
        })
        .onUpdate((event) => {
          if (sliderWidth.value === 0) return;

          const newProgress = Math.max(
            0,
            Math.min(1, (translateX.value + event.translationX) / sliderWidth.value)
          );
          const newZoom = minZoom + newProgress * (maxZoom - minZoom);
          onZoomChange(newZoom);
        })
        .onEnd(() => {
          isDragging.value = false;
          translateX.value = progress * sliderWidth.value;
        })
        .enabled(!disabled),
    [sliderWidth, translateX, isDragging, minZoom, maxZoom, progress, onZoomChange, disabled]
  );

  const thumbAnimatedStyle = useAnimatedStyle(() => {
    const position = interpolate(
      progress,
      [0, 1],
      [0, sliderWidth.value - ZOOM_CONFIG.SLIDER.THUMB_SIZE],
      Extrapolate.CLAMP
    );

    return {
      transform: [
        { translateX: position },
        { scale: isDragging.value ? 1.2 : 1 },
      ],
    };
  }, [progress]);

  const fillAnimatedStyle = useAnimatedStyle(() => {
    const width = interpolate(
      progress,
      [0, 1],
      [0, sliderWidth.value],
      Extrapolate.CLAMP
    );

    return {
      width,
    };
  }, [progress]);

  return (
    <View style={styles.sliderContainer} onLayout={onLayout}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.sliderTrack}>
          <Animated.View style={[styles.sliderFill, fillAnimatedStyle]} />
          <Animated.View style={[styles.sliderThumb, thumbAnimatedStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
};

export const ZoomSlider: React.FC<ZoomControlsProps> = ({
  currentZoom,
  minZoom,
  maxZoom,
  onZoomChange,
  zoomLevels,
  activePreset,
  onPresetSelect,
  disabled,
}) => {
  const handlePresetPress = useCallback(
    (preset: ZoomLevel) => {
      onPresetSelect(preset);
    },
    [onPresetSelect]
  );

  return (
    <View style={styles.container}>
      {/* Zoom preset buttons */}
      <View style={styles.presetsContainer}>
        {zoomLevels.map((preset) => (
          <ZoomPresetButton
            key={preset.label}
            preset={preset}
            isActive={activePreset?.value === preset.value}
            onPress={() => handlePresetPress(preset)}
            disabled={disabled}
          />
        ))}
      </View>

      {/* Zoom slider */}
      <ZoomSliderTrack
        currentZoom={currentZoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        onZoomChange={onZoomChange}
        disabled={disabled}
      />

      {/* Current zoom indicator */}
      <Text style={styles.zoomIndicator}>
        {currentZoom.toFixed(1)}x
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  presetsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  presetButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: CAMERA_UI_CONFIG.COLORS.ACCENT,
  },
  presetButtonDisabled: {
    opacity: 0.5,
  },
  presetButtonText: {
    color: CAMERA_UI_CONFIG.COLORS.TEXT,
    fontSize: 13,
    fontWeight: '600',
  },
  presetButtonTextActive: {
    color: CAMERA_UI_CONFIG.COLORS.ACCENT,
  },
  presetButtonTextDisabled: {
    color: CAMERA_UI_CONFIG.COLORS.TEXT_SECONDARY,
  },
  sliderContainer: {
    width: '100%',
    height: 40,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    backgroundColor: ZOOM_CONFIG.SLIDER.MAX_TRACK_COLOR,
    borderRadius: 2,
    overflow: 'visible',
  },
  sliderFill: {
    position: 'absolute',
    height: 4,
    backgroundColor: ZOOM_CONFIG.SLIDER.MIN_TRACK_COLOR,
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    width: ZOOM_CONFIG.SLIDER.THUMB_SIZE,
    height: ZOOM_CONFIG.SLIDER.THUMB_SIZE,
    borderRadius: ZOOM_CONFIG.SLIDER.THUMB_SIZE / 2,
    backgroundColor: ZOOM_CONFIG.SLIDER.THUMB_COLOR,
    top: -(ZOOM_CONFIG.SLIDER.THUMB_SIZE - 4) / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  zoomIndicator: {
    color: CAMERA_UI_CONFIG.COLORS.TEXT,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
    opacity: 0.8,
  },
});

export default ZoomSlider;
