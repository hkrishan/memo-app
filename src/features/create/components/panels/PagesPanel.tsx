/**
 * Memo Create Studio — pages tool panel content.
 *
 * Numbered mini pages with add/remove and swap-with-neighbor reordering
 * (the screen shifts each swapped page's layers along with it). Removing
 * is last-page-only: layers keep absolute strip coordinates across page
 * ops, so trimming the end is the only removal that can't silently orphan
 * mid-strip content.
 */

import React, { memo } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { MAX_PAGES, pageSizeFor, type StudioProject } from "../../engine/document";

const PAGE_TILE_HEIGHT = 76;

interface PagesPanelProps {
  project: StudioProject;
  onAddPage: () => void;
  onRemoveLastPage: () => void;
  /** Swap a page (and its layers) with a neighbor. */
  onSwapPages: (indexA: number, indexB: number) => void;
}

export const PagesPanel = memo<PagesPanelProps>(
  ({ project, onAddPage, onRemoveLastPage, onSwapPages }) => {
    const page = pageSizeFor(project.ratioId);
    const tileWidth = Math.round((PAGE_TILE_HEIGHT * page.width) / page.height);

    const confirmRemove = () => {
      Alert.alert(
        "Remove last page",
        "Anything placed only on it will fall outside the canvas.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: onRemoveLastPage },
        ],
      );
    };

    return (
      <View style={styles.container}>
        <Text style={styles.label}>
          Pages · {project.pageCount} of {MAX_PAGES}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.row}>
            {Array.from({ length: project.pageCount }).map((_, i) => {
              const isLast = i === project.pageCount - 1;
              return (
                <View key={i} style={styles.pageColumn}>
                  <View
                    style={[
                      styles.pageTile,
                      { width: tileWidth, height: PAGE_TILE_HEIGHT },
                    ]}
                  >
                    <Text style={styles.pageNumber}>{i + 1}</Text>
                    {isLast && project.pageCount > 1 && (
                      <Pressable
                        onPress={confirmRemove}
                        hitSlop={8}
                        style={styles.removeBadge}
                        accessibilityRole="button"
                        accessibilityLabel="Remove last page"
                      >
                        <Ionicons name="close" size={12} color="#fff" />
                      </Pressable>
                    )}
                  </View>
                  {project.pageCount > 1 && (
                    <View style={styles.swapRow}>
                      <Pressable
                        onPress={() => onSwapPages(i, i - 1)}
                        disabled={i === 0}
                        hitSlop={6}
                        style={[styles.swapButton, i === 0 && styles.swapOff]}
                        accessibilityRole="button"
                        accessibilityLabel={`Move page ${i + 1} left`}
                      >
                        <Ionicons
                          name="chevron-back"
                          size={13}
                          color={i === 0 ? "#C7C7CC" : "#3C3C43"}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => onSwapPages(i, i + 1)}
                        disabled={isLast}
                        hitSlop={6}
                        style={[styles.swapButton, isLast && styles.swapOff]}
                        accessibilityRole="button"
                        accessibilityLabel={`Move page ${i + 1} right`}
                      >
                        <Ionicons
                          name="chevron-forward"
                          size={13}
                          color={isLast ? "#C7C7CC" : "#3C3C43"}
                        />
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
            {project.pageCount < MAX_PAGES && (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onAddPage();
                }}
                style={[
                  styles.addTile,
                  { width: tileWidth, height: PAGE_TILE_HEIGHT },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Add page"
              >
                <Ionicons name="add" size={22} color="#8E8E93" />
              </Pressable>
            )}
          </View>
        </ScrollView>
        <Text style={styles.hint}>
          Instagram carousels hold up to {MAX_PAGES} pages
        </Text>
      </View>
    );
  },
);
PagesPanel.displayName = "PagesPanel";

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  label: {
    marginBottom: 10,
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  pageColumn: {
    alignItems: "center",
    gap: 4,
  },
  swapRow: {
    flexDirection: "row",
    gap: 10,
  },
  swapButton: {
    width: 24,
    height: 20,
    borderRadius: 6,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  swapOff: {
    opacity: 0.5,
  },
  pageTile: {
    borderRadius: 8,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  pageNumber: {
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#3C3C43",
    fontVariant: ["tabular-nums"],
  },
  removeBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  addTile: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#C7C7CC",
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    marginTop: 10,
    fontSize: 11,
    color: "#8E8E93",
  },
});
