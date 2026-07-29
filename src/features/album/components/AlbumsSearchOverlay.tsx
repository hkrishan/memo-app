/**
 * AlbumsSearchOverlay — a full-screen search view presented over the Albums
 * tab. The bar animates down from the top on open, results fade/stagger in as
 * you type, and the whole surface fades out on close. Filtering is local and
 * instant (case-insensitive match on title, plus member names). Results reuse
 * the same AlbumCard rendering as the grid.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Modal,
  Platform,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeOut,
  FadeInUp,
} from "react-native-reanimated";
import { Album } from "../types/album.types";
import { AlbumCard } from "./AlbumsGrid";

interface AlbumsSearchOverlayProps {
  visible: boolean;
  albums: Album[] | undefined;
  onClose: () => void;
  onAlbumPress: (album: Album) => void;
}

const matchesQuery = (album: Album, q: string): boolean => {
  if (album.title?.toLowerCase().includes(q)) return true;
  return (album.members ?? []).some((m) =>
    m.name?.toLowerCase().includes(q),
  );
};

export const AlbumsSearchOverlay: React.FC<AlbumsSearchOverlayProps> = ({
  visible,
  albums,
  onClose,
  onAlbumPress,
}) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);

  const trimmed = query.trim().toLowerCase();
  const results = useMemo(() => {
    // Closed overlay: skip the filtering entirely — this component stays
    // mounted on the always-mounted Albums tab and re-runs per parent
    // render otherwise
    if (!visible) return [];
    const all = albums ?? [];
    if (!trimmed) return all;
    return all.filter((a) => matchesQuery(a, trimmed));
  }, [albums, trimmed, visible]);

  const handleClose = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);

  const handlePress = useCallback(
    (album: Album) => {
      onAlbumPress(album);
    },
    [onAlbumPress],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      onShow={() => inputRef.current?.focus()}
    >
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(160)}
        style={[styles.container, { paddingTop: insets.top + 6 }]}
      >
        <Animated.View
          entering={FadeInUp.duration(240)}
          style={styles.header}
        >
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#8E8E93" />
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search albums"
              placeholderTextColor="#8E8E93"
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#8E8E93" />
              </Pressable>
            )}
          </View>
          <Pressable onPress={handleClose} hitSlop={8}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </Animated.View>

        {results.length === 0 ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.empty}>
            <Ionicons name="search-outline" size={40} color="#C7C7CC" />
            <Text style={styles.emptyText}>
              {trimmed ? "No albums match" : "Search your albums"}
            </Text>
          </Animated.View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {/* Keyed on the album only: re-keying on the query tore down
                and rebuilt every card (image decode included) per
                keystroke just to replay a stagger animation */}
            {results.map((album) => (
              <View key={album.albumId} style={styles.cardSlot}>
                <AlbumCard album={album} onPress={handlePress} />
              </View>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
};

const GRID_GAP = 12;
const GRID_ROW_GAP = 20;
const GRID_PADDING = 20;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F1F1F3",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  input: {
    flex: 1,
    color: "#111",
    fontSize: 16,
    padding: 0,
    ...(Platform.OS === "android" ? { paddingVertical: 0 } : null),
  },
  cancel: {
    color: "#111",
    fontSize: 15,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: GRID_PADDING,
    columnGap: GRID_GAP,
    rowGap: GRID_ROW_GAP,
    paddingTop: 4,
    paddingBottom: 40,
  },
  cardSlot: {},
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: "#8E8E93",
    fontWeight: "500",
  },
});

export default AlbumsSearchOverlay;
