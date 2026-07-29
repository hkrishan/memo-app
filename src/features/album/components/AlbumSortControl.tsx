/**
 * AlbumSortControl — compact "Latest activity ▾" button that opens an
 * anchored dropdown of sort options. The choice lives in a persisted zustand
 * store (albumSortStore); the grid reads the same store and re-sorts, gliding
 * cards to their new spots via reanimated layout animations.
 */

import React, { useCallback, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Modal } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import {
  ALBUM_SORT_OPTIONS,
  AlbumSort,
  albumSortLabel,
  useAlbumSortStore,
} from "../store/albumSortStore";

type Anchor = { x: number; y: number; width: number; height: number };

export const AlbumSortControl: React.FC = () => {
  const sort = useAlbumSortStore((s) => s.sort);
  const setSort = useAlbumSortStore((s) => s.setSort);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const buttonRef = useRef<View>(null);

  const handleOpen = useCallback(() => {
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }, []);

  const handleSelect = useCallback(
    (value: AlbumSort) => {
      setSort(value);
      setOpen(false);
    },
    [setSort],
  );

  return (
    <>
      <Pressable
        ref={buttonRef}
        onPress={handleOpen}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Sort albums. Current: ${albumSortLabel(sort)}`}
      >
        <Ionicons name="swap-vertical" size={15} color="#111" />
        <Text style={styles.buttonLabel}>{albumSortLabel(sort)}</Text>
        <Ionicons name="chevron-down" size={14} color="#8E8E93" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {anchor && (
            <Animated.View
              entering={FadeInUp.duration(160)}
              style={[
                styles.menu,
                { top: anchor.y + anchor.height + 6, left: anchor.x },
              ]}
            >
              {ALBUM_SORT_OPTIONS.map((opt, i) => {
                const active = opt.value === sort;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => handleSelect(opt.value)}
                    style={({ pressed }) => [
                      styles.item,
                      i > 0 && styles.itemDivider,
                      pressed && styles.itemPressed,
                    ]}
                  >
                    <Text
                      style={[styles.itemLabel, active && styles.itemLabelActive]}
                    >
                      {opt.label}
                    </Text>
                    {active && (
                      <Animated.View entering={FadeIn.duration(120)}>
                        <Ionicons name="checkmark" size={17} color="#FF3B30" />
                      </Animated.View>
                    )}
                  </Pressable>
                );
              })}
            </Animated.View>
          )}
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "#F1F1F3",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#111",
  },
  backdrop: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    minWidth: 210,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  itemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECECEE",
  },
  itemPressed: {
    backgroundColor: "#F7F7F8",
  },
  itemLabel: {
    fontSize: 15,
    color: "#111",
  },
  itemLabelActive: {
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
});

export default AlbumSortControl;
