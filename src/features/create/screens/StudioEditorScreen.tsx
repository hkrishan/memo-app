/**
 * Memo Create Studio — the freeform editor (SCRL-style).
 *
 * A continuous strip of 1..10 pages; photos are layers you drag, pinch and
 * rotate anywhere — across page boundaries too — then export page-by-page
 * to the camera roll as a seamless Instagram carousel.
 *
 * The open document lives in the ephemeral editorStore (selection + undo);
 * every change auto-saves to createProjectsStore, so leaving never loses
 * work — the same promise v1's editors make. Signed URLs heal by photoId
 * on open, v1's pattern.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";

import { deleteAsync } from "expo-file-system/legacy";
import { useQueryClient } from "@tanstack/react-query";

import { notify } from "@/components/global";
import { uploadIndicator } from "@/components/global/uploadIndicator";
import { useMergedLibrary } from "@/features/photos/api/library.queries";
import libraryApi, { libraryKeys } from "@/features/photos/api/library.api";
import photoApi from "@/features/album/api/photo.api";
import { photoKeys } from "@/features/album/api/photo.queries";
import {
  CanvasStage,
  type FlightMeasurer,
  type TextFlightInfo,
} from "../components/canvas/CanvasStage";
import { BackgroundPanel } from "../components/panels/BackgroundPanel";
import { LayerStylePanel } from "../components/panels/LayerStylePanel";
import { PagesPanel } from "../components/panels/PagesPanel";
import { SeamlessPreview } from "../components/SeamlessPreview";
import { TextEntryOverlay } from "../components/TextEntryOverlay";
import {
  LibraryPickerSheet,
  type PickedPhoto,
} from "../components/LibraryPickerSheet";
import { ExportSheet, type ExportChoices } from "../components/panels/ExportSheet";
import {
  MAX_PAGES,
  convertToStudio,
  healAlbumPhotos,
  healStudioProject,
  imageLayerForPhoto,
  newLayerId,
  newStudioProject,
  pageSizeFor,
  referencedAlbumIds,
  textLayerFromDraft,
  type Background,
  type StudioProject,
  type TextDraft,
  type TextLayer,
} from "../engine/document";
import { exportStudioProject } from "../engine/exportStudio";
import { lineHeightFor } from "../engine/fonts";
import {
  newProjectId,
  useCreateProjectsStore,
} from "../store/createProjectsStore";
import { useCreatedCoversStore } from "../store/createdCoversStore";
import {
  selectCanRedo,
  selectCanUndo,
  useEditorStore,
} from "../store/editorStore";

const SCREEN_WIDTH = Dimensions.get("window").width;
const STRIP_MARGIN = 16;
/** Doc-px cascade offset between photos added in one batch (~16pt). */
const CASCADE_OFFSET = 48;

type ToolPanel = "background" | "pages" | "layerStyle";

const StudioEditorScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { projectId, ratioId, pages, bg } = useLocalSearchParams<{
    projectId?: string;
    ratioId?: string;
    pages?: string;
    /** Page background seed (a Looks preset from the Create home). */
    bg?: string;
  }>();

  const upsert = useCreateProjectsStore((state) => state.upsert);

  // ---- open (or create) the document in the editor store ----
  const [initialProject] = useState<StudioProject>(() => {
    if (projectId) {
      const existing = useCreateProjectsStore
        .getState()
        .projects.find((p) => p.id === projectId);
      // v1 collage/carousel drafts (e.g. via the retired editor's redirect)
      // upgrade in place — visually lossless, same id
      if (existing) return convertToStudio(existing);
    }
    const count = Math.min(
      Math.max(Number.parseInt(pages ?? "3", 10) || 3, 1),
      MAX_PAGES,
    );
    const bgColor =
      typeof bg === "string" && /^#[0-9A-Fa-f]{6}$/.test(bg) ? bg : undefined;
    return newStudioProject(newProjectId(), ratioId ?? "portrait", count, bgColor);
  });

  const load = useEditorStore((state) => state.load);
  const reset = useEditorStore((state) => state.reset);
  useEffect(() => {
    load(initialProject);
    return () => reset();
  }, [initialProject, load, reset]);

  const project = useEditorStore((state) => state.project);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const croppingLayerId = useEditorStore((state) => state.croppingLayerId);
  const setCropping = useEditorStore((state) => state.setCropping);
  const select = useEditorStore((state) => state.select);
  const commit = useEditorStore((state) => state.commit);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);

  // Signed layer URLs rot after ~24h; re-resolve against the live library
  // by photoId once on open, so old drafts heal instead of showing 403s
  const { photos: libraryPhotos } = useMergedLibrary();
  const healedRef = useRef(false);
  useEffect(() => {
    if (healedRef.current || libraryPhotos.length === 0 || !project) return;
    healedRef.current = true;
    commit(
      (current) =>
        healStudioProject(
          current,
          libraryPhotos.map((p) => ({ photoId: p.photoId, url: p.url })),
        ),
      { undoable: false },
    );
  }, [libraryPhotos, project, commit]);

  // Auto-save every change (the initial state too — a draft exists the
  // moment the editor opens, which is what the Projects tab promises)
  useEffect(() => {
    if (project) upsert(project);
  }, [project, upsert]);

  // ---- canvas geometry: full-size page vs fit-all overview ----
  const [canvasArea, setCanvasArea] = useState({ width: 0, height: 0 });
  const [overview, setOverview] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  const page = project ? pageSizeFor(project.ratioId) : { width: 1, height: 1 };
  const availWidth = SCREEN_WIDTH - STRIP_MARGIN * 2;
  const availHeight = Math.max(canvasArea.height - 24, 0);
  const fullPageWidth = Math.min(
    availWidth,
    (availHeight * page.width) / page.height,
  );
  const fitPageWidth = project
    ? Math.max(
        48,
        Math.min(fullPageWidth, (availWidth - 76) / project.pageCount),
      )
    : fullPageWidth;
  const previewPageWidth = overview ? fitPageWidth : fullPageWidth;

  const toggleOverview = useCallback((value: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    setOverview(value);
  }, []);

  // ---- tools ----
  const [activePanel, setActivePanel] = useState<ToolPanel | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Open text entry: layerId to edit (with its measured flight start),
   *  or null layerId for a new layer. */
  const [textEntry, setTextEntry] = useState<{
    layerId: string | null;
    flight?: TextFlightInfo | null;
  } | null>(null);
  const flightMeasurerRef = useRef<FlightMeasurer | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const sheetRef = useRef<BottomSheet>(null);

  const editingTextLayer: TextLayer | null = useMemo(() => {
    if (!textEntry?.layerId || !project) return null;
    const layer = project.layers.find((l) => l.id === textEntry.layerId);
    return layer?.type === "text" ? layer : null;
  }, [textEntry, project]);

  const handleTextDone = useCallback(
    (draft: TextDraft) => {
      const entry = textEntry;
      setTextEntry(null);
      if (!entry) return;
      if (entry.layerId) {
        commit((current) => ({
          ...current,
          layers: current.layers.map((l) =>
            l.id === entry.layerId && l.type === "text"
              ? {
                  ...l,
                  ...draft,
                  // Line height follows the (possibly changed) family
                  lineHeightMultiplier: lineHeightFor(draft.fontFamily),
                  measuredHeight: undefined,
                }
              : l,
          ),
        }));
        return;
      }
      let newId: string | null = null;
      commit((current) => {
        const size = pageSizeFor(current.ratioId);
        const centerX =
          Math.min(currentPage, current.pageCount - 1) * size.width +
          size.width / 2;
        const layer = textLayerFromDraft(
          draft,
          current.ratioId,
          centerX,
          size.height / 2,
        );
        newId = layer.id;
        return { ...current, layers: [...current.layers, layer] };
      });
      if (newId) select(newId);
    },
    [textEntry, commit, select, currentPage],
  );

  const openTextEditor = useCallback(async (layerId: string) => {
    // Measure the layer's on-screen spot first so the text lifts from it
    const flight =
      (await flightMeasurerRef.current?.measureText(layerId)) ?? null;
    setTextEntry({ layerId, flight });
  }, []);

  const openPanel = useCallback((panel: ToolPanel) => {
    Haptics.selectionAsync().catch(() => {});
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);

  const handlePicked = useCallback(
    (picked: PickedPhoto[]) => {
      setPickerOpen(false);
      if (picked.length === 0) return;
      let lastId: string | null = null;
      commit((current) => {
        const size = pageSizeFor(current.ratioId);
        const centerX =
          Math.min(currentPage, current.pageCount - 1) * size.width +
          size.width / 2;
        const added = picked.map((photo, i) => {
          const layer = imageLayerForPhoto(
            {
              uri: photo.uri,
              photoId: photo.photoId,
              ...(photo.albumId && photo.albumPhotoId
                ? { albumId: photo.albumId, albumPhotoId: photo.albumPhotoId }
                : {}),
            },
            photo.width ?? 0,
            photo.height ?? 0,
            current.ratioId,
            centerX + i * CASCADE_OFFSET,
            size.height / 2 + i * CASCADE_OFFSET,
          );
          lastId = layer.id;
          return layer;
        });
        return { ...current, layers: [...current.layers, ...added] };
      });
      if (lastId) select(lastId);
    },
    [commit, select, currentPage],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedLayerId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    commit((current) => ({
      ...current,
      layers: current.layers.filter((layer) => layer.id !== selectedLayerId),
    }));
    select(null);
  }, [selectedLayerId, commit, select]);

  const duplicateSelected = useCallback(() => {
    if (!selectedLayerId) return;
    Haptics.selectionAsync().catch(() => {});
    let cloneId: string | null = null;
    commit((current) => {
      const index = current.layers.findIndex((l) => l.id === selectedLayerId);
      const source = current.layers[index];
      if (!source) return current;
      const clone = {
        ...source,
        id: newLayerId(),
        transform: {
          ...source.transform,
          x: source.transform.x + 36,
          y: source.transform.y + 36,
        },
      };
      cloneId = clone.id;
      const layers = [...current.layers];
      layers.splice(index + 1, 0, clone);
      return { ...current, layers };
    });
    if (cloneId) select(cloneId);
  }, [selectedLayerId, commit, select]);

  /** Z-order: array order is bottom→top, so +1 brings the layer forward. */
  const moveSelected = useCallback(
    (direction: 1 | -1) => {
      if (!selectedLayerId) return;
      Haptics.selectionAsync().catch(() => {});
      commit((current) => {
        const index = current.layers.findIndex(
          (l) => l.id === selectedLayerId,
        );
        const target = index + direction;
        if (index < 0 || target < 0 || target >= current.layers.length) {
          return current;
        }
        const layers = [...current.layers];
        const [layer] = layers.splice(index, 1);
        layers.splice(target, 0, layer!);
        return { ...current, layers };
      });
    },
    [selectedLayerId, commit],
  );

  const setBackground = useCallback(
    (background: Background) => {
      commit((current) => ({ ...current, background }));
    },
    [commit],
  );

  const updateSelectedImageStyle = useCallback(
    (patch: { cornerRadius?: number; opacity?: number }) => {
      if (!selectedLayerId) return;
      commit((current) => ({
        ...current,
        layers: current.layers.map((l) =>
          l.id === selectedLayerId && l.type === "image"
            ? { ...l, ...patch }
            : l,
        ),
      }));
    },
    [selectedLayerId, commit],
  );

  /** Swap two pages: layers whose CENTER sits on a page travel with it. */
  const swapPages = useCallback(
    (indexA: number, indexB: number) => {
      Haptics.selectionAsync().catch(() => {});
      commit((current) => {
        const size = pageSizeFor(current.ratioId);
        const pageOf = (x: number) =>
          Math.min(
            Math.max(Math.floor(x / size.width), 0),
            current.pageCount - 1,
          );
        return {
          ...current,
          layers: current.layers.map((l) => {
            const page = pageOf(l.transform.x);
            const shift =
              page === indexA
                ? (indexB - indexA) * size.width
                : page === indexB
                  ? (indexA - indexB) * size.width
                  : 0;
            return shift === 0
              ? l
              : {
                  ...l,
                  transform: { ...l.transform, x: l.transform.x + shift },
                };
          }),
        };
      });
    },
    [commit],
  );

  const addPage = useCallback(() => {
    commit((current) => ({
      ...current,
      pageCount: Math.min(current.pageCount + 1, MAX_PAGES),
    }));
  }, [commit]);

  const removeLastPage = useCallback(() => {
    commit((current) => ({
      ...current,
      pageCount: Math.max(current.pageCount - 1, 1),
    }));
  }, [commit]);

  // ---- album-picked layers heal like library ones, against their album ----
  const queryClient = useQueryClient();
  const albumHealedRef = useRef(false);
  useEffect(() => {
    if (albumHealedRef.current || !project) return;
    const albumIds = referencedAlbumIds(project);
    if (albumIds.length === 0) return;
    albumHealedRef.current = true;
    (async () => {
      const byAlbum: Record<string, { photoId: string; url: string }[]> = {};
      for (const id of albumIds) {
        try {
          const photos: { photoId: string; url: string }[] = [];
          let cursor: string | undefined;
          // Newest-first pages; referenced photos are rarely deep, cap the walk
          for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
            const result = await photoApi.getPhotos(id, 100, cursor);
            photos.push(
              ...result.photos.map((p) => ({ photoId: p.photoId, url: p.url })),
            );
            if (!result.nextCursor) break;
            cursor = result.nextCursor;
          }
          byAlbum[id] = photos;
        } catch {
          // Best effort — the stored URI keeps working until it rots
        }
      }
      useEditorStore
        .getState()
        .commit((current) => healAlbumPhotos(current, byAlbum), {
          undoable: false,
        });
    })();
  }, [project]);

  // ---- export ----
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const hasContent = (project?.layers.length ?? 0) > 0;

  const runExport = useCallback(
    async ({ saveToCameraRoll, albumId }: ExportChoices) => {
      const current = useEditorStore.getState().project;
      if (!current || exporting) return;
      setExporting(true);
      const indicatorId = `studio-export-${Date.now()}`;
      uploadIndicator.begin(indicatorId, "Rendering…");
      try {
        // The cover is the in-app record — it ALWAYS goes to Memo photos
        const { coverFileUri } = await exportStudioProject(current, {
          saveToCameraRoll,
          renderCover: true,
          onProgress: (label) => uploadIndicator.begin(indicatorId, label),
        });
        if (coverFileUri) {
          uploadIndicator.begin(indicatorId, "Saving to Memo…");
          const uploaded = await libraryApi.uploadLibraryPhoto({
            fileUri: coverFileUri,
            fileName: `memo-create-${Date.now()}.jpg`,
            mimeType: "image/jpeg",
            // Travels with the media object — album copies inherit it, so
            // every member's tiles can badge the creation
            metadata: { memoCreate: { pageCount: current.pageCount } },
          });
          queryClient.invalidateQueries({ queryKey: libraryKeys.all });
          const coverIds = [uploaded.photoId];
          if (albumId) {
            uploadIndicator.begin(indicatorId, "Adding to album…");
            const albumCopy = await libraryApi.addLibraryPhotoToAlbum(
              albumId,
              uploaded.photoId,
            );
            coverIds.push(albumCopy.photoId);
            queryClient.invalidateQueries({
              queryKey: photoKeys.byAlbum(albumId),
            });
            queryClient.invalidateQueries({ queryKey: ["albums"], exact: true });
          }
          // The image is clean; the tiles draw the "Memo Create" badge for
          // these ids (library photo + the album copy)
          useCreatedCoversStore.getState().register(coverIds, {
            pageCount: current.pageCount,
            createdAt: new Date().toISOString(),
          });
          await deleteAsync(coverFileUri, { idempotent: true }).catch(() => {});
        }
        setExportOpen(false);
        uploadIndicator.succeed(
          indicatorId,
          saveToCameraRoll ? "Saved to Memo & Photos" : "Saved to Memo",
        );
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      } catch (error) {
        if (__DEV__) console.error("Studio export failed:", error);
        uploadIndicator.fail(indicatorId, "Export failed");
        notify.error("Export failed", "Could not export the creation.");
      } finally {
        setExporting(false);
      }
    },
    [exporting, queryClient],
  );

  if (!project) return <View style={styles.container} />;

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
        <Pressable
          onPress={undo}
          disabled={!canUndo}
          style={styles.navButton}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Undo"
        >
          <Ionicons
            name="arrow-undo"
            size={20}
            color={canUndo ? "#000" : "#C7C7CC"}
          />
        </Pressable>
        <Pressable
          onPress={redo}
          disabled={!canRedo}
          style={styles.navButton}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Redo"
        >
          <Ionicons
            name="arrow-redo"
            size={20}
            color={canRedo ? "#000" : "#C7C7CC"}
          />
        </Pressable>
        <View style={styles.navCenter}>
          <Text style={styles.navTitle}>Studio</Text>
          <Text style={styles.navSubtitle}>
            Page {Math.min(currentPage + 1, project.pageCount)} of{" "}
            {project.pageCount} · Saves automatically
          </Text>
        </View>
        <Pressable
          onPress={() => setPreviewOpen(true)}
          style={styles.navButton}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Preview carousel"
        >
          <Ionicons name="eye-outline" size={21} color="#000" />
        </Pressable>
        <Pressable
          onPress={() => setExportOpen(true)}
          disabled={!hasContent || exporting}
          style={[
            styles.saveButton,
            (!hasContent || exporting) && styles.saveDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Export creation"
        >
          <Text style={styles.saveText}>{exporting ? "…" : "Save"}</Text>
        </Pressable>
      </View>

      {/* Canvas */}
      <View
        style={styles.canvasArea}
        onLayout={(event) => setCanvasArea(event.nativeEvent.layout)}
      >
        {canvasArea.height > 0 && (
          <CanvasStage
            previewPageWidth={previewPageWidth}
            onPageChange={setCurrentPage}
            onOverviewToggle={toggleOverview}
            onEditTextLayer={openTextEditor}
            editingTextLayerId={textEntry?.layerId ?? null}
            flightMeasurerRef={flightMeasurerRef}
          />
        )}

        {/* Fit / full zoom toggle */}
        <Pressable
          onPress={() => toggleOverview(!overview)}
          style={styles.fitButton}
          accessibilityRole="button"
          accessibilityLabel={overview ? "Zoom to page" : "See all pages"}
        >
          <Ionicons
            name={overview ? "expand" : "contract"}
            size={16}
            color="#000"
          />
        </Pressable>

        {/* Crop mode: the frame is pinned, gestures reframe the photo */}
        {croppingLayerId && (
          <View style={styles.quickBar}>
            <Text style={styles.cropHint}>Drag & pinch to reframe</Text>
            <Pressable
              onPress={() => setCropping(null)}
              style={styles.quickAction}
              accessibilityRole="button"
              accessibilityLabel="Finish cropping"
            >
              <Ionicons name="checkmark" size={16} color="#000" />
              <Text style={styles.quickActionText}>Done</Text>
            </Pressable>
          </View>
        )}

        {/* Selected-layer quick bar */}
        {!croppingLayerId && selectedLayerId && (
          <View style={styles.quickBar}>
            {project.layers.find((l) => l.id === selectedLayerId)?.type ===
              "text" && (
              <Pressable
                onPress={() => openTextEditor(selectedLayerId)}
                style={styles.quickAction}
                accessibilityRole="button"
                accessibilityLabel="Edit text"
              >
                <Ionicons name="pencil" size={16} color="#000" />
                <Text style={styles.quickActionText}>Edit</Text>
              </Pressable>
            )}
            {project.layers.find((l) => l.id === selectedLayerId)?.type ===
              "image" && (
              <>
                <Pressable
                  onPress={() => setCropping(selectedLayerId)}
                  style={styles.quickAction}
                  accessibilityRole="button"
                  accessibilityLabel="Crop photo"
                >
                  <Ionicons name="crop" size={16} color="#000" />
                </Pressable>
                <Pressable
                  onPress={() => openPanel("layerStyle")}
                  style={styles.quickAction}
                  accessibilityRole="button"
                  accessibilityLabel="Photo style"
                >
                  <Ionicons name="options-outline" size={16} color="#000" />
                </Pressable>
              </>
            )}
            <Pressable
              onPress={duplicateSelected}
              style={styles.quickAction}
              accessibilityRole="button"
              accessibilityLabel="Duplicate layer"
            >
              <Ionicons name="copy-outline" size={16} color="#000" />
            </Pressable>
            <Pressable
              onPress={() => moveSelected(1)}
              style={styles.quickAction}
              accessibilityRole="button"
              accessibilityLabel="Bring forward"
            >
              <Ionicons name="chevron-up" size={16} color="#000" />
            </Pressable>
            <Pressable
              onPress={() => moveSelected(-1)}
              style={styles.quickAction}
              accessibilityRole="button"
              accessibilityLabel="Send backward"
            >
              <Ionicons name="chevron-down" size={16} color="#000" />
            </Pressable>
            <Pressable
              onPress={deleteSelected}
              style={styles.quickAction}
              accessibilityRole="button"
              accessibilityLabel="Delete layer"
            >
              <Ionicons name="trash-outline" size={16} color="#000" />
            </Pressable>
          </View>
        )}
      </View>

      {/* Toolbar */}
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 6 }]}>
        {(
          [
            { key: "photo", label: "Photo", icon: "images" },
            { key: "text", label: "Text", icon: "text" },
            { key: "background", label: "Background", icon: "color-palette" },
            { key: "pages", label: "Pages", icon: "albums" },
          ] as const
        ).map(({ key, label, icon }) => {
          const active =
            key !== "photo" && key !== "text" && activePanel === key;
          return (
            <Pressable
              key={key}
              onPress={() =>
                key === "photo"
                  ? setPickerOpen(true)
                  : key === "text"
                    ? setTextEntry({ layerId: null })
                    : openPanel(key)
              }
              style={styles.tool}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
            >
              <Ionicons
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                name={(active ? icon : `${icon}-outline`) as any}
                size={22}
                color={active ? "#000" : "#3C3C43"}
              />
              <Text style={[styles.toolLabel, active && styles.toolLabelActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Tool panel — non-modal so the canvas stays live above it */}
      {activePanel != null && (
        <BottomSheet
          ref={sheetRef}
          snapPoints={[280]}
          enablePanDownToClose
          onClose={() => setActivePanel(null)}
          handleIndicatorStyle={styles.sheetGrabber}
          backgroundStyle={styles.sheetBackground}
        >
          <BottomSheetView style={{ paddingBottom: insets.bottom + 12 }}>
            {activePanel === "background" && (
              <BackgroundPanel
                background={project.background}
                onPick={setBackground}
              />
            )}
            {activePanel === "pages" && (
              <PagesPanel
                project={project}
                onAddPage={addPage}
                onRemoveLastPage={removeLastPage}
                onSwapPages={swapPages}
              />
            )}
            {activePanel === "layerStyle" &&
              (() => {
                const selected = project.layers.find(
                  (l) => l.id === selectedLayerId,
                );
                return selected?.type === "image" ? (
                  <LayerStylePanel
                    layer={selected}
                    onChange={updateSelectedImageStyle}
                  />
                ) : null;
              })()}
          </BottomSheetView>
        </BottomSheet>
      )}

      <LibraryPickerSheet
        visible={pickerOpen}
        maxCount={MAX_PAGES}
        allowCameraRoll
        allowAlbums
        onConfirm={handlePicked}
        onClose={() => setPickerOpen(false)}
      />

      <ExportSheet
        visible={exportOpen}
        project={project}
        exporting={exporting}
        onExport={runExport}
        onClose={() => setExportOpen(false)}
      />

      {textEntry != null && (
        <TextEntryOverlay
          initial={editingTextLayer}
          flight={textEntry.flight ?? null}
          onDone={handleTextDone}
          onCancel={() => setTextEntry(null)}
        />
      )}

      {previewOpen && (
        <SeamlessPreview project={project} onClose={() => setPreviewOpen(false)} />
      )}
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
    width: 36,
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
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#000",
  },
  navSubtitle: {
    fontSize: 11,
    color: "#8E8E93",
    fontVariant: ["tabular-nums"],
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
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  canvasArea: {
    flex: 1,
  },
  fitButton: {
    position: "absolute",
    right: 14,
    bottom: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  quickBar: {
    position: "absolute",
    bottom: 14,
    alignSelf: "center",
    flexDirection: "row",
    height: 34,
    borderRadius: 17,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  quickAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
  },
  quickActionText: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  cropHint: {
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#8E8E93",
    paddingLeft: 14,
  },
  toolbar: {
    flexDirection: "row",
    paddingTop: 8,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0, 0, 0, 0.12)",
    backgroundColor: "#fff",
  },
  tool: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
  },
  toolLabel: {
    fontSize: 10,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#3C3C43",
  },
  toolLabelActive: {
    color: "#000",
  },
  sheetGrabber: {
    backgroundColor: "#D1D1D6",
  },
  sheetBackground: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
});

export default StudioEditorScreen;
