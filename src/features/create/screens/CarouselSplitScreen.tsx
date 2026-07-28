/**
 * Memo Create — seamless carousel splitter.
 *
 * One photo, cover-fit across N pages of the chosen ratio; the preview
 * strip shows exactly the slices that will export, divider lines marking
 * the page cuts. Export writes the pages to the camera roll numbered in
 * posting order.
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
import { CANVAS_RATIOS, ratioById } from "../templates";
import { exportCarousel } from "../export";
import { LibraryPickerSheet } from "../components/LibraryPickerSheet";
import {
  newProjectId,
  useCreateProjectsStore,
  type CarouselProject,
  type SlotPhoto,
} from "../store/createProjectsStore";

const SCREEN_WIDTH = Dimensions.get("window").width;
const STRIP_MARGIN = 16;
const STRIP_WIDTH = SCREEN_WIDTH - STRIP_MARGIN * 2;
const PAGE_OPTIONS = [2, 3, 4, 5];
/** Story ratio makes no sense for a horizontal split. */
const CAROUSEL_RATIOS = CANVAS_RATIOS.filter((ratio) => ratio.id !== "story");

const CarouselSplitScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();

  const upsert = useCreateProjectsStore((state) => state.upsert);
  const savedProjects = useCreateProjectsStore((state) => state.projects);

  const [project, setProject] = useState<CarouselProject>(() => {
    if (projectId) {
      const existing = savedProjects.find(
        (p): p is CarouselProject =>
          p.id === projectId && p.type === "carousel",
      );
      if (existing) return existing;
    }
    const now = new Date().toISOString();
    return {
      id: newProjectId(),
      type: "carousel",
      ratioId: "square",
      photo: null,
      pages: 3,
      createdAt: now,
      updatedAt: now,
    };
  });

  // Heal a stale signed URL by photoId (see the collage editor)
  const { photos: libraryPhotos } = useMergedLibrary();
  const healedRef = useRef(false);
  useEffect(() => {
    if (healedRef.current || libraryPhotos.length === 0) return;
    healedRef.current = true;
    setProject((current) => {
      if (!current.photo?.photoId) return current;
      const fresh = libraryPhotos.find(
        (p) => p.photoId === current.photo?.photoId,
      );
      return fresh
        ? { ...current, photo: { ...current.photo, uri: fresh.url } }
        : current;
    });
  }, [libraryPhotos]);

  // Auto-save, but only once a photo is chosen — an empty splitter isn't a
  // draft worth listing
  useEffect(() => {
    if (project.photo) {
      upsert({ ...project, updatedAt: new Date().toISOString() });
    }
  }, [project, upsert]);

  const ratio = ratioById(project.ratioId);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePicked = useCallback((picked: SlotPhoto[]) => {
    setPickerOpen(false);
    const photo = picked[0];
    if (photo) setProject((current) => ({ ...current, photo }));
  }, []);

  // Preview geometry: the strip is the full virtual canvas scaled to fit
  const pageWidth = STRIP_WIDTH / project.pages;
  const pageHeight = (pageWidth * ratio.height) / ratio.width;

  const dividers = useMemo(
    () =>
      Array.from({ length: project.pages - 1 }, (_, i) => (i + 1) * pageWidth),
    [project.pages, pageWidth],
  );

  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    if (!project.photo || exporting) return;
    setExporting(true);
    const indicatorId = `carousel-export-${Date.now()}`;
    uploadIndicator.begin(indicatorId, "Rendering pages…");
    try {
      await exportCarousel(project);
      uploadIndicator.succeed(indicatorId, `${project.pages} pages saved`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } catch (error) {
      if (__DEV__) console.error("Carousel export failed:", error);
      uploadIndicator.fail(indicatorId, "Export failed");
      notify.error("Export failed", "Could not render the carousel.");
    } finally {
      setExporting(false);
    }
  }, [project, exporting]);

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
          <Text style={styles.navTitle}>Seamless carousel</Text>
          <Text style={styles.navSubtitle}>
            {project.pages} pages · {ratio.label}
          </Text>
        </View>
        <Pressable
          onPress={handleExport}
          disabled={!project.photo || exporting}
          style={[
            styles.saveButton,
            (!project.photo || exporting) && styles.saveDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save pages to Photos"
        >
          <Text style={styles.saveText}>{exporting ? "…" : "Save"}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* The full strip: photo cover-fit across all pages, cut markers on top */}
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={[
            styles.strip,
            { width: STRIP_WIDTH, height: pageHeight },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            project.photo ? "Replace photo" : "Choose a photo"
          }
        >
          {project.photo ? (
            <>
              <Image
                source={{ uri: project.photo.uri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={80}
              />
              {dividers.map((x) => (
                <View key={x} style={[styles.divider, { left: x }]} />
              ))}
            </>
          ) : (
            <View style={styles.stripEmpty}>
              <Ionicons name="image-outline" size={34} color="#8E8E93" />
              <Text style={styles.stripEmptyText}>
                Choose a photo — wide shots work best
              </Text>
            </View>
          )}
        </Pressable>

        {/* How it swipes: the individual pages */}
        {project.photo != null && (
          <>
            <Text style={styles.controlLabel}>Pages as posted</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pagesRow}
            >
              {Array.from({ length: project.pages }, (_, page) => (
                <View
                  key={page}
                  style={[
                    styles.pageCard,
                    { width: 96, height: (96 * ratio.height) / ratio.width },
                  ]}
                >
                  {/* Same cover-fit strip, offset one page per card */}
                  <View style={StyleSheet.absoluteFill}>
                    <Image
                      source={{ uri: project.photo?.uri }}
                      style={{
                        position: "absolute",
                        left: -page * 96,
                        width: 96 * project.pages,
                        height: (96 * ratio.height) / ratio.width,
                      }}
                      contentFit="cover"
                      transition={0}
                    />
                  </View>
                  <View style={styles.pageBadge}>
                    <Text style={styles.pageBadgeText}>{page + 1}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* Pages */}
        <Text style={styles.controlLabel}>Pages</Text>
        <View style={styles.segmentRow}>
          {PAGE_OPTIONS.map((pages) => {
            const active = pages === project.pages;
            return (
              <Pressable
                key={pages}
                onPress={() => {
                  Haptics.selectionAsync();
                  setProject((current) => ({ ...current, pages }));
                }}
                style={[styles.segment, active && styles.segmentActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[styles.segmentText, active && styles.segmentTextActive]}
                >
                  {pages}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Ratio */}
        <Text style={styles.controlLabel}>Page format</Text>
        <View style={styles.segmentRow}>
          {CAROUSEL_RATIOS.map((r) => {
            const active = r.id === project.ratioId;
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  setProject((current) => ({ ...current, ratioId: r.id }));
                }}
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
      </ScrollView>

      <LibraryPickerSheet
        visible={pickerOpen}
        maxCount={1}
        onConfirm={handlePicked}
        onClose={() => setPickerOpen(false)}
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
  strip: {
    marginTop: 8,
    marginHorizontal: STRIP_MARGIN,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F2F2F7",
  },
  divider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
  },
  stripEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  stripEmptyText: {
    fontSize: 13,
    color: "#8E8E93",
    textAlign: "center",
  },
  controlLabel: {
    marginTop: 22,
    marginBottom: 8,
    marginHorizontal: STRIP_MARGIN,
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  pagesRow: {
    paddingHorizontal: STRIP_MARGIN,
    gap: 8,
  },
  pageCard: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F2F2F7",
  },
  pageBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  pageBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    fontVariant: ["tabular-nums"],
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: STRIP_MARGIN,
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
});

export default CarouselSplitScreen;
