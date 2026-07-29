/**
 * CountdownOverlay Component
 * Full-screen self-timer countdown. Tapping anywhere cancels.
 */

import React from 'react';
import { StyleSheet, Pressable, Text } from 'react-native';
import Animated, { ZoomIn, FadeOut } from 'react-native-reanimated';

interface CountdownOverlayProps {
  /** Seconds remaining; null hides the overlay */
  secondsRemaining: number | null;
  onCancel: () => void;
}

export const CountdownOverlay: React.FC<CountdownOverlayProps> = ({
  secondsRemaining,
  onCancel,
}) => {
  if (secondsRemaining == null) {
    return null;
  }

  return (
    <Pressable style={styles.container} onPress={onCancel}>
      <Animated.View
        key={secondsRemaining}
        entering={ZoomIn.duration(250)}
        exiting={FadeOut.duration(150)}
      >
        <Text style={styles.number}>{secondsRemaining}</Text>
      </Animated.View>
      <Text style={styles.hint}>Tap to cancel</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  number: {
    color: '#fff',
    fontSize: 120,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  hint: {
    position: 'absolute',
    bottom: 180,
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
});

export default CountdownOverlay;
