import React, { createContext, useContext, useMemo } from "react";
import {
  SharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";

export const TOP_BAR_HEIGHT = 44;

interface SwipeableTabsContextValue {
  scrollPosition: SharedValue<number>;
  currentPage: SharedValue<number>;
  pageIndex: number;
}

const SwipeableTabsContext = createContext<SwipeableTabsContextValue | null>(
  null
);

export function SwipeableTabsProvider({
  children,
  scrollPosition,
  currentPage,
  pageIndex,
}: {
  children: React.ReactNode;
  scrollPosition: SharedValue<number>;
  currentPage: SharedValue<number>;
  pageIndex: number;
}) {
  // Memoized: a fresh value object here cascaded a context change through
  // an entire tab's tree (bypassing every React.memo) whenever the pager
  // re-rendered — the members are stable shared values + a constant index
  const value = useMemo(
    () => ({ scrollPosition, currentPage, pageIndex }),
    [scrollPosition, currentPage, pageIndex],
  );
  return (
    <SwipeableTabsContext.Provider value={value}>
      {children}
    </SwipeableTabsContext.Provider>
  );
}

export function useSwipeableTabs() {
  const context = useContext(SwipeableTabsContext);
  if (!context) {
    throw new Error(
      "useSwipeableTabs must be used within a SwipeableTabsProvider"
    );
  }
  return context;
}

export function usePageVisibility() {
  const { scrollPosition, pageIndex } = useSwipeableTabs();
  return { scrollPosition, pageIndex };
}

/**
 * Returns an animated style that fades content based on page visibility.
 * When the page is active (scrollPosition === pageIndex), opacity is 1.
 * As you scroll away, opacity decreases to 0.
 */
export function usePageFadeStyle() {
  const { scrollPosition, pageIndex } = useSwipeableTabs();

  return useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - pageIndex);
    const opacity = interpolate(
      distance,
      [0, 1],
      [1, 0],
      Extrapolation.CLAMP
    );

    return { opacity };
  });
}

/**
 * Returns an animated style that fades and scales content based on page visibility.
 */
export function usePageFadeScaleStyle(scaleRange: [number, number] = [1, 0.9]) {
  const { scrollPosition, pageIndex } = useSwipeableTabs();

  return useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - pageIndex);
    const opacity = interpolate(
      distance,
      [0, 1],
      [1, 0],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      distance,
      [0, 1],
      scaleRange,
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });
}

/**
 * Returns an animated style that slides content up/down based on page visibility.
 */
export function usePageSlideStyle(translateY: number = 20) {
  const { scrollPosition, pageIndex } = useSwipeableTabs();

  return useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - pageIndex);
    const opacity = interpolate(
      distance,
      [0, 1],
      [1, 0],
      Extrapolation.CLAMP
    );
    const translate = interpolate(
      distance,
      [0, 1],
      [0, translateY],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ translateY: translate }],
    };
  });
}
