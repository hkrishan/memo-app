import React from "react";
import { ViewStyle, StyleProp } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

interface TouchableProps {
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  disabled?: boolean;
  activeScale?: number;
  activeOpacity?: number;
}

export default function Touchable({
  onPress,
  onLongPress,
  style,
  children,
  disabled = false,
  activeScale = 0.97,
  activeOpacity = 0.85,
}: TouchableProps) {
  const pressed = useSharedValue(0);

  const gesture = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      pressed.value = withTiming(1, { duration: 100 });
    })
    .onFinalize(() => {
      pressed.value = withTiming(0, { duration: 150 });
    })
    .onEnd(() => {
      if (onPress) {
        runOnJS(onPress)();
      }
    });

  const longPressGesture = Gesture.LongPress()
    .enabled(!disabled && !!onLongPress)
    .minDuration(400)
    .onStart(() => {
      if (onLongPress) {
        runOnJS(onLongPress)();
      }
    });

  const composedGesture = onLongPress
    ? Gesture.Race(gesture, longPressGesture)
    : gesture;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - activeScale) * pressed.value }],
    opacity: 1 - (1 - activeOpacity) * pressed.value,
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}
