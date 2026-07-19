/**
 * AlbumNavBar Component
 * Optimized - no blur, minimal animations
 */

import React, { memo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  SharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";

interface AlbumNavBarProps {
  title: string;
  scrollPosition: SharedValue<number>;
  galleryScrollY: SharedValue<number>;
  onBack: () => void;
}

export const AlbumNavBar: React.FC<AlbumNavBarProps> = memo(
  ({ title, scrollPosition, galleryScrollY, onBack }) => {
    const insets = useSafeAreaInsets();

    // Simple background opacity
    const bgStyle = useAnimatedStyle(() => {
      "worklet";
      // Show bg when scrolled on gallery OR on other pages
      const galleryBg = interpolate(
        galleryScrollY.value,
        [0, 100],
        [0, 1],
        Extrapolation.CLAMP,
      );
      const pageBg = interpolate(
        scrollPosition.value,
        [0, 0.3],
        [galleryBg, 1],
        Extrapolation.CLAMP,
      );
      return { opacity: pageBg };
    });

    // Gallery title (index 0) - visible when on gallery AND scrolled
    const galleryTitleStyle = useAnimatedStyle(() => {
      "worklet";
      const pageOpacity = interpolate(
        scrollPosition.value,
        [0, 0.5],
        [1, 0],
        Extrapolation.CLAMP,
      );
      const scrollOpacity = interpolate(
        galleryScrollY.value,
        [50, 150],
        [0, 1],
        Extrapolation.CLAMP,
      );
      return { opacity: pageOpacity * scrollOpacity };
    });

    // Page title (index 1)
    const pageTitleStyle = useAnimatedStyle(() => {
      "worklet";
      const opacity = interpolate(
        scrollPosition.value,
        [0.5, 1, 1.5],
        [0, 1, 0],
        Extrapolation.CLAMP,
      );
      return { opacity };
    });

    // Chat title (index 2)
    const chatTitleStyle = useAnimatedStyle(() => {
      "worklet";
      const opacity = interpolate(
        scrollPosition.value,
        [1.5, 2, 2.5],
        [0, 1, 0],
        Extrapolation.CLAMP,
      );
      return { opacity };
    });

    // Activity title (index 3)
    const activityTitleStyle = useAnimatedStyle(() => {
      "worklet";
      const opacity = interpolate(
        scrollPosition.value,
        [2.5, 3, 3.5],
        [0, 1, 0],
        Extrapolation.CLAMP,
      );
      return { opacity };
    });

    // Settings title (index 4)
    const settingsTitleStyle = useAnimatedStyle(() => {
      "worklet";
      const opacity = interpolate(
        scrollPosition.value,
        [3.5, 4],
        [0, 1],
        Extrapolation.CLAMP,
      );
      return { opacity };
    });

    // Icon style - white on gallery not scrolled, black otherwise
    const isLightIcon = useAnimatedStyle(() => {
      "worklet";
      const scrolled = interpolate(
        galleryScrollY.value,
        [0, 100],
        [0, 1],
        Extrapolation.CLAMP,
      );
      const onOtherPage = interpolate(
        scrollPosition.value,
        [0, 0.3],
        [0, 1],
        Extrapolation.CLAMP,
      );
      const isDark = Math.max(scrolled, onOtherPage);
      return { opacity: 1 - isDark };
    });

    const isDarkIcon = useAnimatedStyle(() => {
      "worklet";
      const scrolled = interpolate(
        galleryScrollY.value,
        [0, 100],
        [0, 1],
        Extrapolation.CLAMP,
      );
      const onOtherPage = interpolate(
        scrollPosition.value,
        [0, 0.3],
        [0, 1],
        Extrapolation.CLAMP,
      );
      return { opacity: Math.max(scrolled, onOtherPage) };
    });

    return (
      <View
        style={[styles.container, { paddingTop: insets.top }]}
        pointerEvents="box-none"
      >
        {/* Background */}
        <Animated.View
          style={[styles.background, bgStyle]}
          pointerEvents="none"
        />

        {/* Content */}
        <View style={styles.content} pointerEvents="box-none">
          <Pressable onPress={onBack} style={styles.navButton}>
            <View>
              <Animated.View style={isLightIcon}>
                <Ionicons name="chevron-back" size={26} color="#fff" />
              </Animated.View>
              <Animated.View style={[styles.iconAbsolute, isDarkIcon]}>
                <Ionicons name="chevron-back" size={26} color="#000" />
              </Animated.View>
            </View>
          </Pressable>

          <View style={styles.titleContainer} pointerEvents="none">
            <Animated.Text
              style={[styles.titleDark, galleryTitleStyle]}
              numberOfLines={1}
            >
              {title}
            </Animated.Text>
            <Animated.Text
              style={[styles.titleDark, styles.titleAbsolute, pageTitleStyle]}
              numberOfLines={1}
            >
              Page
            </Animated.Text>
            <Animated.Text
              style={[styles.titleDark, styles.titleAbsolute, chatTitleStyle]}
              numberOfLines={1}
            >
              Chat
            </Animated.Text>
            <Animated.Text
              style={[
                styles.titleDark,
                styles.titleAbsolute,
                activityTitleStyle,
              ]}
              numberOfLines={1}
            >
              Activity
            </Animated.Text>
            <Animated.Text
              style={[
                styles.titleDark,
                styles.titleAbsolute,
                settingsTitleStyle,
              ]}
              numberOfLines={1}
            >
              Settings
            </Animated.Text>
          </View>

          <View style={styles.navButton} />
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    paddingHorizontal: 8,
  },
  navButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  iconAbsolute: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  titleContainer: {
    flex: 1,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  titleDark: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  titleAbsolute: {
    position: "absolute",
  },
});

export default AlbumNavBar;
