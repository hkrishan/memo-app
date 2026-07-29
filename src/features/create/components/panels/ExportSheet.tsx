/**
 * Memo Create Studio — export options.
 *
 * The cover always lands in the user's Memo photos (the in-app record of
 * the creation, badge and all); the choices here are whether the clean
 * pages also go to the camera roll (the Instagram posting flow) and
 * whether the cover is additionally added to one of the user's albums.
 */

import React, { memo, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import Sheet from "@/components/ui/Sheet";
import { useGetAlbumsQuery } from "@/features/album/api/album.queries";
import { pageSizeFor, type StudioProject } from "../../engine/document";

export interface ExportChoices {
  saveToCameraRoll: boolean;
  albumId: string | null;
}

interface ExportSheetProps {
  visible: boolean;
  project: StudioProject;
  exporting: boolean;
  onExport: (choices: ExportChoices) => void;
  onClose: () => void;
}

export const ExportSheet = memo<ExportSheetProps>(
  ({ visible, project, exporting, onExport, onClose }) => {
    const { data: albums } = useGetAlbumsQuery();
    const [saveToCameraRoll, setSaveToCameraRoll] = useState(true);
    const [albumId, setAlbumId] = useState<string | null>(null);

    useEffect(() => {
      if (visible) {
        setSaveToCameraRoll(true);
        setAlbumId(null);
      }
    }, [visible]);

    const page = pageSizeFor(project.ratioId);

    return (
      <Sheet visible={visible} onClose={onClose} title="Export">
        <View style={styles.body}>
          <Text style={styles.summary}>
            {project.pageCount} page{project.pageCount === 1 ? "" : "s"} ·{" "}
            {page.width} × {page.height}
          </Text>
          <View style={styles.memoRow}>
            <Ionicons name="checkmark-circle" size={16} color="#000" />
            <Text style={styles.memoText}>
              A cover is saved to your Memo photos
              {project.pageCount > 1 ? " (marked as a carousel)" : ""}
            </Text>
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleTitle}>Save pages to camera roll</Text>
              <Text style={styles.toggleHint}>
                Clean, badge-free pages in posting order — for Instagram
              </Text>
            </View>
            <Switch
              value={saveToCameraRoll}
              onValueChange={(value) => {
                Haptics.selectionAsync().catch(() => {});
                setSaveToCameraRoll(value);
              }}
              trackColor={{ true: "#000", false: "#E5E5EA" }}
            />
          </View>

          <Text style={styles.label}>Add to album</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.albumScroll}
            contentContainerStyle={styles.albumRow}
          >
            <Pressable
              onPress={() => setAlbumId(null)}
              style={[styles.albumChip, albumId == null && styles.albumChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: albumId == null }}
            >
              <Text
                style={[
                  styles.albumChipText,
                  albumId == null && styles.albumChipTextActive,
                ]}
              >
                None
              </Text>
            </Pressable>
            {(albums ?? []).map((album) => {
              const active = album.albumId === albumId;
              return (
                <Pressable
                  key={album.albumId}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setAlbumId(active ? null : album.albumId);
                  }}
                  style={[styles.albumChip, active && styles.albumChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.albumChipText,
                      active && styles.albumChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {album.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            onPress={() => onExport({ saveToCameraRoll, albumId })}
            disabled={exporting}
            style={({ pressed }) => [
              styles.cta,
              exporting && styles.ctaDisabled,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Export"
          >
            <Text style={styles.ctaText}>
              {exporting ? "Exporting…" : "Export"}
            </Text>
          </Pressable>
        </View>
      </Sheet>
    );
  },
);
ExportSheet.displayName = "ExportSheet";

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  summary: {
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
    fontVariant: ["tabular-nums"],
  },
  memoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  memoText: {
    fontSize: 12,
    color: "#3C3C43",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F9F9FB",
  },
  toggleTextWrap: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  toggleHint: {
    fontSize: 11,
    color: "#8E8E93",
    marginTop: 2,
  },
  label: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  albumScroll: {
    flexGrow: 0,
  },
  albumRow: {
    gap: 8,
  },
  albumChip: {
    height: 34,
    maxWidth: 170,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  albumChipActive: {
    backgroundColor: "#000",
  },
  albumChipText: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#3C3C43",
  },
  albumChipTextActive: {
    color: "#fff",
  },
  cta: {
    marginTop: 22,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaDisabled: {
    backgroundColor: "#D1D1D6",
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.85,
  },
});
