/**
 * AlbumTabs Component
 * Optimized bottom tab bar - minimal animations
 */

import React, { memo } from "react";
import { View, StyleSheet, Pressable, Dimensions } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  SharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type AlbumTabType = "gallery" | "page" | "moments";

interface Tab {
  key: AlbumTabType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
}

const TABS: Tab[] = [
  {
    key: "gallery",
    label: "Gallery",
    icon: "grid-outline",
    iconFocused: "grid",
  },
  {
    key: "page",
    label: "Page",
    icon: "planet-outline",
    iconFocused: "planet",
  },
  {
    key: "moments",
    label: "Moments",
    icon: "flash-outline",
    iconFocused: "flash",
  },
];

interface AlbumTabsProps {
  scrollPosition: SharedValue<number>;
  onTabPress: (index: number) => void;
  photoCount?: number;
  memberCount?: number;
  /** True while this album has an open drop the user hasn't posted to */
  momentsLive?: boolean;
}

// Single tab button - memoized
const TabButton = memo<{
  tab: Tab;
  index: number;
  scrollPosition: SharedValue<number>;
  onPress: () => void;
  showLiveBadge?: boolean;
}>(({ tab, index, scrollPosition, onPress, showLiveBadge = false }) => {
  // Opacity for outline icon (shown when not active)
  const outlineStyle = useAnimatedStyle(() => {
    "worklet";
    const distance = Math.abs(scrollPosition.value - index);
    return { opacity: distance > 0.5 ? 1 : 0 };
  });

  // Opacity for filled icon (shown when active)
  const filledStyle = useAnimatedStyle(() => {
    "worklet";
    const distance = Math.abs(scrollPosition.value - index);
    return { opacity: distance <= 0.5 ? 1 : 0 };
  });

  // Tab opacity
  const tabStyle = useAnimatedStyle(() => {
    "worklet";
    const distance = Math.abs(scrollPosition.value - index);
    const opacity = interpolate(
      distance,
      [0, 1],
      [1, 0.5],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  return (
    <Pressable onPress={onPress} style={styles.tabButton}>
      <Animated.View style={[styles.tabContent, tabStyle]}>
        <View style={styles.iconContainer}>
          <Animated.View style={outlineStyle}>
            <Ionicons name={tab.icon} size={22} color="#000" />
          </Animated.View>
          <Animated.View style={[styles.iconAbsolute, filledStyle]}>
            <Ionicons name={tab.iconFocused} size={22} color="#000" />
          </Animated.View>
          {showLiveBadge && (
            <View style={styles.liveDot} pointerEvents="none" />
          )}
        </View>
        <Text style={styles.tabLabel}>{tab.label}</Text>
      </Animated.View>
    </Pressable>
  );
});

// Indicator
const TabIndicator = memo<{ scrollPosition: SharedValue<number> }>(
  ({ scrollPosition }) => {
    const tabWidth = SCREEN_WIDTH / TABS.length;
    const indicatorWidth = 36;

    const style = useAnimatedStyle(() => {
      "worklet";
      return {
        transform: [
          {
            translateX:
              scrollPosition.value * tabWidth + (tabWidth - indicatorWidth) / 2,
          },
        ],
      };
    });

    return (
      <Animated.View
        style={[styles.indicator, { width: indicatorWidth }, style]}
      />
    );
  },
);

export const AlbumTabs: React.FC<AlbumTabsProps> = memo(
  ({ scrollPosition, onTabPress, momentsLive = false }) => {
    const insets = useSafeAreaInsets();

    return (
      <BlurView
        tint="extraLight"
        intensity={60}
        style={[styles.container, { paddingBottom: insets.bottom + 8 }]}
      >
        <TabIndicator scrollPosition={scrollPosition} />
        <View style={styles.tabsRow}>
          {TABS.map((tab, index) => (
            <TabButton
              key={tab.key}
              tab={tab}
              index={index}
              scrollPosition={scrollPosition}
              onPress={() => onTabPress(index)}
              showLiveBadge={tab.key === "moments" && momentsLive}
            />
          ))}
        </View>
        <View style={styles.borderOverlay} pointerEvents="none" />
      </BlurView>
    );
  },
);

export const TAB_KEYS: AlbumTabType[] = TABS.map((t) => t.key);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tabsRow: {
    flexDirection: "row",
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  tabContent: {
    alignItems: "center",
    gap: 2,
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconAbsolute: {
    position: "absolute",
  },
  liveDot: {
    position: "absolute",
    top: -1,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: "InstrumentSans_500Medium",
    fontWeight: "500",
    color: "#000",
  },
  indicator: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 3,
    backgroundColor: "#000",
    borderRadius: 1.5,
  },
});

export default AlbumTabs;
