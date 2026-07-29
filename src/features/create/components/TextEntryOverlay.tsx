/**
 * Memo Create Studio — full-screen text entry (Stories-style).
 *
 * The canvas dims behind a scrim; a centered input previews the style live
 * (RN fonts via expo-font — close enough for entry; the committed layer
 * renders through the same Skia paragraph engine as export, which is the
 * source of truth). Controls: font carousel, weight cycle, size steps,
 * color row, alignment, pill background.
 *
 * Emoji are stripped on commit: the Skia typeface provider has no system
 * font fallback, so they would export as tofu.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Canvas,
  Group,
  Paragraph,
  RoundedRect,
} from "@shopify/react-native-skia";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useFonts } from "expo-font";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import type { FontFamilyId, TextDraft, TextLayer } from "../engine/document";
import {
  expoFontMap,
  FONT_FAMILIES,
  FONT_FAMILY_IDS,
  lineHeightFor,
  resolveVariant,
  useFontProvider,
} from "../engine/fonts";
import {
  buildParagraph,
  estimatedTextHeight,
  textBleedFor,
  textLayerBox,
} from "../engine/paragraph";
import type { TextFlightInfo } from "./canvas/CanvasStage";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
/** Doc px → on-screen entry preview px (≈ the canvas at full zoom). */
const ENTRY_SCALE = (SCREEN_WIDTH - 32) / 1080;

/** Where the edit flight lands: roughly the input's keyboard-open spot. */
const FLIGHT_TARGET_X = SCREEN_WIDTH / 2;
const FLIGHT_TARGET_Y = SCREEN_HEIGHT * 0.3;
const FLIGHT_IN_MS = 260;
const FLIGHT_OUT_MS = 230;

/**
 * The flying text: the same Skia paragraph rendering as the canvas layer,
 * animated between the layer's window placement and the entry position.
 * `progress` 0 = on canvas, 1 = at the editing spot (rotation flattens).
 */
const GhostText = memo<{
  layer: TextLayer;
  flight: TextFlightInfo;
  progress: SharedValue<number>;
  targetScale: number;
}>(({ layer, flight, progress, targetScale }) => {
  const provider = useFontProvider();
  const paragraph = useMemo(
    () => (provider ? buildParagraph(layer, provider) : null),
    [provider, layer],
  );
  const textHeight = paragraph
    ? paragraph.getHeight()
    : estimatedTextHeight(layer);
  const box = textLayerBox(layer, textHeight);
  const width = box.width * flight.ps;
  const height = box.height * flight.ps;
  const bleed = textBleedFor(layer);
  const bleedPx = bleed * flight.ps;

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const cx = flight.centerX + (FLIGHT_TARGET_X - flight.centerX) * t;
    const cy = flight.centerY + (FLIGHT_TARGET_Y - flight.centerY) * t;
    const sc = flight.scale + (targetScale - flight.scale) * t;
    const rot = flight.rotation * (1 - t);
    return {
      transform: [
        { translateX: cx - width / 2 },
        { translateY: cy - height / 2 },
        { rotate: `${rot}rad` },
        { scale: sc },
      ],
    };
  }, [width, height, targetScale, flight]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: 0, top: 0, width, height }, style]}
    >
      <Canvas
        style={{
          position: "absolute",
          left: -bleedPx,
          top: -bleedPx,
          width: width + bleedPx * 2,
          height: height + bleedPx * 2,
        }}
      >
        <Group transform={[{ scale: flight.ps }]}>
          {layer.background && (
            <RoundedRect
              x={bleed}
              y={bleed}
              width={box.width}
              height={box.height}
              r={layer.background.cornerRadius}
              color={layer.background.color}
            />
          )}
          {paragraph && (
            <Paragraph
              paragraph={paragraph}
              x={bleed + box.padX}
              y={bleed + box.padY}
              width={layer.maxWidth}
            />
          )}
        </Group>
      </Canvas>
    </Animated.View>
  );
});
GhostText.displayName = "GhostText";

