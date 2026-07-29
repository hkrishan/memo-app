/**
 * Memo Create Studio — snap guide lines.
 *
 * Two hairlines (one vertical, one horizontal) that appear while a drag is
 * locked onto a snap line. Positions come straight from the stage's shared
 * values, so they track the gesture on the UI thread.
 */

import React, { memo } from "react";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { useStageContext } from "./layerTransformContext";

export const SnapGuides = memo(() => {
  const { guideX, guideY } = useStageContext();

  const verticalStyle = useAnimatedStyle(() => ({
    opacity: guideX.value >= 0 ? 1 : 0,
    transform: [{ translateX: guideX.value }],
  }));
  const horizontalStyle = useAnimatedStyle(() => ({
    opacity: guideY.value >= 0 ? 1 : 0,
    transform: [{ translateY: guideY.value }],
  }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.vertical, verticalStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.horizontal, horizontalStyle]}
      />
    </>
  );
});
SnapGuides.displayName = "SnapGuides";

const styles = StyleSheet.create({
  vertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: -0.5,
    width: 1,
    backgroundColor: "#000",
    shadowColor: "#fff",
    shadowOpacity: 0.8,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 0 },
  },
  horizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -0.5,
    height: 1,
    backgroundColor: "#000",
    shadowColor: "#fff",
    shadowOpacity: 0.8,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 0 },
  },
});
