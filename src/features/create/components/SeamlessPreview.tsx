/**
 * Memo Create Studio — seamless preview.
 *
 * An honest simulation of the posted Instagram carousel: the strip renders
 * exactly like the editor (same static layer renderers, same gradient
 * line) inside a viewport exactly one page wide with paging scroll — so
 * boundary-spanning layers land the way they will after export. No
 * re-rendering pipeline involved; the stage IS the seamless canvas.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pageSizeFor, type StudioProject } from "../engine/document";
import { useFontProvider } from "../engine/fonts";
import { gradientEndpoints } from "../engine/render";
import { StaticImageLayer, StaticTextLayer } from "./canvas/StaticLayers";

const SCREEN = Dimensions.get("window");

interface SeamlessPreviewProps {
  project: StudioProject;
  onClose: () => void;
}

export const SeamlessPreview = memo<SeamlessPreviewProps>(
  ({ project, onClose }) => {
    const insets = useSafeAreaInsets();
    const provider = useFontProvider();
    const [activePage, setActivePage] = useState(0);

    const page = pageSizeFor(project.ratioId);
    // One page fills the width when it fits; tall ratios letterbox
    const chromeHeight = insets.top + insets.bottom + 150;
    const pageWidth = Math.min(
      SCREEN.width,
      ((SCREEN.height - chromeHeight) * page.width) / page.height,
    );
    const ps = pageWidth / page.width;
    const stripWidth = pageWidth * project.pageCount;
    const stripHeight = page.height * ps;

    const gradient =
      project.background.type === "gradient" ? project.background : null;
    const gradientLine = useMemo(
      () =>
        gradient
          ? gradientEndpoints(
              gradient.angle,
              page.width * project.pageCount,
              page.height,
            )
          : null,
      [gradient, page.width, page.height, project.pageCount],
    );

    const handleScroll = useCallback(
      (event: { nativeEvent: { contentOffset: { x: number } } }) => {
        const raw = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
        setActivePage(Math.min(Math.max(raw, 0), project.pageCount - 1));
      },
      [pageWidth, project.pageCount],
    );

    return (
      <View style={styles.container}>
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <Text style={styles.caption}>
            {page.width} × {page.height} · {project.pageCount} page
            {project.pageCount === 1 ? "" : "s"}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.center} pointerEvents="box-none">
          {/* Viewport exactly one page wide → pagingEnabled steps a page */}
          <View style={{ width: pageWidth, height: stripHeight }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={32}
              decelerationRate="fast"
            >
              <View
                style={{
                  width: stripWidth,
                  height: stripHeight,
                  backgroundColor:
                    project.background.type === "solid"
                      ? project.background.color
                      : "#fff",
                }}
              >
                {gradient && gradientLine && (
                  <LinearGradient
                    pointerEvents="none"
                    colors={[gradient.from, gradient.to]}
                    start={{
                      x: gradientLine.sx / (page.width * project.pageCount),
                      y: gradientLine.sy / page.height,
                    }}
                    end={{
                      x: gradientLine.ex / (page.width * project.pageCount),
                      y: gradientLine.ey / page.height,
                    }}
                    style={StyleSheet.absoluteFillObject}
                  />
                )}
                {project.layers.map((layer) =>
                  layer.type === "image" ? (
                    <StaticImageLayer key={layer.id} layer={layer} ps={ps} />
                  ) : (
                    <StaticTextLayer
                      key={layer.id}
                      layer={layer}
                      ps={ps}
                      provider={provider}
                    />
                  ),
                )}
              </View>
            </ScrollView>
          </View>

          {/* IG-style dots */}
          {project.pageCount > 1 && (
            <View style={styles.dots}>
              {Array.from({ length: project.pageCount }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === activePage && styles.dotActive]}
                />
              ))}
            </View>
          )}
        </View>

        <View style={{ height: insets.bottom + 24 }} />
      </View>
    );
  },
);
SeamlessPreview.displayName = "SeamlessPreview";

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  caption: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.7)",
    fontVariant: ["tabular-nums"],
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    marginTop: 18,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  dotActive: {
    backgroundColor: "#fff",
  },
});
