/**
 * FocusExposureControl Component
 * iOS-style tap-to-focus reticle with an exposure slider beside it.
 * Drag vertically on the control to adjust exposure bias; it fades out
 * after a moment of inactivity.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const RETICLE_SIZE = 80;
const SLIDER_HEIGHT = 140;
const SLIDER_WIDTH = 36;
const SLIDER_GAP = 18;
const SLIDER_TRAVEL = 55;
const FADE_DELAY = 2500;

interface FocusExposureControlProps {
  point: { x: number; y: number } | null;
  /** Normalized exposure bias in [-1, 1]; written on the UI thread */
  exposureBias: SharedValue<number>;
}

export const FocusExposureControl: React.FC<FocusExposureControlProps> = ({
  point,
  exposureBias,
}) => {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1.4);
  const panStartBias = useSharedValue(0);

  const [interactive, setInteractive] = useState(false);
  // Bumped after each drag so the fade-out timer restarts
  const [interactionTick, setInteractionTick] = useState(0);

  useEffect(() => {
    if (!point) {
      opacity.value = 0;
      setInteractive(false);
      return;
    }

    setInteractive(true);
    scale.value = 1.4;
    scale.value = withTiming(1, { duration: 200 });
    opacity.value = withTiming(1, { duration: 120 });

    const timeout = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 300 });
      setInteractive(false);
    }, FADE_DELAY);

    return () => clearTimeout(timeout);
  }, [point, interactionTick, opacity, scale]);

  const bumpInteraction = () => setInteractionTick((t) => t + 1);

  const exposurePan = Gesture.Pan()
    .onStart(() => {
      panStartBias.value = exposureBias.value;
    })
    .onUpdate((event) => {
      const next = panStartBias.value - event.translationY / 150;
      exposureBias.value = Math.max(-1, Math.min(1, next));
    })
    .onEnd(() => {
      runOnJS(bumpInteraction)();
    });

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const sunStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -exposureBias.value * SLIDER_TRAVEL }],
  }));

  if (!point) {
    return null;
  }

  // Put the slider on whichever side of the reticle has room
  const sliderFootprint = SLIDER_WIDTH + SLIDER_GAP;
  const sliderOnRight =
    point.x + RETICLE_SIZE / 2 + sliderFootprint < SCREEN_WIDTH;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          left:
            point.x - RETICLE_SIZE / 2 - (sliderOnRight ? 0 : sliderFootprint),
          top: point.y - SLIDER_HEIGHT / 2,
        },
        containerStyle,
      ]}
      pointerEvents={interactive ? 'box-none' : 'none'}
    >
      <GestureDetector gesture={exposurePan}>
        <View
          style={[
            styles.touchArea,
            { flexDirection: sliderOnRight ? 'row' : 'row-reverse' },
          ]}
        >
          <View style={styles.reticle} />
          <View style={[styles.slider, { marginHorizontal: SLIDER_GAP / 2 }]}>
            <View style={styles.sliderTrack} />
            <Animated.View style={sunStyle}>
              <Ionicons
                name="sunny"
                size={24}
                color="#FFD700"
                style={styles.sunIcon}
              />
            </Animated.View>
          </View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    height: SLIDER_HEIGHT,
    alignItems: 'center',
  },
  touchArea: {
    flexDirection: 'row',
    alignItems: 'center',
    height: SLIDER_HEIGHT,
  },
  reticle: {
    width: RETICLE_SIZE,
    height: RETICLE_SIZE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FFD700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  slider: {
    width: SLIDER_WIDTH,
    height: SLIDER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderTrack: {
    ...StyleSheet.absoluteFillObject,
    left: '50%',
    width: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  sunIcon: {
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

export default FocusExposureControl;
