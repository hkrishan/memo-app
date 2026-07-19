/**
 * ZoomLevelIndicator Component
 * Delicate zoom level display that appears during zoom gestures
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface ZoomLevelIndicatorProps {
  zoom: number;
  isActive?: boolean;
  autoHideDelay?: number;
}

const TIMING_CONFIG = {
  duration: 150,
  easing: Easing.out(Easing.quad),
};

export const ZoomLevelIndicator: React.FC<ZoomLevelIndicatorProps> = ({
  zoom,
  isActive = false,
  autoHideDelay = 1500,
}) => {
  const opacity = useSharedValue(0);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimeout = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    clearHideTimeout();

    if (isActive) {
      opacity.value = withTiming(1, TIMING_CONFIG);
    } else {
      hideTimeoutRef.current = setTimeout(() => {
        opacity.value = withTiming(0, TIMING_CONFIG);
      }, autoHideDelay);
    }

    return () => clearHideTimeout();
  }, [isActive, zoom, autoHideDelay, opacity]);

  useEffect(() => {
    opacity.value = withTiming(1, TIMING_CONFIG);

    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      if (!isActive) {
        opacity.value = withTiming(0, TIMING_CONFIG);
      }
    }, autoHideDelay);
  }, [zoom, isActive, autoHideDelay, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const formatZoom = (value: number): string => {
    return `${value.toFixed(1)}x`;
  };

  // Don't show indicator at 1x zoom (default)
  if (Math.abs(zoom - 1) < 0.05) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Text style={styles.zoomText}>{formatZoom(zoom)}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'center',
  },
  zoomText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
});

export default ZoomLevelIndicator;
