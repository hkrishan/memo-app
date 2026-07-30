/**
 * ActivityFilterBar — sort + person + media filters for an album's
 * activity feed. Three anchored-dropdown pills in the same visual language
 * as AlbumSortControl; selections are per-visit state owned by the page.
 */

import React, { useCallback, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

export type ActivitySort = "newest" | "oldest";
export type ActivityMediaFilter = "all" | "photos" | "videos";
export type ActivityPerson = { userId: string; name: string };

const SORT_OPTIONS: { value: ActivitySort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

const MEDIA_OPTIONS: { value: ActivityMediaFilter; label: string }[] = [
  { value: "all", label: "All media" },
  { value: "photos", label: "Photos" },
  { value: "videos", label: "Videos" },
];

type Anchor = { x: number; y: number; width: number; height: number };
type PillOption = { value: string; label: string };

const DropdownPill: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  options: PillOption[];
  value: string;
  onSelect: (value: string) => void;
  accessibilityLabel: string;
}> = ({ icon, label, active, options, value, onSelect, accessibilityLabel }) => {
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
    (next: string) => {
      onSelect(next);
      setOpen(false);
    },
    [onSelect],
  );

  return (
    <>
      <Pressable
        ref={buttonRef}
        onPress={handleOpen}
        style={({ pressed }) => [
          styles.pill,
          active && styles.pillActive,
          pressed && styles.pillPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}. Current: ${label}`}
      >
        <Ionicons
          name={icon}
          size={14}
          color={active ? "#fff" : "#111"}
        />
        <Text
          style={[styles.pillLabel, active && styles.pillLabelActive]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Ionicons
          name="chevron-down"
          size={13}
          color={active ? "rgba(255,255,255,0.7)" : "#8E8E93"}
        />
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
              {/* Member lists can outgrow the screen — cap and scroll */}
              <ScrollView style={styles.menuScroll} bounces={false}>
                {options.map((opt, i) => {
                  const selected = opt.value === value;
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
                        style={[
                          styles.itemLabel,
                          selected && styles.itemLabelActive,
                        ]}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                      {selected && (
                        <Animated.View entering={FadeIn.duration(120)}>
                          <Ionicons name="checkmark" size={17} color="#FF3B30" />
                        </Animated.View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Animated.View>
          )}
        </Pressable>
      </Modal>
    </>
  );
};

export const ActivityFilterBar: React.FC<{
  sort: ActivitySort;
  onSortChange: (sort: ActivitySort) => void;
  people: ActivityPerson[];
  personId: string | null;
  onPersonChange: (personId: string | null) => void;
  media: ActivityMediaFilter;
  onMediaChange: (media: ActivityMediaFilter) => void;
}> = ({
  sort,
  onSortChange,
  people,
  personId,
  onPersonChange,
  media,
  onMediaChange,
}) => {
  const person = people.find((p) => p.userId === personId);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <DropdownPill
        icon="swap-vertical"
        label={sort === "newest" ? "Newest" : "Oldest"}
        active={sort !== "newest"}
        options={SORT_OPTIONS}
        value={sort}
        onSelect={(value) => onSortChange(value as ActivitySort)}
        accessibilityLabel="Sort activity"
      />
      <DropdownPill
        icon="person-outline"
        label={person?.name ?? "Everyone"}
        active={personId != null}
        options={[
          { value: "", label: "Everyone" },
          ...people.map((p) => ({ value: p.userId, label: p.name })),
        ]}
        value={personId ?? ""}
        onSelect={(value) => onPersonChange(value === "" ? null : value)}
        accessibilityLabel="Filter by person"
      />
      <DropdownPill
        icon="images-outline"
        label={MEDIA_OPTIONS.find((o) => o.value === media)?.label ?? "All media"}
        active={media !== "all"}
        options={MEDIA_OPTIONS}
        value={media}
        onSelect={(value) => onMediaChange(value as ActivityMediaFilter)}
        accessibilityLabel="Filter by media type"
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 16,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "#F1F1F3",
    maxWidth: 180,
  },
  pillActive: {
    backgroundColor: "#111",
  },
  pillPressed: {
    opacity: 0.7,
  },
  pillLabel: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#111",
    flexShrink: 1,
  },
  pillLabelActive: {
    color: "#fff",
  },
  backdrop: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    minWidth: 200,
    maxWidth: 280,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  menuScroll: {
    maxHeight: 320,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
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
    flexShrink: 1,
  },
  itemLabelActive: {
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
});

export default ActivityFilterBar;
