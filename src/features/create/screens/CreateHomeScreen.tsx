/**
 * Memo Create — the hub.
 *
 * Its own corner of the app (pushed from the My Albums tab's banner) with
 * an internal tab bar:
 *   Collage  — template gallery; tapping one starts a new collage
 *   Carousel — the seamless-split carousel builder entry
 *   Projects — auto-saved drafts, reopenable and deletable
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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";

import { COLLAGE_TEMPLATES, ratioById } from "../templates";
import { TemplatePreview } from "../components/TemplatePreview";
import {
  useCreateProjectsStore,
  type CreateProject,
} from "../store/createProjectsStore";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_PADDING = 16;
const GRID_GAP = 12;
const TEMPLATE_COLUMNS = 3;
const TEMPLATE_CELL = Math.floor(
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (TEMPLATE_COLUMNS - 1)) /
    TEMPLATE_COLUMNS,
);

type CreateTab = "collage" | "carousel" | "projects";

const TABS: { key: CreateTab; label: string; icon: string }[] = [
  { key: "collage", label: "Collage", icon: "grid" },
  { key: "carousel", label: "Carousel", icon: "albums" },
  { key: "projects", label: "Projects", icon: "folder-open" },
];

const CreateHomeScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<CreateTab>("collage");

  const projects = useCreateProjectsStore((state) => state.projects);
  const removeProject = useCreateProjectsStore((state) => state.remove);

  const handleBack = useCallback(() => router.back(), [router]);

  const openTemplate = useCallback(
    (templateId: string) => {
      router.push({
        pathname: "/create/editor",
        params: { templateId },
      });
    },
    [router],
  );

  const openCarousel = useCallback(() => {
    router.push("/create/carousel");
  }, [router]);

  const openProject = useCallback(
    (project: CreateProject) => {
      if (project.type === "collage") {
        router.push({
          pathname: "/create/editor",
          params: { projectId: project.id },
        });
      } else {
        router.push({
          pathname: "/create/carousel",
          params: { projectId: project.id },
        });
      }
    },
    [router],
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
      projects.map((project) => ({
        project,
        title:
          project.type === "collage"
            ? `Collage · ${ratioById(project.ratioId).label}`
            : `Carousel · ${project.pages} pages`,
        subtitle: `Edited ${dayjs(project.updatedAt).format("D MMM, HH:mm")}`,
      })),
    [projects],
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
          <Ionicons name="chevron-back" size={26} color="#000" />
        </Pressable>
        <View style={styles.navCenter}>
          {/* Wordmark: "Memo" in the app face, "Create" in script */}
          <Text style={styles.navTitle}>
            Memo <Text style={styles.navTitleScript}>Create</Text>
          </Text>
        </View>
        <View style={styles.navButton} />
      </View>

      {/* Tab bar — segmented, matching the app's control voice */}
      <View style={styles.tabBar}>
        {TABS.map(({ key, label, icon }) => {
          const active = key === tab;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[styles.tabItem, active && styles.tabItemActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                name={(active ? icon : `${icon}-outline`) as any}
                size={15}
                color={active ? "#fff" : "#666"}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {tab === "collage" && (
          <View style={styles.templateGrid}>
            {COLLAGE_TEMPLATES.map((template) => (
              <Pressable
                key={template.id}
                onPress={() => openTemplate(template.id)}
                style={({ pressed }) => [
                  styles.templateCard,
                  pressed && styles.cardPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${template.name} layout`}
              >
                <TemplatePreview
                  templateId={template.id}
                  width={TEMPLATE_CELL}
                  height={TEMPLATE_CELL}
                  background="#F2F2F7"
                />
                <Text style={styles.templateName}>{template.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {tab === "carousel" && (
          <View style={styles.carouselIntro}>
            {/* Visual explainer: one photo flowing across three pages */}
            <View style={styles.carouselDiagram}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.carouselDiagramPage}>
                  <View
                    style={[
                      styles.carouselDiagramFill,
                      { left: -i * 64 },
                    ]}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.carouselTitle}>Seamless carousel</Text>
            <Text style={styles.carouselText}>
              Split one photo into swipeable Instagram pages that line up
              edge-to-edge. Pick a wide shot, choose how many pages, and every
              page lands in your camera roll in posting order.
            </Text>
            <Pressable
              onPress={openCarousel}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.cardPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Start a carousel"
            >
              <Ionicons name="albums" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Start a carousel</Text>
            </Pressable>
          </View>
        )}

        {tab === "projects" &&
          (projectRows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="folder-open-outline" size={44} color="#ccc" />
              <Text style={styles.emptyTitle}>No projects yet</Text>
              <Text style={styles.emptyText}>
                Drafts save automatically while you edit
              </Text>
            </View>
          ) : (
            <View style={styles.projectList}>
              {projectRows.map(({ project, title, subtitle }) => (
                <Pressable
                  key={project.id}
                  onPress={() => openProject(project)}
                  style={({ pressed }) => [
                    styles.projectRow,
                    pressed && styles.cardPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={title}
                >
                  {project.type === "collage" ? (
                    <TemplatePreview
                      templateId={project.templateId}
                      width={56}
                      height={56}
                      slots={project.slots}
                      gap={2}
                      background={project.background}
                    />
                  ) : (
                    <View style={styles.projectThumbFallback}>
                      <Ionicons name="albums" size={22} color="#8E8E93" />
                    </View>
                  )}
                  <View style={styles.projectTextWrap}>
                    <Text style={styles.projectTitle}>{title}</Text>
                    <Text style={styles.projectSubtitle}>{subtitle}</Text>
                  </View>
                  <Pressable
                    onPress={() => confirmDelete(project)}
                    hitSlop={10}
                    style={styles.projectDelete}
                    accessibilityRole="button"
                    accessibilityLabel="Delete project"
                  >
                    <Ionicons name="trash-outline" size={18} color="#8E8E93" />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          ))}
      </ScrollView>
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
    fontSize: 17,
    fontWeight: "700",
    color: "#000",
  },
  // Pacifico ships one weight; fontWeight would force a fallback font
  navTitleScript: {
    fontFamily: "Pacifico_400Regular",
    fontSize: 18,
    fontWeight: "400",
    color: "#000",
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    padding: 3,
    borderRadius: 12,
    backgroundColor: "#F2F2F7",
    gap: 3,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 36,
    borderRadius: 9,
  },
  tabItemActive: {
    backgroundColor: "#000",
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  tabLabelActive: {
    color: "#fff",
  },
  content: {
    flex: 1,
  },
  templateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
  },
  templateCard: {
    width: TEMPLATE_CELL,
    alignItems: "center",
    gap: 6,
  },
  cardPressed: {
    opacity: 0.75,
  },
  templateName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#3C3C43",
  },
  carouselIntro: {
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: "center",
  },
  carouselDiagram: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 24,
  },
  carouselDiagramPage: {
    width: 64,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F2F2F7",
  },
  // One wide "photo" sliding left per page = the seamless-split idea
  carouselDiagramFill: {
    position: "absolute",
    top: 12,
    width: 64 * 3,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#D8D8DE",
  },
  carouselTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
    marginBottom: 8,
  },
  carouselText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 50,
    paddingHorizontal: 26,
    borderRadius: 25,
    backgroundColor: "#000",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  empty: {
    alignItems: "center",
    paddingTop: 70,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#3C3C43",
  },
  emptyText: {
    fontSize: 13,
    color: "#8E8E93",
  },
  projectList: {
    paddingHorizontal: 16,
    gap: 10,
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "#F9F9FB",
  },
  projectThumbFallback: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  projectTextWrap: {
    flex: 1,
  },
  projectTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
  },
  projectSubtitle: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 2,
  },
  projectDelete: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CreateHomeScreen;