const SIZES = [
  { label: "S", size: 44 },
  { label: "M", size: 66 },
  { label: "L", size: 96 },
  { label: "XL", size: 140 },
];

const COLORS = [
  "#000000",
  "#FFFFFF",
  "#FAF6EF",
  "#E4C580",
  "#C96F4A",
  "#5F7161",
  "#7FA3B8",
  "#C98A97",
  "#8E8E93",
  "#101828",
];

const ALIGN_CYCLE = ["center", "left", "right"] as const;
const ALIGN_ICON: Record<(typeof ALIGN_CYCLE)[number], string> = {
  center: "format-align-center",
  left: "format-align-left",
  right: "format-align-right",
};

type PillMode = "none" | "solid" | "translucent";

const FONT_MAP = expoFontMap();

const stripUnsupported = (text: string): string =>
  text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "");

const isLight = (hex: string): boolean => {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
};

/** Auto-contrast pill: light text → dark pill and vice versa. */
const pillBackground = (
  mode: PillMode,
  textColor: string,
): TextLayer["background"] => {
  if (mode === "none") return null;
  const base = isLight(textColor) ? "#000000" : "#FFFFFF";
  return {
    color: mode === "translucent" ? `${base}80` : base,
    cornerRadius: 24,
    padX: 28,
    padY: 18,
  };
};

const pillModeOf = (layer: TextLayer | null): PillMode => {
  if (!layer?.background) return "none";
  return layer.background.color.length > 7 ? "translucent" : "solid";
};

interface TextEntryOverlayProps {
  /** Editing an existing layer, or null for a fresh one. */
  initial: TextLayer | null;
  /** The layer's window placement — drives the lift-in/settle-back flight.
   *  Null (new layers, or measurement failed) opens without a flight. */
  flight?: TextFlightInfo | null;
  onDone: (draft: TextDraft) => void;
  onCancel: () => void;
}

