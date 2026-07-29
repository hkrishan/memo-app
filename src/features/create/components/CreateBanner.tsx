/**
 * Memo Create — entry banner on the My Albums tab.
 *
 * A dark card under "My Photos": a mock collage drawn from the real
 * template geometry (so it previews exactly what the builder makes), the
 * feature name, and a chevron. One tap → /create.
 */

import React, { memo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { scriptType } from "@/lib/tokens";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { slotRects, templateById } from "../templates";

const MOCK_SIZE = 64;
/** Grayscale fills for the mock collage tiles — quiet, not photographic. */
const MOCK_FILLS = ["#3A3A3C", "#48484A", "#5A5A5E", "#2C2C2E"];

export const CreateBanner = memo(() => {
  const router = useRouter();

  const handlePress = useCallback(() => {
    Haptics.selectionAsync();
    router.push("/create");
  }, [router]);

  const mockRects = slotRects(templateById("hero-left"), MOCK_SIZE, MOCK_SIZE, 4);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Open Memo Create"
    >
      <LinearGradient
        colors={["#1c1c1e", "#000000"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Mock collage tile, built from the real template geometry */}
      <View style={styles.mock}>
        {mockRects.map((rect, i) => (
          <View
            key={i}
            style={[
              styles.mockSlot,
              {
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                backgroundColor: MOCK_FILLS[i % MOCK_FILLS.length],
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.textWrap}>
        <View style={styles.titleRow}>
          {/* Wordmark: "Memo" in the app face, "Create" in script */}
          <Text style={styles.title}>
            Memo <Text style={styles.titleScript}>Create</Text>
          </Text>
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Collages & seamless carousels from your photos
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.55)" />
    </Pressable>
  );
});
CreateBanner.displayName = "CreateBanner";

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 20,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.85,
  },
  mock: {
    width: MOCK_SIZE,
    height: MOCK_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0A0A0A",
  },
  mockSlot: {
    position: "absolute",
    borderRadius: 3,
  },
  textWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
  },
  titleScript: {
    ...scriptType(16),
    color: "#fff",
  },
  newBadge: {
    paddingHorizontal: 6,
    height: 17,
    borderRadius: 5,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  newBadgeText: {
    fontSize: 9,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.6,
  },
  subtitle: {
    fontSize: 12.5,
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 2,
  },
});

export default CreateBanner;
