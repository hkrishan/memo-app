import React, { useCallback, useRef } from "react";
import { View, StyleSheet, Dimensions, Pressable } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  interpolateColor,
  SharedValue,
  Extrapolation,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { SwipeableTabsProvider } from "@/contexts/SwipeableTabsContext";
import Avatar from "./ui/Avatar";
import { User } from "@/features/user/types/user.types";
import Touchable from "./touchable";
import { useRouter } from "expo-router";
import useUser from "@/features/user/hooks/useUser";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

const TIMING_CONFIG = {
  duration: 250,
  easing: Easing.out(Easing.cubic),
};

const TOP_BAR_HEIGHT = 44;

interface TopBarConfig {
  title?: string;
}

interface Tab {
  key: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconFocused?: keyof typeof Ionicons.glyphMap;
  /** Render a shutter-style thick-bordered circle instead of Ionicons glyphs */
  shutterIcon?: boolean;
  component: React.ReactNode;
  topBar?: TopBarConfig;
}

interface SwipeableTabsProps {
  tabs: Tab[];
  initialPage?: number;
}

export default function SwipeableTabs({
  tabs,
  initialPage = 1,
}: SwipeableTabsProps) {
  const scrollPosition = useSharedValue(initialPage);
  const currentPage = useSharedValue(initialPage);
  const insets = useSafeAreaInsets();

  const centerTab = tabs[1];
  const leftTab = tabs[0];
  const rightTab = tabs[2];

  // The pager pan runs OUTSIDE React Native's responder system, so a swipe
  // does not cancel presses on the cards it started over — releasing a
  // swipe used to "tap" whatever was under the finger. While the pan is
  // active (and until the settle animation lands), the container CAPTURES
  // child touches (see onStart/onMoveShouldSetResponderCapture below),
  // which cancels the in-flight press the way a native scroll view would.
  const blockChildTouchesRef = useRef(false);
  const unblockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setChildTouchesBlocked = useCallback((blocked: boolean) => {
    if (unblockTimerRef.current) {
      clearTimeout(unblockTimerRef.current);
      unblockTimerRef.current = null;
    }
    blockChildTouchesRef.current = blocked;
  }, []);
  // Safety: an interrupted gesture may skip onEnd — never stay blocked
  const scheduleUnblockSafety = useCallback(() => {
    if (unblockTimerRef.current) clearTimeout(unblockTimerRef.current);
    unblockTimerRef.current = setTimeout(() => {
      blockChildTouchesRef.current = false;
      unblockTimerRef.current = null;
    }, TIMING_CONFIG.duration + 150);
  }, []);
  const shouldCaptureChildTouches = useCallback(
    () => blockChildTouchesRef.current,
    [],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart(() => {
      runOnJS(setChildTouchesBlocked)(true);
    })
    .onUpdate((e) => {
      const dragProgress = -e.translationX / SCREEN_WIDTH;
      scrollPosition.value = Math.max(
        0,
        Math.min(2, currentPage.value + dragProgress),
      );
    })
    .onEnd((e) => {
      const velocity = -e.velocityX;
      const dragProgress = -e.translationX / SCREEN_WIDTH;
      const projectedPage = currentPage.value + dragProgress + velocity / 2000;

      let targetPage: number;
      if (projectedPage < 0.5) {
        targetPage = 0;
      } else if (projectedPage < 1.5) {
        targetPage = 1;
      } else {
        targetPage = 2;
      }

      targetPage = Math.max(0, Math.min(2, targetPage));
      currentPage.value = targetPage;
      scrollPosition.value = withTiming(targetPage, TIMING_CONFIG, () => {
        // Taps stay blocked while the pages settle under the finger-up spot
        runOnJS(setChildTouchesBlocked)(false);
      });
    })
    .onFinalize(() => {
      runOnJS(scheduleUnblockSafety)();
    });

  const navigateToPage = useCallback(
    (index: number) => {
      currentPage.value = index;
      scrollPosition.value = withTiming(index, TIMING_CONFIG);
    },
    [scrollPosition, currentPage],
  );

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={styles.container}
        // Capture (and thereby cancel) child presses while swiping/settling
        onStartShouldSetResponderCapture={shouldCaptureChildTouches}
        onMoveShouldSetResponderCapture={shouldCaptureChildTouches}
      >
        {/* Camera - fixed in background */}
        <View style={styles.centerPage}>
          <SwipeableTabsProvider
            scrollPosition={scrollPosition}
            currentPage={currentPage}
            pageIndex={1}
          >
            {centerTab.component}
          </SwipeableTabsProvider>
        </View>

        {/* Left overlay (Albums) */}
        <OverlayPage
          scrollPosition={scrollPosition}
          currentPage={currentPage}
          pageIndex={0}
          direction="left"
          component={leftTab.component}
        />

        {/* Right overlay (Stories) */}
        <OverlayPage
          scrollPosition={scrollPosition}
          currentPage={currentPage}
          pageIndex={2}
          direction="right"
          component={rightTab.component}
        />

        {/* Top bar */}
        <TopBar
          tabs={tabs}
          scrollPosition={scrollPosition}
          topInset={insets.top}
        />

        {/* Tab bar */}
        <TabBar
          tabs={tabs}
          scrollPosition={scrollPosition}
          onNavigate={navigateToPage}
          bottomInset={insets.bottom}
        />
      </View>
    </GestureDetector>
  );
}

