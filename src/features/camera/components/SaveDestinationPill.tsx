/**
 * SaveDestinationPill
 * The always-visible "SAVING TO — <destination>" pill centered at the top of
 * the camera. Names where the next capture lands: the first sticky album (a
 * "+N" tally when more ride along), or the Memo library when no album extra
 * is set. Tapping opens the capture-extras sheet; the album camera renders it
 * static (its destination is fixed).
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { font } from "@/lib/tokens";

interface SaveDestinationPillProps {
  /** Cover of the named destination; null renders the Memo bookmark tile. */
  coverUri: string | null;
  title: string;
  /** Albums beyond the named one ("+N"). */
  extraCount?: number;
  /** Omit to render a static (non-pressable, chevron-less) pill. */
  onPress?: () => void;
}

export const SaveDestinationPill: React.FC<SaveDestinationPillProps> = ({
  coverUri,
  title,
  extraCount = 0,
  onPress,
}) => {
  const body = (
    <>
      {coverUri ? (
        <Image
          source={{ uri: coverUri }}
          style={styles.cover}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Ionicons
            name="bookmark"
            size={14}
            color="rgba(255, 255, 255, 0.9)"
          />
        </View>
      )}
      <View style={styles.textWrap}>
        <Text style={styles.eyebrow}>Saving to</Text>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {extraCount > 0 && (
        <View style={styles.extraChip}>
          <Text style={styles.extraChipText}>+{extraCount}</Text>
        </View>
      )}
      {onPress && (
        <Ionicons
          name="chevron-down"
          size={13}
          color="rgba(255, 255, 255, 0.65)"
        />
      )}
    </>
  );

  const label = `Saving to ${title}${
    extraCount > 0 ? ` and ${extraCount} more` : ""
  }`;

  if (!onPress) {
    return (
      <View style={styles.pill} accessibilityLabel={label}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Tap to change.`}
    >
      {body}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 270,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 6,
    borderRadius: 24,
    backgroundColor: "rgba(12, 12, 12, 0.55)",
  },
  pressed: {
    opacity: 0.8,
  },
  cover: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  coverFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flexShrink: 1,
  },
  eyebrow: {
    ...font.semibold,
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.55)",
  },
  title: {
    ...font.semibold,
    fontSize: 14,
    color: "#fff",
    marginTop: 1,
  },
  extraChip: {
    minWidth: 22,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  extraChipText: {
    ...font.bold,
    fontSize: 10,
    color: "#fff",
  },
});

export default SaveDestinationPill;
