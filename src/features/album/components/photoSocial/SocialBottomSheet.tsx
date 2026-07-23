/**
 * Shared bottom-sheet chrome for the photo social sheets (comments, tags).
 * Custom-built with reanimated (no external sheet library): a dark rounded
 * sheet that springs up over a pressable backdrop, with a drag handle that
 * can be pulled down to dismiss. Rendered in its own transparent Modal so it
 * stacks above the fullscreen photo viewer chrome and filmstrip.
 *
 * Keyboard handling is manual: the OS never resizes a statusBarTranslucent
 * Modal window on Android (so KeyboardAvoidingView is a no-op there), and on
 * iOS a KAV would not shrink the sheet's maxHeight. Keyboard listeners drive
 * a shared value that lifts the sheet above the keyboard and caps its height
 * so the drag handle and backdrop stay reachable.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const OPEN_SPRING = { damping: 26, stiffness: 300, mass: 0.9 };
const DISMISS_DRAG_THRESHOLD = 110;
const DISMISS_VELOCITY_THRESHOLD = 900;
// Backdrop kept visible above the sheet while the keyboard is open (below the
// top safe-area inset) so tap-outside dismissal stays reachable
const KEYBOARD_TOP_MARGIN = 56;
const IOS_KEYBOARD_EASING = Easing.bezier(0.38, 0.7, 0.125, 1);
const ANDROID_KEYBOARD_TIMING = { duration: 160, easing: Easing.out(Easing.quad) };

type SocialBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Sheet height as a fraction of the screen, applied via maxHeight */
  heightFraction?: number;
  children: React.ReactNode;
};

const SocialBottomSheet: React.FC<SocialBottomSheetProps> = ({
  visible,
  onClose,
  title,
  heightFraction = 0.62,
  children,
}) => {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);

  // 0 = fully open, positive = translated down (towards dismissal)
  const translateY = useSharedValue(1000);
  const backdropOpacity = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const keyboardHeight = useSharedValue(0);

  const unmount = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (Platform.OS === "ios") {
      // willChangeFrame covers show/hide/frame changes and carries the
      // timing the OS is about to animate with
      const sub = Keyboard.addListener("keyboardWillChangeFrame", (event) => {
        const height = Math.max(
          0,
          Dimensions.get("window").height - event.endCoordinates.screenY,
        );
        keyboardHeight.value = withTiming(height, {
          duration: event.duration > 0 ? event.duration : 250,
          easing: IOS_KEYBOARD_EASING,
        });
      });
      return () => sub.remove();
    }
    // Android: the statusBarTranslucent Modal window is never resized by the
    // OS, so track the keyboard manually via the Did* events
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardHeight.value = withTiming(
        event.endCoordinates.height,
        ANDROID_KEYBOARD_TIMING,
      );
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      keyboardHeight.value = withTiming(0, ANDROID_KEYBOARD_TIMING);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardHeight]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = 1000;
      backdropOpacity.value = 0;
      // Let the Modal mount before springing up
      requestAnimationFrame(() => {
        translateY.value = withSpring(0, OPEN_SPRING);
        backdropOpacity.value = withTiming(1, { duration: 220 });
      });
    } else if (mounted) {
      backdropOpacity.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(1000, { duration: 240 }, (finished) => {
        if (finished) runOnJS(unmount)();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      const next = dragStartY.value + event.translationY;
      // Resist upward drag past the resting point
      translateY.value = next < 0 ? next / 12 : next;
    })
    .onEnd((event) => {
      const shouldDismiss =
        translateY.value > DISMISS_DRAG_THRESHOLD ||
        event.velocityY > DISMISS_VELOCITY_THRESHOLD;
      if (shouldDismiss) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, OPEN_SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const windowHeight = Dimensions.get("window").height;
  const sheetMaxHeight = Math.round(windowHeight * heightFraction);
  const keyboardTopMargin = insets.top + KEYBOARD_TOP_MARGIN;

  // Lifts the sheet above the keyboard
  const containerStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboardHeight.value,
  }));

  // Caps the sheet so its top never overflows offscreen while the keyboard
  // is open
  const sheetLayoutStyle = useAnimatedStyle(() => ({
    maxHeight: Math.min(
      sheetMaxHeight,
      windowHeight - keyboardHeight.value - keyboardTopMargin,
    ),
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        <Animated.View
          style={[styles.container, containerStyle]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 12) },
              sheetLayoutStyle,
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={panGesture}>
              <View style={styles.grabArea}>
                <View style={styles.handle} />
                <Text style={styles.title}>{title}</Text>
              </View>
            </GestureDetector>
            {children}
          </Animated.View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "rgba(20, 20, 20, 0.98)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  grabArea: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
  },
  title: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 12,
  },
});

export default SocialBottomSheet;
