/**
 * Memo Create Studio — the stage.
 *
 * One continuous horizontal strip of pages (the SCRL idea) inside a
 * gesture-handler ScrollView. Layers sit on the strip in preview px and
 * can span page boundaries; dashed dividers and page badges are
 * editor-only chrome drawn above them. Panning empty canvas scrolls the
 * strip — panning a layer moves the layer (the layer's gesture blocks the
 * scroll). Pinching empty canvas toggles the fit/overview zoom.
 */

import React, { memo, useCallback, useMemo, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { MAX_PAGES, pageSizeFor } from "../../engine/document";
import { previewScaleFor, rotatedAabb } from "../../engine/geometry";
import { estimatedTextHeight, textLayerBox } from "../../engine/paragraph";
import { gradientEndpoints } from "../../engine/render";
import { buildSnapLines, buildSnapLinesForLayer } from "../../engine/snapping";
import { useEditorStore } from "../../store/editorStore";
import { ImageLayerView } from "./ImageLayerView";
import { SelectionFrame } from "./SelectionFrame";
import { SnapGuides } from "./SnapGuides";
import { TextLayerView } from "./TextLayerView";
import {
  StageContext,
  type LayerSharedValues,
  type StageContextValue,
} from "./layerTransformContext";

const STRIP_MARGIN = 16;
const DASH = 6;

/** A text layer's live on-screen placement — the edit flight's start/end. */
export interface TextFlightInfo {
  /** Layer center in WINDOW px. */
  centerX: number;
  centerY: number;
  scale: number;
  rotation: number;
  /** preview px per doc px on the canvas. */
  ps: number;
}

export interface FlightMeasurer {
  measureText: (layerId: string) => Promise<TextFlightInfo | null>;
}

interface CanvasStageProps {
  previewPageWidth: number;
  onPageChange: (page: number) => void;
  /** Pinch-out on empty canvas / pinch-in requests zoom toggle. */
  onOverviewToggle: (overview: boolean) => void;
  /** Double-tap on a text layer re-opens the entry overlay. */
  onEditTextLayer: (layerId: string) => void;
  /** Text layer currently open in the entry overlay — hidden on canvas so
   *  the overlay reads as the text itself lifted into editing, not a copy. */
  editingTextLayerId: string | null;
  /** Populated with a measurer the screen uses to start the edit flight. */
  flightMeasurerRef?: React.MutableRefObject<FlightMeasurer | null>;
}

export const CanvasStage = memo<CanvasStageProps>(
  ({
    previewPageWidth,
    onPageChange,
    onOverviewToggle,
    onEditTextLayer,
    editingTextLayerId,
    flightMeasurerRef,
  }) => {
    const project = useEditorStore((state) => state.project);
    const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
    const croppingLayerId = useEditorStore((state) => state.croppingLayerId);
    const select = useEditorStore((state) => state.select);
    const commit = useEditorStore((state) => state.commit);

    const registry = useRef(new Map<string, LayerSharedValues>());
    const guideX = useSharedValue(-1);
    const guideY = useSharedValue(-1);
    const scrollRef = useRef<ScrollView>(null);
    const stripRef = useRef<View>(null);

    const stageValue = useMemo<StageContextValue>(
      () => ({ registry, guideX, guideY, scrollRef }),
      [guideX, guideY],
    );

    const page = project ? pageSizeFor(project.ratioId) : { width: 1, height: 1 };
    const ps = previewScaleFor(previewPageWidth, page.width);

    // The screen asks for a layer's window placement to start the edit
    // flight; the strip's measured origin already includes scroll offset
    React.useEffect(() => {
      if (!flightMeasurerRef) return;
      flightMeasurerRef.current = {
        measureText: (layerId) =>
          new Promise((resolve) => {
            const svs = registry.current.get(layerId);
            const strip = stripRef.current;
            if (!svs || !strip) {
              resolve(null);
              return;
            }
            strip.measureInWindow((stripX, stripY) => {
              resolve({
                centerX: stripX + svs.cx.value,
                centerY: stripY + svs.cy.value,
                scale: svs.sc.value,
                rotation: svs.rot.value,
                ps,
              });
            });
          }),
      };
      return () => {
        flightMeasurerRef.current = null;
      };
    }, [flightMeasurerRef, ps]);

    const stripWidth = project ? previewPageWidth * project.pageCount : 0;
    const stripHeight = page.height * ps;

    const snapLines = useMemo(
      () =>
        project
          ? buildSnapLines(project.pageCount, page.width, page.height)
          : { xs: [], ys: [] },
      [project?.pageCount, page.width, page.height],
    );

    // Every layer's doc-px box, for layer-to-layer alignment guides.
    // Rebuilt on commits only — the drag itself reads a frozen copy.
    const layerBoxes = useMemo(
      () =>
        (project?.layers ?? []).map((layer) => {
          const dims =
            layer.type === "image"
              ? { w: layer.baseWidth, h: layer.baseHeight }
              : (() => {
                  const box = textLayerBox(layer, estimatedTextHeight(layer));
                  return { w: box.width, h: box.height };
                })();
          return {
            id: layer.id,
            box: rotatedAabb(
              layer.transform.x,
              layer.transform.y,
              dims.w * layer.transform.scale,
              dims.h * layer.transform.scale,
              layer.transform.rotation,
            ),
          };
        }),
      [project?.layers],
    );

    const snapLinesFor = useCallback(
      (layerId: string) =>
        buildSnapLinesForLayer(
          snapLines,
          layerBoxes.filter((b) => b.id !== layerId).map((b) => b.box),
        ),
      [snapLines, layerBoxes],
    );

    const handleScroll = useCallback(
      (event: { nativeEvent: { contentOffset: { x: number } } }) => {
        if (!project) return;
        const raw = Math.round(
          event.nativeEvent.contentOffset.x / previewPageWidth,
        );
        onPageChange(Math.min(Math.max(raw, 0), project.pageCount - 1));
      },
      [project?.pageCount, previewPageWidth, onPageChange],
    );

    const deselect = useCallback(() => select(null), [select]);

    const addPage = useCallback(() => {
      Haptics.selectionAsync().catch(() => {});
      commit((current) => ({
        ...current,
        pageCount: Math.min(current.pageCount + 1, MAX_PAGES),
      }));
    }, [commit]);

    // Pinch on empty canvas: zoom intent, resolved on release (the toggle
    // re-lays-out the strip, so live scaling isn't worth the complexity)
    const overviewPinch = useMemo(
      () =>
        Gesture.Pinch().onEnd((event) => {
          if (event.scale < 0.9) runOnJS(onOverviewToggle)(true);
          else if (event.scale > 1.1) runOnJS(onOverviewToggle)(false);
        }),
      [onOverviewToggle],
    );

    const dashes = useMemo(
      () => Array.from({ length: Math.ceil(stripHeight / (DASH * 2)) }),
      [stripHeight],
    );

    if (!project) return null;

    const background =
      project.background.type === "solid" ? project.background.color : "#fff";
    // Same endpoint math as the Skia exporter, normalized to unit coords —
    // preview and exported gradient share the identical line
    const gradient =
      project.background.type === "gradient" ? project.background : null;
    const gradientLine = gradient
      ? gradientEndpoints(
          gradient.angle,
          page.width * project.pageCount,
          page.height,
        )
      : null;

    return (
      <StageContext.Provider value={stageValue}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={64}
          contentContainerStyle={styles.scrollContent}
        >
          <View
            ref={stripRef}
            style={[
              styles.strip,
              {
                width: stripWidth,
                height: stripHeight,
                backgroundColor: background,
              },
            ]}
          >
            {/* Empty-canvas surface: tap deselects, pinch toggles overview */}
            <GestureDetector gesture={overviewPinch}>
              <Pressable
                style={StyleSheet.absoluteFillObject}
                onPress={deselect}
                accessibilityLabel="Canvas"
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
              </Pressable>
            </GestureDetector>

            {project.layers.map((layer) =>
              layer.type === "image" ? (
                <ImageLayerView
                  key={layer.id}
                  layer={layer}
                  ps={ps}
                  snapLines={snapLinesFor(layer.id)}
                  isCropping={croppingLayerId === layer.id}
                />
              ) : (
                <TextLayerView
                  key={layer.id}
                  layer={layer}
                  ps={ps}
                  snapLines={snapLinesFor(layer.id)}
                  onEdit={onEditTextLayer}
                  hidden={editingTextLayerId === layer.id}
                />
              ),
            )}

            {/* Page dividers + badges — editor chrome, never exported */}
            <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
              {Array.from({ length: project.pageCount - 1 }).map((_, i) => (
                <View
                  key={`divider-${i}`}
                  style={[
                    styles.divider,
                    { left: (i + 1) * previewPageWidth - 0.5 },
                  ]}
                >
                  {dashes.map((_, d) => (
                    <View key={d} style={styles.dash} />
                  ))}
                </View>
              ))}
              {Array.from({ length: project.pageCount }).map((_, i) => (
                <View
                  key={`badge-${i}`}
                  style={[
                    styles.pageBadge,
                    { left: i * previewPageWidth + 8 },
                  ]}
                >
                  <Text style={styles.pageBadgeText}>{i + 1}</Text>
                </View>
              ))}
              <SnapGuides />
            </View>

            {(() => {
              // Crop mode pins the frame — its transform chrome would lie
              const selected = croppingLayerId
                ? null
                : project.layers.find(
                    (layer) => layer.id === selectedLayerId,
                  );
              return selected ? (
                <SelectionFrame layer={selected} ps={ps} />
              ) : null;
            })()}
          </View>

          {project.pageCount < MAX_PAGES && (
            <Pressable
              onPress={addPage}
              style={({ pressed }) => [
                styles.ghostPage,
                { height: stripHeight },
                pressed && styles.ghostPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add page"
            >
              <Ionicons name="add" size={26} color="#8E8E93" />
            </Pressable>
          )}
        </ScrollView>
      </StageContext.Provider>
    );
  },
);
CanvasStage.displayName = "CanvasStage";

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: STRIP_MARGIN,
  },
  strip: {
    borderRadius: 2,
    // Subtle edge so a white canvas reads against the white screen
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.12)",
    overflow: "hidden",
  },
  divider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
  },
  dash: {
    width: 1,
    height: DASH,
    marginBottom: DASH,
    backgroundColor: "rgba(142, 142, 147, 0.55)",
  },
  pageBadge: {
    position: "absolute",
    top: 8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "rgba(0, 0, 0, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  pageBadgeText: {
    fontSize: 10,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "rgba(60, 60, 67, 0.7)",
    fontVariant: ["tabular-nums"],
  },
  ghostPage: {
    width: 64,
    marginLeft: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#C7C7CC",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostPressed: {
    opacity: 0.6,
  },
});