interface OverlayPageProps {
  scrollPosition: SharedValue<number>;
  currentPage: SharedValue<number>;
  pageIndex: number;
  direction: "left" | "right";
  component: React.ReactNode;
}

function OverlayPage({
  scrollPosition,
  currentPage,
  pageIndex,
  direction,
  component,
}: OverlayPageProps) {
  const animatedStyle = useAnimatedStyle(() => {
    let translateX: number;

    if (direction === "left") {
      translateX = interpolate(
        scrollPosition.value,
        [0, 1],
        [0, -SCREEN_WIDTH],
        Extrapolation.CLAMP,
      );
    } else {
      translateX = interpolate(
        scrollPosition.value,
        [1, 2],
        [SCREEN_WIDTH, 0],
        Extrapolation.CLAMP,
      );
    }

    return {
      transform: [{ translateX }],
    };
  });

  return (
    <Animated.View
      style={[styles.overlayPage, animatedStyle]}
      pointerEvents="box-none"
    >
      <SwipeableTabsProvider
        scrollPosition={scrollPosition}
        currentPage={currentPage}
        pageIndex={pageIndex}
      >
        {component}
      </SwipeableTabsProvider>
    </Animated.View>
  );
}

interface TopBarProps {
  tabs: Tab[];
  scrollPosition: SharedValue<number>;
  topInset: number;
}

