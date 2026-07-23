/**
 * GridOverlay Component
 * Rule-of-thirds composition grid over the camera preview.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface GridOverlayProps {
  visible: boolean;
}

export const GridOverlay: React.FC<GridOverlayProps> = ({ visible }) => {
  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      style={styles.container}
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
    >
      <Animated.View style={[styles.line, styles.vertical, { left: '33.33%' }]} />
      <Animated.View style={[styles.line, styles.vertical, { left: '66.66%' }]} />
      <Animated.View style={[styles.line, styles.horizontal, { top: '33.33%' }]} />
      <Animated.View style={[styles.line, styles.horizontal, { top: '66.66%' }]} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  line: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  vertical: {
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth * 2,
  },
  horizontal: {
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
  },
});

export default GridOverlay;
