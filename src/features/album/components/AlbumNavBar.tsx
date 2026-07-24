/**
 * AlbumNavBar Component
 * Transparent over the gallery header; the white background, hairline and
 * album title fade in as the header scrolls under the bar. Other tabs
 * always show an opaque bar with their title.
 */

import React, { memo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
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
  /** Page tab's scroll offset — same fade contract as the gallery */
  pageScrollY: SharedValue<number>;
  onBack: () => void;
  onSettingsPress: () => void;
  /**
   * Whether the album has a page yet. When it doesn't, the Page tab shows
   * its create-page hero and the nav bar melts away there — no "Page"
   * title, no frosted background, just the back button.
   */
  pageExists?: boolean;
}

export const AlbumNavBar: React.FC<AlbumNavBarProps> = memo(
  ({
    title,
    scrollPosition,
    galleryScrollY,
    pageScrollY,
    onBack,
    onSettingsPress,
    pageExists = true,
  }) => {
    const insets = useSafeAreaInsets();

    // White background + hairline — on the gallery AND page tabs it fades
    // in as that tab's content scrolls under the bar (same contract);
    // moments keeps an always-opaque bar. With no page created, the
    // background clears again as the Page tab comes on screen.
    const bgStyle = useAnimatedStyle(() => {
      "worklet";
      const galleryBg = interpolate(
        galleryScrollY.value,
        [60, 130],
        [0, 1],
        Extrapolation.CLAMP,
      );
      const pageOwnBg = interpolate(
        pageScrollY.value,
        [60, 130],
        [0, 1],
        Extrapolation.CLAMP,
      );
      // Blend between the neighboring tabs' scroll-driven opacities as the
      // pager moves: gallery(0) → page(1) → moments(2, always opaque)
      const pos = scrollPosition.value;
      const pageBg =
        pos <= 1
          ? interpolate(pos, [0, 1], [galleryBg, pageOwnBg], Extrapolation.CLAMP)
          : interpolate(pos, [1, 2], [pageOwnBg, 1], Extrapolation.CLAMP);
      const pagePresence = pageExists
        ? 0
        : 1 -
          Math.min(Math.abs(scrollPosition.value - 1), 1);
      return { opacity: pageBg * (1 - pagePresence) };
    });

    // Gallery title (index 0) - visible once the header title scrolls away
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
        [60, 130],
        [0, 1],
        Extrapolation.CLAMP,
      );
      return { opacity: pageOpacity * scrollOpacity };
    });

    // Page title (index 1) — like the gallery title, it only appears once
    // the page content has scrolled under the bar; suppressed entirely
    // until a page exists
    const pageTitleStyle = useAnimatedStyle(() => {
      "worklet";
      const tabOpacity = interpolate(
        scrollPosition.value,
        [0.5, 1, 1.5],
        [0, 1, 0],
        Extrapolation.CLAMP,
      );
      const scrollOpacity = interpolate(
        pageScrollY.value,
        [60, 130],
        [0, 1],
        Extrapolation.CLAMP,
      );
      return { opacity: pageExists ? tabOpacity * scrollOpacity : 0 };
    });

    // Moments title (index 2)
    const momentsTitleStyle = useAnimatedStyle(() => {
      "worklet";
      const opacity = interpolate(
        scrollPosition.value,
        [1.5, 2],
        [0, 1],
        Extrapolation.CLAMP,
      );
      return { opacity };
    });

    return (
      <View
        style={[styles.container, { paddingTop: insets.top }]}
        pointerEvents="box-none"
      >
        {/* Frosted light bar: live blur of the content scrolling beneath
            plus a light wash — same material as the tabs' top bar. The
            scroll-driven bgStyle fades the whole stack in/out. */}
        <Animated.View
          style={[styles.background, bgStyle]}
          pointerEvents="none"
        >
          <BlurView
            style={StyleSheet.absoluteFill}
            intensity={40}
            tint="light"
          />
          <View style={styles.backgroundFrost} />
        </Animated.View>

        {/* Content */}
        <View style={styles.content} pointerEvents="box-none">
          <Pressable onPress={onBack} style={styles.navButton}>
            <Ionicons name="chevron-back" size={26} color="#000" />
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
              style={[
                styles.titleDark,
                styles.titleAbsolute,
                momentsTitleStyle,
              ]}
              numberOfLines={1}
            >
              Moments
            </Animated.Text>
          </View>

          <Pressable onPress={onSettingsPress} style={styles.navButton}>
            <Ionicons name="settings-outline" size={24} color="#000" />
          </Pressable>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.08)",
    overflow: "hidden",
  },
  backgroundFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
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