function TopBar({ tabs, scrollPosition, topInset }: TopBarProps) {
  const { user } = useUser();
  const router = useRouter();

  // Blur visibility - show on Album (0) and Feed (2), hide on Camera (1)
  const blurStyle = useAnimatedStyle(() => {
    // Fade out blur as we approach camera (1), fade in on album (0) and feed (2)
    const opacity = interpolate(
      scrollPosition.value,
      [0, 0.5, 1, 1.5, 2],
      [1, 0.5, 0, 0.5, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Background tint for album (light) vs feed (dark)
  const blurTintStyle = useAnimatedStyle(() => {
    // Album gets light tint, feed gets dark tint
    const backgroundColor = interpolateColor(
      scrollPosition.value,
      [0, 1, 2],
      ["rgba(255, 255, 255, 0.7)", "rgba(0, 0, 0, 0)", "rgba(26, 26, 26, 0.5)"],
    );
    return { backgroundColor };
  });

  const iconColorStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      scrollPosition.value,
      [0, 0.5, 1, 2],
      ["#000000", "#ffffff", "#ffffff", "#ffffff"],
    );
    return { color };
  });

  // Search icon visibility - only show on Feed (page 2)
  const searchIconStyle = useAnimatedStyle(() => {
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
      style={[styles.topBar, { paddingTop: topInset }]}
      pointerEvents="box-none"
    >
      {/* Blur background for Album and Feed screens */}
      <Animated.View
        style={[StyleSheet.absoluteFill, blurStyle]}
        pointerEvents="none"
      >
        <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Tint overlay */}
      <Animated.View
        style={[StyleSheet.absoluteFill, blurTintStyle]}
        pointerEvents="none"
      />

      <View style={styles.topBarContent} pointerEvents="box-none">
        <Touchable
          style={styles.topBarIconLeft}
          onPress={() => {
            router.push("/user");
          }}
        >
          <Avatar user={user} />
        </Touchable>

        <View style={styles.topBarTitleContainer} pointerEvents="none">
          {tabs.map((tab, index) =>
            tab.topBar?.title ? (
              <TopBarTitle
                key={tab.key}
                title={tab.topBar.title}
                index={index}
                scrollPosition={scrollPosition}
              />
            ) : null,
          )}
        </View>

        {/* Search icon - visible only on Feed page */}
        <Animated.View style={[styles.topBarSearchIcon, searchIconStyle]}>
          <Touchable
            onPress={() => {
              router.push("/search");
            }}
          >
            <Animated.Text style={iconColorStyle}>
              <Ionicons name="search" size={22} />
            </Animated.Text>
          </Touchable>
        </Animated.View>

        <Touchable
          style={styles.topBarIconRight}
          onPress={() => {
            router.push("/profile");
          }}
        >
          <Animated.Text style={iconColorStyle}>
            <Ionicons name="menu" size={24} />
          </Animated.Text>
        </Touchable>
      </View>
    </View>
  );
}

interface TopBarTitleProps {
  title: string;
  index: number;
  scrollPosition: SharedValue<number>;
}

function TopBarTitle({ title, index, scrollPosition }: TopBarTitleProps) {
  const opacityStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - index);
    const opacity = interpolate(
      distance,
      [0, 0.4],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  const textColorStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      scrollPosition.value,
      [0, 0.5, 1, 2],
      ["#000000", "#ffffff", "#ffffff", "#ffffff"],
    );
    return { color };
  });

  return (
    <Animated.View style={[styles.topBarTitleAbsolute, opacityStyle]}>
      <Animated.Text style={[styles.topBarTitleText, textColorStyle]}>
        {title}
      </Animated.Text>
    </Animated.View>
  );
}

interface TabBarProps {
  tabs: Tab[];
  scrollPosition: SharedValue<number>;
  onNavigate: (index: number) => void;
  bottomInset: number;
}

function TabBar({
  tabs,
  scrollPosition,
  onNavigate,
  bottomInset,
}: TabBarProps) {
  // Background color: white for Album (0), dark transparent for Camera (1), dark gray for Feed (2)
  const animatedBarStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      scrollPosition.value,
      [0, 1, 2],
      [
        "rgba(255, 255, 255, 1)",
        "rgba(0, 0, 0, 0.85)",
        "rgba(26, 26, 26, 0.75)",
      ],
    );

    return { backgroundColor };
  });

  // Blur visibility - only show on Feed (page 2)
  const blurStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollPosition.value,
      [1, 2],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  return (
    <View style={[styles.tabBar, { paddingBottom: bottomInset + 8 }]}>
      {/* Blur background for Feed screen */}
      <Animated.View style={[StyleSheet.absoluteFill, blurStyle]}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Colored overlay */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedBarStyle]} />

      {/* Tab buttons */}
      <View style={styles.tabBarContent}>
        {tabs.map((tab, index) => (
          <TabButton
            key={tab.key}
            index={index}
            icon={tab.icon}
            iconFocused={tab.iconFocused}
            shutterIcon={tab.shutterIcon}
            scrollPosition={scrollPosition}
            onPress={() => onNavigate(index)}
          />
        ))}
        <TabIndicator scrollPosition={scrollPosition} tabCount={tabs.length} />
      </View>
    </View>
  );
}

interface TabButtonProps {
  index: number;
  icon?: keyof typeof Ionicons.glyphMap;
  iconFocused?: keyof typeof Ionicons.glyphMap;
  shutterIcon?: boolean;
  scrollPosition: SharedValue<number>;
  onPress: () => void;
}

