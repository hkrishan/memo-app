/**
 * Memo Create — collage editor.
 *
 * Preview is plain RN views (expo-image draws each slot cover-fit; cached
 * and cheap); export re-draws the same `slotRects` geometry into an
 * offscreen Skia surface at Instagram resolution. Controls: aspect ratio,
 * gap, corner radius, background. Tap a slot to fill or replace it.
 *
 * Auto-saves to the projects store on every change — leaving the editor
 * never loses work, and the Projects tab reopens it.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { notify } from "@/components/global";
import { uploadIndicator } from "@/components/global/uploadIndicator";
import { useMergedLibrary } from "@/features/photos/api/library.queries";
import { CANVAS_RATIOS, ratioById, slotRects, templateById } from "../templates";
import { exportCollage, PREVIEW_REFERENCE_WIDTH } from "../export";
import { LibraryPickerSheet } from "../components/LibraryPickerSheet";
import {
  newProjectId,
  useCreateProjectsStore,
  type CollageProject,
  type SlotPhoto,
} from "../store/createProjectsStore";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CANVAS_MARGIN = 16;
/** Canvas render width; gap/radius are authored against the export's
 *  PREVIEW_REFERENCE_WIDTH and scaled to this, so what you see is what
 *  exports regardless of device width. */
const CANVAS_WIDTH = SCREEN_WIDTH - CANVAS_MARGIN * 2;

const GAP_STEPS = [0, 2, 4, 6, 10, 16];
const RADIUS_STEPS = [0, 4, 8, 14, 22];
const BACKGROUNDS = ["#FFFFFF", "#000000", "#F2F2F7", "#FAF6EF", "#101828"];

const CollageEditorScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { templateId: templateParam, projectId } = useLocalSearchParams<{
    templateId?: string;
    projectId?: string;
  }>();

  const upsert = useCreateProjectsStore((state) => state.upsert);
  const savedProjects = useCreateProjectsStore((state) => state.projects);

  // ---- project state (loaded draft, or a fresh one from the template) ----
  const [project, setProject] = useState<CollageProject>(() => {
    if (projectId) {
      const existing = savedProjects.find(
        (p): p is CollageProject => p.id === projectId && p.type === "collage",
      );
      if (existing) return existing;
    }
    const template = templateById(templateParam ?? "quad");
    const now = new Date().toISOString();
    return {
      id: newProjectId(),
      type: "collage",
      templateId: template.id,
      ratioId: "square",
      slots: template.slots.map(() => null),
      gap: 4,
      cornerRadius: 8,
      background: "#FFFFFF",
      createdAt: now,
      updatedAt: now,
    };
  });

  // Signed slot URLs rot after ~72h; re-resolve against the live library
  // by photoId once on open, so old drafts heal instead of showing 403s
  const { photos: libraryPhotos } = useMergedLibrary();
  const healedRef = useRef(false);
  useEffect(() => {
    if (healedRef.current || libraryPhotos.length === 0) return;
    healedRef.current = true;
    setProject((current) => ({
      ...current,
      slots: current.slots.map((slot) => {
        if (!slot?.photoId) return slot;
        const fresh = libraryPhotos.find((p) => p.photoId === slot.photoId);
        return fresh ? { ...slot, uri: fresh.url } : slot;
      }),
    }));
  }, [libraryPhotos]);

  // Auto-save every change (the initial state too — a draft exists the
  // moment the editor opens, which is what the Projects tab promises)
  useEffect(() => {
    upsert({ ...project, updatedAt: new Date().toISOString() });
  }, [project, upsert]);

  const patch = useCallback((changes: Partial<CollageProject>) => {
    setProject((current) => ({ ...current, ...changes }));
  }, []);

  // ---- geometry ----
  const template = templateById(project.templateId);
  const ratio = ratioById(project.ratioId);
  const canvasHeight = Math.round((CANVAS_WIDTH * ratio.height) / ratio.width);
  const previewScale = CANVAS_WIDTH / PREVIEW_REFERENCE_WIDTH;
  const rects = useMemo(
    () =>
      slotRects(
        template,
        CANVAS_WIDTH,
        canvasHeight,
        project.gap * previewScale,
      ),
    [template, canvasHeight, project.gap, previewScale],
  );

  // ---- picking ----
  const [pickerTarget, setPickerTarget] = useState<
    { mode: "fill" } | { mode: "slot"; index: number } | null
  >(null);

  const emptyCount = project.slots.filter((slot) => slot == null).length;

  const handleSlotPress = useCallback((index: number) => {
    Haptics.selectionAsync();
    setPickerTarget({ mode: "slot", index });
  }, []);

  const handlePicked = useCallback(
    (picked: SlotPhoto[]) => {
      setPickerTarget(null);
      setProject((current) => {
        const slots = [...current.slots];
        if (pickerTarget?.mode === "slot") {
          slots[pickerTarget.index] = picked[0] ?? slots[pickerTarget.index];
        } else {
          // Fill: drop picks into empty slots in order
          let cursor = 0;
          for (let i = 0; i < slots.length && cursor < picked.length; i++) {
            if (slots[i] == null) slots[i] = picked[cursor++]!;
          }
        }
        return { ...current, slots };
      });
    },
    [pickerTarget],
  );

  // ---- ratio switching keeps photos; template is fixed per project ----
  const handleRatio = useCallback(
    (ratioId: string) => {
      Haptics.selectionAsync();
      patch({ ratioId });
    },
    [patch],
  );

  // ---- export ----
  const [exporting, setExporting] = useState(false);
  const filled = emptyCount === 0;
  const handleExport = useCallback(async () => {
    if (!filled || exporting) return;
    setExporting(true);
    const indicatorId = `collage-export-${Date.now()}`;
    uploadIndicator.begin(indicatorId, "Rendering collage…");
    try {
      await exportCollage(project);
      uploadIndicator.succeed(indicatorId, "Saved to Photos");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } catch (error) {
      if (__DEV__) console.error("Collage export failed:", error);
      uploadIndicator.fail(indicatorId, "Export failed");
      notify.error("Export failed", "Could not render the collage.");
    } finally {
      setExporting(false);
    }
  }, [filled, exporting, project]);

  return (
    <View style={styles.container}>
      {/* Nav */}
      <View style={[styles.nav, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.navButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color="#000" />
        </Pressable>
        <View style={styles.navCenter}>
          <Text style={styles.navTitle}>{template.name}</Text>
          <Text style={styles.navSubtitle}>Saves automatically</Text>
        </View>
        <Pressable
          onPress={handleExport}
          disabled={!filled || exporting}
          style={[styles.saveButton, (!filled || exporting) && styles.saveDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Save to Photos"
        >
          <Text style={styles.saveText}>{exporting ? "…" : "Save"}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Canvas */}
        <View
          style={[
            styles.canvas,
            {
              width: CANVAS_WIDTH,
              height: canvasHeight,
              backgroundColor: project.background,
            },
          ]}
        >
          {rects.map((rect, i) => {
            const slot = project.slots[i] ?? null;
            return (
              <Pressable
                key={i}
                onPress={() => handleSlotPress(i)}
                style={[
                  styles.slot,
                  {
                    left: rect.x,
                    top: rect.y,
                    width: rect.width,
                    height: rect.height,
                    borderRadius: project.cornerRadius * previewScale,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={slot ? "Replace photo" : "Add photo"}
              >
                {slot ? (
                  <Image
                    source={{ uri: slot.uri }}
                    style={styles.slotImage}
                    contentFit="cover"
                    transition={60}
                  />
                ) : (
                  <View style={styles.slotEmpty}>
                    <Ionicons name="add" size={26} color="#8E8E93" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Fill remaining slots in one go */}
        {emptyCount > 0 && (
          <Pressable
            onPress={() => setPickerTarget({ mode: "fill" })}
            style={({ pressed }) => [
              styles.fillButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add photos"
          >
            <Ionicons name="images" size={16} color="#000" />
            <Text style={styles.fillText}>
              Add {emptyCount} photo{emptyCount === 1 ? "" : "s"}
            </Text>
          </Pressable>
        )}

        {/* Ratio */}
        <Text style={styles.controlLabel}>Format</Text>
        <View style={styles.segmentRow}>
          {CANVAS_RATIOS.map((r) => {
            const active = r.id === project.ratioId;
            return (
              <Pressable
                key={r.id}
                onPress={() => handleRatio(r.id)}
                style={[styles.segment, active && styles.segmentActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[styles.segmentText, active && styles.segmentTextActive]}
                >
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Gap */}
        <Text style={styles.controlLabel}>Spacing</Text>
        <View style={styles.segmentRow}>
          {GAP_STEPS.map((gap) => {
            const active = gap === project.gap;
            return (
              <Pressable
                key={gap}
                onPress={() => patch({ gap })}
                style={[styles.segment, active && styles.segmentActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[styles.segmentText, active && styles.segmentTextActive]}
                >
                  {gap}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Corner radius */}
        <Text style={styles.controlLabel}>Corners</Text>
        <View style={styles.segmentRow}>
          {RADIUS_STEPS.map((radius) => {
            const active = radius === project.cornerRadius;
            return (
              <Pressable
                key={radius}
                onPress={() => patch({ cornerRadius: radius })}
                style={[styles.segment, active && styles.segmentActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[styles.segmentText, active && styles.segmentTextActive]}
                >
                  {radius}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Background */}
        <Text style={styles.controlLabel}>Background</Text>
        <View style={styles.segmentRow}>
          {BACKGROUNDS.map((color) => {
            const active = color === project.background;
            return (
              <Pressable
                key={color}
                onPress={() => patch({ background: color })}
                style={[
                  styles.swatch,
                  { backgroundColor: color },
                  active && styles.swatchActive,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Background ${color}`}
              />
            );
          })}
        </View>
      </ScrollView>

      <LibraryPickerSheet
        visible={pickerTarget != null}
        maxCount={pickerTarget?.mode === "slot" ? 1 : Math.max(emptyCount, 1)}
        onConfirm={handlePicked}
        onClose={() => setPickerTarget(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  navCenter: {
    flex: 1,
    alignItems: "center",
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  navSubtitle: {
    fontSize: 11,
    color: "#8E8E93",
  },
  saveButton: {
    minWidth: 64,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 14,
    marginRight: 6,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  saveDisabled: {
    backgroundColor: "#D1D1D6",
  },
  saveText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  body: {
    flex: 1,
  },
  canvas: {
    marginTop: 8,
    marginHorizontal: CANVAS_MARGIN,
    borderRadius: 12,
    overflow: "hidden",
    // Subtle edge so a white canvas reads against the white screen
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.12)",
  },
  slot: {
    position: "absolute",
    overflow: "hidden",
    backgroundColor: "rgba(0, 0, 0, 0.04)",
  },
  slotImage: {
    ...StyleSheet.absoluteFillObject,
  },
  slotEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#C7C7CC",
    borderRadius: 6,
    margin: 2,
  },
  fillButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    marginTop: 14,
    height: 38,
    paddingHorizontal: 18,
    borderRadius: 19,
    backgroundColor: "#F2F2F7",
  },
  fillText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  pressed: {
    opacity: 0.75,
  },
  controlLabel: {
    marginTop: 22,
    marginBottom: 8,
    marginHorizontal: CANVAS_MARGIN,
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: CANVAS_MARGIN,
  },
  segment: {
    minWidth: 52,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 14,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: "#000",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3C3C43",
    fontVariant: ["tabular-nums"],
  },
  segmentTextActive: {
    color: "#fff",
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.2)",
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: "#000",
  },
});

export default CollageEditorScreen;
