/**
 * ProgressRing
 * Animated circular progress ring driven by a Reanimated shared value
 * (0..1). The stroke animates on the UI thread via strokeDashoffset;
 * whatever is passed as children renders centered inside the ring.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  SharedValue,
  useAnimatedProps,
} from "react-native-reanimated";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  /** Fill fraction 0..1 (values outside the range are clamped) */
  progress: SharedValue<number>;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  color?: string;
  /** Centered inside the ring (percent label, check icon, …) */
  children?: React.ReactNode;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  size = 148,
  strokeWidth = 7,
  trackColor = "#f0f0f1",
  color = "#111",
  children,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const animatedProps = useAnimatedProps(() => {
    const clamped = Math.min(Math.max(progress.value, 0), 1);
    return { strokeDashoffset: circumference * (1 - clamped) };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Starts at 12 o'clock and sweeps clockwise */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
});

export default ProgressRing;