function TabButton({
  index,
  icon,
  iconFocused,
  shutterIcon,
  scrollPosition,
  onPress,
}: TabButtonProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - index);
    const scale = interpolate(distance, [0, 1], [1.15, 1], Extrapolation.CLAMP);
    const opacity = interpolate(
      distance,
      [0, 1],
      [1, 0.5],
      Extrapolation.CLAMP,
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const focusedIconStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - index);
    const opacity = interpolate(
      distance,
      [0, 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    );

    return { opacity };
  });

  const outlineIconStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - index);
    const opacity = interpolate(
      distance,
      [0, 0.5],
      [0, 1],
      Extrapolation.CLAMP,
    );

    return { opacity };
  });

  // Icon color: white on Camera (1) and Feed (2), black on Album (0)
  const iconColorStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      scrollPosition.value,
      [0, 0.5, 1, 2],
      ["#000000", "#ffffff", "#ffffff", "#ffffff"],
    );
    return { color };
  });

  // Shutter-style circle: border thickens when the tab is active
  const shutterStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - index);
    const borderWidth = interpolate(
      distance,
      [0, 1],
      [4, 3],
      Extrapolation.CLAMP,
    );
    const borderColor = interpolateColor(
      scrollPosition.value,
      [0, 0.5, 1, 2],
      ["#000000", "#ffffff", "#ffffff", "#ffffff"],
    );
    return { borderWidth, borderColor };
  });

  return (
    <Pressable onPress={onPress} style={styles.tabButton}>
      <Animated.View style={[styles.iconContainer, animatedStyle]}>
        {shutterIcon ? (
          <Animated.View style={[styles.shutterCircle, shutterStyle]} />
        ) : (
          <>
            <Animated.View style={[styles.iconWrapper, outlineIconStyle]}>
              <Animated.Text style={iconColorStyle}>
                <Ionicons name={icon} size={22} />
              </Animated.Text>
            </Animated.View>
            <Animated.View
              style={[
                styles.iconWrapper,
                styles.iconAbsolute,
                focusedIconStyle,
              ]}
            >
              <Animated.Text style={iconColorStyle}>
                <Ionicons name={iconFocused} size={22} />
              </Animated.Text>
            </Animated.View>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

interface TabIndicatorProps {
  scrollPosition: SharedValue<number>;
  tabCount: number;
}

function TabIndicator({ scrollPosition, tabCount }: TabIndicatorProps) {
  const tabWidth = SCREEN_WIDTH / tabCount;
  const indicatorWidth = 40;

  const animatedStyle = useAnimatedStyle(() => {
    const translateX =
      scrollPosition.value * tabWidth + (tabWidth - indicatorWidth) / 2;

    // White on Camera (1) and Feed (2), black on Album (0)
    const backgroundColor = interpolateColor(
      scrollPosition.value,
      [0, 0.5, 1, 2],
      ["#000000", "#ffffff", "#ffffff", "#ffffff"],
    );

    return {
      transform: [{ translateX }],
      backgroundColor,
    };
  });

  return (
    <Animated.View
      style={[styles.indicator, { width: indicatorWidth }, animatedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centerPage: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayPage: {
    ...StyleSheet.absoluteFillObject,
  },
  tabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
    zIndex: 10,
  },
  tabBarContent: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  iconContainer: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconAbsolute: {
    position: "absolute",
  },
  shutterCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  indicator: {
    position: "absolute",
    bottom: -8,
    left: 0,
    height: 3,
    borderRadius: 2,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topBarContent: {
    flexDirection: "row",
    alignItems: "center",
    height: TOP_BAR_HEIGHT,
    paddingHorizontal: 12,
  },
  topBarIconLeft: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarIconRight: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarSearchIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitleContainer: {
    flex: 1,
    height: TOP_BAR_HEIGHT,
    justifyContent: "center",
    marginLeft: 4,
  },
  topBarTitleAbsolute: {
    position: "absolute",
    left: 0,
  },
  topBarTitleText: {
    fontSize: 20,
    fontWeight: "600",
  },
});
