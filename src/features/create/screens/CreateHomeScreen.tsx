/**
 * Memo Create — the hub.
 *
 * One editorial scroll, no tabs:
 *   Blank canvas  — striped hero into the freeform Studio (ratio + pages sheet)
 *   What are you making — intent tiles (collage, carousel, story, edit photo…)
 *   Layouts       — horizontal rail of collage templates, "All N" opens the full set
 *   Looks         — monochrome background presets that seed a blank canvas
 *   In progress   — latest drafts; the folder icon / "Projects" opens them all
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { color, font, radius, screenH, scriptType } from "@/lib/tokens";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";

import Sheet from "@/components/ui/Sheet";
import {
  CANVAS_RATIOS,
  COLLAGE_TEMPLATES,
  ratioById,
  templateById,
} from "../templates";
import { TemplatePreview } from "../components/TemplatePreview";
import {
  LibraryPickerSheet,
  type PickedPhoto,
} from "../components/LibraryPickerSheet";
import { MAX_PAGES, convertToStudio, projectFromTemplate } from "../engine/document";
import {
  newProjectId,
  useCreateProjectsStore,
  type CreateProject,
} from "../store/createProjectsStore";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_GAP = 10;
const MAKE_COLUMNS = 3;
const MAKE_TILE = Math.floor(
  (SCREEN_WIDTH - screenH * 2 - GRID_GAP * (MAKE_COLUMNS - 1)) / MAKE_COLUMNS,
);

// The layouts rail shows the first few; the sheet has them all
const RAIL_TEMPLATE_COUNT = 6;
const RAIL_PREVIEW_W = 88;
const RAIL_PREVIEW_H = 110;

/** Looks — monochrome page-background presets for a blank canvas. */
const LOOKS: { id: string; label: string; colorValue: string }[] = [
  { id: "mono", label: "Mono", colorValue: "#1C1C1E" },
  { id: "fade", label: "Fade", colorValue: "#9A9AA0" },
  { id: "grain", label: "Grain", colorValue: "#6E6E73" },
  { id: "matte", label: "Matte", colorValue: "#48484A" },
  { id: "paper", label: "Paper", colorValue: "#F2F2F0" },
];

/** Compact "2h ago" stamp for draft rows. */
const agoLabel = (iso: string): string => {
  const mins = Math.max(dayjs().diff(dayjs(iso), "minute"), 0);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return dayjs(iso).format("D MMM");
};

type PickerTarget =
  | { kind: "template"; templateId: string }
  | { kind: "editPhoto" };

const MAKE_TILES: {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  soon?: boolean;
}[] = [
  { id: "collage", label: "Collage", icon: "grid-outline" },
  { id: "carousel", label: "Carousel", icon: "albums-outline" },
  { id: "story", label: "Story", icon: "reader-outline" },
  { id: "editPhoto", label: "Edit photo", icon: "image-outline" },
  { id: "photoBook", label: "Photo book", icon: "book-outline", soon: true },
  { id: "print", label: "Print", icon: "print-outline", soon: true },
];

// Diagonal hatch on the hero — enough rotated bars to cover any phone width
const HERO_STRIPES = Array.from(
  { length: Math.ceil(SCREEN_WIDTH / 52) + 4 },
  (_, i) => i,
);

const CreateHomeScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const projects = useCreateProjectsStore((state) => state.projects);
  const removeProject = useCreateProjectsStore((state) => state.remove);
  const upsertProject = useCreateProjectsStore((state) => state.upsert);

  const handleBack = useCallback(() => router.back(), [router]);

  const [lookId, setLookId] = useState("mono");
  const lookColor = LOOKS.find((look) => look.id === lookId)!.colorValue;

  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);

  // Photo picker — templates cap at the layout's slot count, edit-photo at 1
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  const openTemplate = useCallback((templateId: string) => {
    setLayoutsOpen(false);
    setPickerTarget({ kind: "template", templateId });
  }, []);

  const handlePickedPhotos = useCallback(
    (photos: PickedPhoto[]) => {
      const target = pickerTarget;
      setPickerTarget(null);
      if (!target || photos.length === 0) return;
      const templateId =
        target.kind === "template" ? target.templateId : "solo";
      const ratioId = target.kind === "template" ? "square" : "portrait";
      const project = projectFromTemplate(
        newProjectId(),
        templateId,
        ratioId,
        photos,
      );
      upsertProject(project);
      router.push({
        pathname: "/create/studio",
        params: { projectId: project.id },
      });
    },
    [pickerTarget, upsertProject, router],
  );

  const openMakeTile = useCallback(
    (id: string) => {
      switch (id) {
        case "collage":
          setLayoutsOpen(true);
          break;
        case "carousel":
          router.push("/create/carousel");
          break;
        case "story":
          router.push({
            pathname: "/create/studio",
            params: { ratioId: "story", pages: "1", bg: lookColor },
          });
          break;
        case "editPhoto":
          setPickerTarget({ kind: "editPhoto" });
          break;
      }
    },
    [router, lookColor],
  );

  // ---- Blank canvas: ratio + page count, then into the Studio ----
  const [scratchOpen, setScratchOpen] = useState(false);
  const [scratchRatioId, setScratchRatioId] = useState("portrait");
  const [scratchPages, setScratchPages] = useState(3);

  const startStudio = useCallback(() => {
    setScratchOpen(false);
    router.push({
      pathname: "/create/studio",
      params: {
        ratioId: scratchRatioId,
        pages: String(scratchPages),
        bg: lookColor,
      },
    });
  }, [router, scratchRatioId, scratchPages, lookColor]);

  const openProject = useCallback(
    (project: CreateProject) => {
      setProjectsOpen(false);
      if (project.type === "carousel") {
        router.push({
          pathname: "/create/carousel",
          params: { projectId: project.id },
        });
        return;
      }
      // Collage drafts upgrade to studio in place (same id, lossless)
      if (project.type === "collage") {
        upsertProject(convertToStudio(project));
      }
      router.push({
        pathname: "/create/studio",
        params: { projectId: project.id },
      });
    },
    [router, upsertProject],
  );

  const confirmDelete = useCallback(
    (project: CreateProject) => {
      Alert.alert("Delete project", "This draft can't be recovered.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => removeProject(project.id),
        },
      ]);
    },
    [removeProject],
  );

  const projectRows = useMemo(
    () =>
      projects.map((project) => {
        const stamp = `edited ${agoLabel(project.updatedAt)}`;
        if (project.type === "studio") {
          return {
            project,
            title: `Studio · ${ratioById(project.ratioId).label}`,
            subtitle: `${project.pageCount} page${project.pageCount === 1 ? "" : "s"} · ${stamp}`,
          };
        }
        if (project.type === "carousel") {
          return {
            project,
            title: "Carousel",
            subtitle: `${project.pages} pages · ${stamp}`,
          };
        }
        return {
          project,
          title: `Collage · ${ratioById(project.ratioId).label}`,
          subtitle: `${project.slots.length} photos · ${stamp}`,
        };
      }),
    [projects],
  );

  const recentRows = projectRows.slice(0, 3);

  const renderProjectThumb = (project: CreateProject, size: number) =>
    project.type === "collage" ? (
      <TemplatePreview
        templateId={project.templateId}
        width={size}
        height={size}
        slots={project.slots}
        gap={2}
        background={project.background}
      />
    ) : (
      <View style={[styles.projectThumbDark, { width: size, height: size }]}>
        <Ionicons
          name={project.type === "studio" ? "color-wand-outline" : "albums-outline"}
          size={20}
          color={color.onDarkSecondary}
        />
      </View>
    );

  const renderProjectRow = (
    { project, title, subtitle }: (typeof projectRows)[number],
    options: { deletable: boolean },
  ) => (
    <Pressable
      key={project.id}
      onPress={() => openProject(project)}
      style={({ pressed }) => [styles.projectRow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {renderProjectThumb(project, 52)}
      <View style={styles.projectTextWrap}>
        <Text style={styles.projectTitle}>{title}</Text>
        <Text style={styles.projectSubtitle}>{subtitle}</Text>
      </View>
      {options.deletable ? (
        <Pressable
          onPress={() => confirmDelete(project)}
          hitSlop={10}
          style={styles.projectDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete project"
        >
          <Ionicons name="trash-outline" size={18} color={color.textTertiary} />
        </Pressable>
      ) : (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={color.textTertiary}
        />
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {/* Nav bar */}
      <View style={[styles.nav, { paddingTop: insets.top }]}>
        <Pressable
          onPress={handleBack}
          style={styles.navButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color={color.textPrimary} />
        </Pressable>
        <View style={styles.navCenter}>
          {/* Wordmark: "Memo" in the app face, "Create" in script */}
          <Text style={styles.navTitle}>
            Memo <Text style={styles.navTitleScript}>Create</Text>
          </Text>
        </View>
        <Pressable
          onPress={() => setProjectsOpen(true)}
          style={styles.navButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Projects"
        >
          <Ionicons name="folder-outline" size={22} color={color.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Blank canvas — the striped hero into the Studio */}
        <Pressable
          onPress={() => setScratchOpen(true)}
          style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Blank canvas — start from scratch in Studio"
        >
          {HERO_STRIPES.map((i) => (
            <View key={i} style={[styles.heroStripe, { left: i * 52 - 60 }]} />
          ))}
          <View style={styles.heroIcon}>
            <Ionicons name="sparkles" size={22} color={color.bgDark} />
          </View>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>Blank canvas</Text>
            <Text style={styles.heroText}>
              Freeform pages — drag photos anywhere, add text, layer and mask
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={color.onDarkSecondary}
          />
        </Pressable>

        {/* What are you making */}
        <Text style={styles.sectionLabel}>What are you making</Text>
        <View style={styles.makeGrid}>
          {MAKE_TILES.map((tile) => (
            <Pressable
              key={tile.id}
              onPress={() => openMakeTile(tile.id)}
              disabled={tile.soon}
              style={({ pressed }) => [
                styles.makeTile,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                tile.soon ? `${tile.label} — coming soon` : tile.label
              }
            >
              {tile.soon && (
                <View style={styles.soonPill}>
                  <Text style={styles.soonPillText}>Soon</Text>
                </View>
              )}
              <Ionicons
                name={tile.icon}
                size={22}
                color={tile.soon ? color.textTertiary : color.textPrimary}
              />
              <Text
                style={[
                  styles.makeTileLabel,
                  tile.soon && styles.makeTileLabelSoon,
                ]}
              >
                {tile.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Layouts */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabelInline}>Layouts</Text>
          <Pressable
            onPress={() => setLayoutsOpen(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="All layouts"
          >
            <Text style={styles.sectionLink}>
              All {COLLAGE_TEMPLATES.length}
            </Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.railWrap}
          contentContainerStyle={styles.rail}
        >
          {COLLAGE_TEMPLATES.slice(0, RAIL_TEMPLATE_COUNT).map((template) => (
            <Pressable
              key={template.id}
              onPress={() => openTemplate(template.id)}
              style={({ pressed }) => [
                styles.layoutCell,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${template.name} layout`}
            >
              <View style={styles.layoutCard}>
                <TemplatePreview
                  templateId={template.id}
                  width={RAIL_PREVIEW_W}
                  height={RAIL_PREVIEW_H}
                  background={color.bg}
                />
              </View>
              <Text style={styles.layoutName}>{template.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Looks — background presets for a blank canvas */}
        <Text style={styles.sectionLabel}>Looks</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.railWrap}
          contentContainerStyle={styles.rail}
        >
          {LOOKS.map((look) => {
            const active = look.id === lookId;
            return (
              <Pressable
                key={look.id}
                onPress={() => setLookId(look.id)}
                style={({ pressed }) => [
                  styles.lookCell,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${look.label} look`}
              >
                <View
                  style={[styles.lookFrame, active && styles.lookFrameActive]}
                >
                  <View
                    style={[
                      styles.lookSwatch,
                      { backgroundColor: look.colorValue },
                      look.id === "paper" && styles.lookSwatchHairline,
                    ]}
                  />
                </View>
                <Text
                  style={[styles.lookName, active && styles.lookNameActive]}
                >
                  {look.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* In progress */}
        {recentRows.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabelInline}>In progress</Text>
              <Pressable
                onPress={() => setProjectsOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="All projects"
              >
                <Text style={styles.sectionLink}>Projects</Text>
              </Pressable>
            </View>
            <View style={styles.projectList}>
              {recentRows.map((row, index) => (
                <React.Fragment key={row.project.id}>
                  {index > 0 && <View style={styles.hairline} />}
                  {renderProjectRow(row, { deletable: false })}
                </React.Fragment>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Photo picker: template flow (slot-capped) or edit-photo (single) */}
      <LibraryPickerSheet
        visible={pickerTarget != null}
        maxCount={
          pickerTarget?.kind === "template"
            ? templateById(pickerTarget.templateId).slots.length
            : 1
        }
        allowCameraRoll
        allowAlbums
        onConfirm={handlePickedPhotos}
        onClose={() => setPickerTarget(null)}
      />

      {/* All layouts */}
      <Sheet
        visible={layoutsOpen}
        onClose={() => setLayoutsOpen(false)}
        title="Layouts"
      >
        <ScrollView
          style={styles.layoutsSheetScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.layoutsSheetGrid}>
            {COLLAGE_TEMPLATES.map((template) => (
              <Pressable
                key={template.id}
                onPress={() => openTemplate(template.id)}
                style={({ pressed }) => [
                  styles.layoutCell,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${template.name} layout`}
              >
                <View style={styles.layoutCard}>
                  <TemplatePreview
                    templateId={template.id}
                    width={RAIL_PREVIEW_W}
                    height={RAIL_PREVIEW_H}
                    background={color.bg}
                  />
                </View>
                <Text style={styles.layoutName}>{template.name}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </Sheet>

      {/* All projects */}
      <Sheet
        visible={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        title="Projects"
      >
        {projectRows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name="folder-open-outline"
              size={40}
              color={color.textTertiary}
            />
            <Text style={styles.emptyTitle}>No projects yet</Text>
            <Text style={styles.emptyText}>
              Drafts save automatically while you edit
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.projectsSheetScroll}
            showsVerticalScrollIndicator={false}
          >
            {projectRows.map((row, index) => (
              <React.Fragment key={row.project.id}>
                {index > 0 && <View style={styles.hairline} />}
                {renderProjectRow(row, { deletable: true })}
              </React.Fragment>
            ))}
          </ScrollView>
        )}
      </Sheet>

      {/* Blank canvas: ratio + page count, then into the Studio */}
      <Sheet
        visible={scratchOpen}
        onClose={() => setScratchOpen(false)}
        title="Blank canvas"
      >
        <View style={styles.scratchBody}>
          <Text style={styles.scratchLabel}>Format</Text>
          <View style={styles.scratchRow}>
            {CANVAS_RATIOS.map((ratio) => {
              const active = ratio.id === scratchRatioId;
              return (
                <Pressable
                  key={ratio.id}
                  onPress={() => setScratchRatioId(ratio.id)}
                  style={[
                    styles.scratchSegment,
                    active && styles.scratchSegmentActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.scratchSegmentText,
                      active && styles.scratchSegmentTextActive,
                    ]}
                  >
                    {ratio.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.scratchLabel}>Pages</Text>
          <View style={styles.scratchRow}>
            <Pressable
              onPress={() => setScratchPages((n) => Math.max(n - 1, 1))}
              style={styles.stepButton}
              accessibilityRole="button"
              accessibilityLabel="Fewer pages"
            >
              <Ionicons name="remove" size={18} color={color.textPrimary} />
            </Pressable>
            <View style={styles.stepValue}>
              <Text style={styles.stepValueText}>{scratchPages}</Text>
            </View>
            <Pressable
              onPress={() => setScratchPages((n) => Math.min(n + 1, MAX_PAGES))}
              style={styles.stepButton}
              accessibilityRole="button"
              accessibilityLabel="More pages"
            >
              <Ionicons name="add" size={18} color={color.textPrimary} />
            </Pressable>
          </View>

          <Pressable
            onPress={startStudio}
            style={({ pressed }) => [
              styles.scratchCreate,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create project"
          >
            <Text style={styles.scratchCreateText}>Create</Text>
          </Pressable>
        </View>
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.bg,
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
    fontSize: 17,
    ...font.bold,
    color: color.textPrimary,
  },
  navTitleScript: {
    ...scriptType(17),
    color: color.textPrimary,
  },
  content: {
    flex: 1,
  },
  pressed: {
    opacity: 0.75,
  },

  // ---- Blank canvas hero ----
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: screenH,
    marginTop: 8,
    marginBottom: 26,
    paddingHorizontal: 18,
    paddingVertical: 26,
    borderRadius: radius.lg,
    backgroundColor: "#0A0A0A",
    overflow: "hidden",
  },
  heroStripe: {
    position: "absolute",
    top: -80,
    width: 26,
    height: 320,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    transform: [{ rotate: "-24deg" }],
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: color.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextWrap: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 20,
    ...font.bold,
    color: color.textInverse,
  },
  heroText: {
    fontSize: 13,
    lineHeight: 18,
    ...font.regular,
    color: color.onDarkSecondary,
    marginTop: 4,
  },

  // ---- Section headers ----
  sectionLabel: {
    marginHorizontal: screenH,
    marginBottom: 12,
    fontSize: 12,
    ...font.semibold,
    color: color.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: screenH,
    marginBottom: 12,
  },
  sectionLabelInline: {
    fontSize: 12,
    ...font.semibold,
    color: color.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  sectionLink: {
    fontSize: 13,
    ...font.bold,
    color: color.textPrimary,
    textDecorationLine: "underline",
  },

  // ---- What are you making ----
  makeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: screenH,
    gap: GRID_GAP,
    marginBottom: 26,
  },
  makeTile: {
    width: MAKE_TILE,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
  },
  makeTileLabel: {
    fontSize: 15,
    ...font.bold,
    color: color.textPrimary,
  },
  makeTileLabelSoon: {
    color: color.textTertiary,
  },
  soonPill: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: color.surface1,
  },
  soonPillText: {
    fontSize: 10,
    ...font.semibold,
    color: color.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  // ---- Layouts rail ----
  railWrap: {
    flexGrow: 0,
    marginBottom: 26,
  },
  rail: {
    paddingHorizontal: screenH,
    gap: GRID_GAP,
  },
  layoutCell: {
    alignItems: "center",
    gap: 8,
  },
  layoutCard: {
    padding: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
    backgroundColor: color.bg,
  },
  layoutName: {
    fontSize: 13,
    ...font.semibold,
    color: color.textPrimary,
  },

  // ---- Looks rail ----
  lookCell: {
    alignItems: "center",
    gap: 8,
  },
  lookFrame: {
    padding: 2,
    borderRadius: radius.md + 2,
    borderWidth: 2,
    borderColor: "transparent",
  },
  lookFrameActive: {
    borderColor: color.bgDark,
  },
  lookSwatch: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
  },
  lookSwatchHairline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
  },
  lookName: {
    fontSize: 13,
    ...font.regular,
    color: color.textSecondary,
  },
  lookNameActive: {
    ...font.bold,
    color: color.textPrimary,
  },

  // ---- In progress / projects ----
  projectList: {
    paddingHorizontal: screenH,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
    marginLeft: 52 + 12,
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  projectThumbDark: {
    borderRadius: radius.sm,
    backgroundColor: color.surfaceDark,
    alignItems: "center",
    justifyContent: "center",
  },
  projectTextWrap: {
    flex: 1,
  },
  projectTitle: {
    fontSize: 15,
    ...font.semibold,
    color: color.textPrimary,
  },
  projectSubtitle: {
    fontSize: 12,
    ...font.regular,
    color: color.textTertiary,
    marginTop: 2,
  },
  projectDelete: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  projectsSheetScroll: {
    maxHeight: 420,
    paddingHorizontal: screenH,
  },
  layoutsSheetScroll: {
    maxHeight: 480,
  },
  layoutsSheetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: screenH,
    paddingBottom: 8,
    gap: GRID_GAP + 4,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 36,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 16,
    ...font.semibold,
    color: color.textPrimary,
  },
  emptyText: {
    fontSize: 13,
    ...font.regular,
    color: color.textTertiary,
  },

  // ---- Blank canvas sheet ----
  scratchBody: {
    paddingHorizontal: screenH,
    paddingBottom: 8,
  },
  scratchLabel: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 12,
    ...font.semibold,
    color: color.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  scratchRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  scratchSegment: {
    minWidth: 52,
    height: 34,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    backgroundColor: color.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  scratchSegmentActive: {
    backgroundColor: color.bgDark,
  },
  scratchSegmentText: {
    fontSize: 13,
    ...font.semibold,
    color: color.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  scratchSegmentTextActive: {
    color: color.textInverse,
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: color.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: {
    minWidth: 52,
    alignItems: "center",
  },
  stepValueText: {
    fontSize: 17,
    ...font.bold,
    color: color.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  scratchCreate: {
    marginTop: 22,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: color.bgDark,
    alignItems: "center",
    justifyContent: "center",
  },
  scratchCreateText: {
    color: color.textInverse,
    fontSize: 16,
    ...font.semibold,
  },
});

export default CreateHomeScreen;