export const TextEntryOverlay = memo<TextEntryOverlayProps>(
  ({ initial, flight = null, onDone, onCancel }) => {
    const insets = useSafeAreaInsets();
    const [fontsLoaded] = useFonts(FONT_MAP);

    const [text, setText] = useState(initial?.text ?? "");
    const [fontFamily, setFontFamily] = useState<FontFamilyId>(
      initial?.fontFamily ?? "inter",
    );
    const [fontWeight, setFontWeight] = useState<400 | 600 | 700>(
      initial?.fontWeight ?? 600,
    );
    const [fontSize, setFontSize] = useState(initial?.fontSize ?? 66);
    const [color, setColor] = useState(initial?.color ?? "#000000");
    const [align, setAlign] = useState<TextLayer["align"]>(
      initial?.align ?? "center",
    );
    const [pillMode, setPillMode] = useState<PillMode>(pillModeOf(initial));

    const variant = resolveVariant(fontFamily, fontWeight);
    const familyDef = FONT_FAMILIES[fontFamily];
    const pill = pillBackground(pillMode, color);

    // ---- edit flight: lift in from the canvas, settle back on finish ----
    const [phase, setPhase] = useState<"in" | "editing" | "out">(
      flight ? "in" : "editing",
    );
    const flightProgress = useSharedValue(flight ? 0 : 1);
    const inputRef = useRef<TextInput>(null);
    const pendingRef = useRef<(() => void) | null>(null);
    /** What flies back: the edited draft on Done, the original on Cancel. */
    const [outGhost, setOutGhost] = useState<TextLayer | null>(null);

    const beginEditing = useCallback(() => setPhase("editing"), []);
    useEffect(() => {
      if (!flight) return;
      flightProgress.value = withTiming(
        1,
        { duration: FLIGHT_IN_MS, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(beginEditing)();
        },
      );
      // Mount-only: the fly-in happens once
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
      if (phase === "editing" && flight) inputRef.current?.focus();
    }, [phase, flight]);

    const runPending = useCallback(() => {
      const action = pendingRef.current;
      pendingRef.current = null;
      action?.();
    }, []);

    /** Draft as a layer, for the ghost that flies back after Done. */
    const draftGhost = (): TextLayer => ({
      id: "ghost",
      type: "text",
      text: stripUnsupported(text).trim() || " ",
      fontFamily,
      fontWeight: variant.weight,
      fontSize,
      color,
      align,
      lineHeightMultiplier: lineHeightFor(fontFamily),
      letterSpacing: 0,
      maxWidth: initial?.maxWidth ?? 864,
      background: pill,
      opacity: 1,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    });

    const finish = (action: () => void, ghost: TextLayer | null) => {
      if (!flight) {
        action();
        return;
      }
      pendingRef.current = action;
      setOutGhost(ghost ?? initial);
      Keyboard.dismiss();
      setPhase("out");
      flightProgress.value = withTiming(
        0,
        { duration: FLIGHT_OUT_MS, easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(runPending)();
        },
      );
    };

    const handleCancel = () => finish(onCancel, initial);

    const commit = () => {
      const cleaned = stripUnsupported(text).trim();
      if (!cleaned) {
        handleCancel();
        return;
      }
      const draft: TextDraft = {
        text: cleaned,
        fontFamily,
        fontWeight: variant.weight,
        fontSize,
        color,
        align,
        background: pill,
      };
      finish(() => onDone(draft), draftGhost());
    };

    const flightTargetScale = flight
      ? Math.max(fontSize * ENTRY_SCALE * 2, 16) / (fontSize * flight.ps)
      : 1;
    const ghostLayer =
      phase === "out" ? (outGhost ?? initial) : initial;

    const cycleAlign = () => {
      Haptics.selectionAsync().catch(() => {});
      setAlign(
        (current) =>
          ALIGN_CYCLE[
            (ALIGN_CYCLE.indexOf(current as (typeof ALIGN_CYCLE)[number]) + 1) %
              ALIGN_CYCLE.length
          ]!,
      );
    };

    const cyclePill = () => {
      Haptics.selectionAsync().catch(() => {});
      setPillMode((current) =>
        current === "none"
          ? "solid"
          : current === "solid"
            ? "translucent"
            : "none",
      );
    };

    const cycleWeight = () => {
      Haptics.selectionAsync().catch(() => {});
      const weights = familyDef.variants.map((v) => v.weight);
      const next =
        weights[(weights.indexOf(variant.weight) + 1) % weights.length]!;
      setFontWeight(next);
    };

    const inputStyle = useMemo(
      () => ({
        color,
        fontSize: Math.max(fontSize * ENTRY_SCALE * 2, 16),
        fontFamily: fontsLoaded ? variant.rnFamily : undefined,
        textAlign: align,
        backgroundColor: pill?.color,
        borderRadius: pill ? 14 : 0,
        paddingHorizontal: pill ? 16 : 0,
        paddingVertical: pill ? 10 : 0,
      }),
      [color, fontSize, fontsLoaded, variant.rnFamily, align, pill],
    );

    return (
      <View style={StyleSheet.absoluteFillObject}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, styles.scrim]}
          onPress={commit}
          accessibilityLabel="Done"
        />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          pointerEvents="box-none"
        >
          {/* Top bar */}
          <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
            <Pressable
              onPress={handleCancel}
              hitSlop={10}
              accessibilityRole="button"
            >
              <Text style={styles.topAction}>Cancel</Text>
            </Pressable>
            <Pressable onPress={commit} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.topAction, styles.topDone]}>Done</Text>
            </Pressable>
          </View>

          {/* Input — hidden while the ghost is flying in its place */}
          <View style={styles.inputWrap} pointerEvents="box-none">
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              multiline
              autoFocus={!flight}
              placeholder="Your text"
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              style={[
                styles.input,
                inputStyle,
                phase !== "editing" && styles.inputHidden,
              ]}
              keyboardAppearance="dark"
            />
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <View style={styles.controlRow}>
              {SIZES.map(({ label, size }) => {
                const active = size === fontSize;
                return (
                  <Pressable
                    key={label}
                    onPress={() => setFontSize(size)}
                    style={[styles.chip, active && styles.chipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
              <View style={styles.controlSpacer} />
              {familyDef.variants.length > 1 && (
                <Pressable
                  onPress={cycleWeight}
                  style={[
                    styles.chip,
                    variant.weight >= 700 && styles.chipActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Font weight"
                >
                  <Text
                    style={[
                      styles.chipText,
                      { fontWeight: `${variant.weight}` as "600" },
                      variant.weight >= 700 && styles.chipTextActive,
                    ]}
                  >
                    B
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={cycleAlign}
                style={styles.chip}
                accessibilityRole="button"
                accessibilityLabel="Text alignment"
              >
                <MaterialCommunityIcons
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  name={ALIGN_ICON[align as (typeof ALIGN_CYCLE)[number]] as any}
                  size={17}
                  color="#fff"
                />
              </Pressable>
              <Pressable
                onPress={cyclePill}
                style={[styles.chip, pillMode !== "none" && styles.chipActive]}
                accessibilityRole="button"
                accessibilityLabel="Text background"
              >
                <MaterialCommunityIcons
                  name={
                    pillMode === "translucent"
                      ? "format-color-highlight"
                      : "format-color-fill"
                  }
                  size={17}
                  color={pillMode !== "none" ? "#000" : "#fff"}
                />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.swatchRow}
              // First tap must hit the swatch, not dismiss the keyboard
              keyboardShouldPersistTaps="always"
            >
              {COLORS.map((swatch) => {
                const active = swatch === color;
                return (
                  <Pressable
                    key={swatch}
                    onPress={() => setColor(swatch)}
                    style={[
                      styles.swatch,
                      { backgroundColor: swatch },
                      active && styles.swatchActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Color ${swatch}`}
                  />
                );
              })}
            </ScrollView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.fontRow}
              // First tap must hit the font chip, not dismiss the keyboard
              keyboardShouldPersistTaps="always"
            >
              {FONT_FAMILY_IDS.map((familyId) => {
                const def = FONT_FAMILIES[familyId];
                const active = familyId === fontFamily;
                const chipVariant = resolveVariant(familyId, 400);
                return (
                  <Pressable
                    key={familyId}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setFontFamily(familyId);
                    }}
                    style={[styles.fontChip, active && styles.fontChipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Font ${def.label}`}
                  >
                    <Text
                      style={[
                        styles.fontChipText,
                        active && styles.fontChipTextActive,
                        fontsLoaded && { fontFamily: chipVariant.rnFamily },
                      ]}
                    >
                      {def.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        {/* The text itself, mid-flight between canvas and editing spot */}
        {flight && phase !== "editing" && ghostLayer && (
          <GhostText
            layer={ghostLayer}
            flight={flight}
            progress={flightProgress}
            targetScale={flightTargetScale}
          />
        )}
      </View>
    );
  },
);
TextEntryOverlay.displayName = "TextEntryOverlay";

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrim: {
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  topAction: {
    fontSize: 16,
    fontFamily: "InstrumentSans_500Medium",
    fontWeight: "500",
    color: "#fff",
  },
  topDone: {
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
  },
  inputWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  input: {
    maxHeight: 280,
  },
  inputHidden: {
    opacity: 0,
  },
  controls: {
    paddingBottom: 8,
    gap: 10,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  controlSpacer: {
    flex: 1,
  },
  chip: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: "#fff",
  },
  chipText: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#fff",
  },
  chipTextActive: {
    color: "#000",
  },
  swatchRow: {
    gap: 10,
    paddingHorizontal: 16,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  swatchActive: {
    borderWidth: 2.5,
    borderColor: "#fff",
  },
  fontRow: {
    gap: 8,
    paddingHorizontal: 16,
  },
  fontChip: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  fontChipActive: {
    backgroundColor: "#fff",
  },
  fontChipText: {
    fontSize: 14,
    color: "#fff",
  },
  fontChipTextActive: {
    color: "#000",
  },
});
