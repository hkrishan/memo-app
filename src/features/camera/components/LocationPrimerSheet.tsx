/**
 * LocationPrimerSheet
 * Shown ONCE, the first time the camera becomes visible with location
 * permission still undetermined — it now owns the OS location prompt
 * (useCaptureLocation no longer requests, only reads). A live map with
 * photo-style pins springing in shows what the permission actually buys:
 * captures pinned on the album's shared map. Dark, matching the camera UI.
 *
 * The map is decorative: non-interactive, a slow zoom-out plays while the
 * sheet is up, and the pins are screen-positioned (not geo-anchored) so
 * reanimated can drive them without marker re-render jank.
 */

import React, { memo, useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import MapView from "react-native-maps";
import Animated, {
  Easing,
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import Sheet from "@/components/ui/Sheet";
import { flowStyles } from "@/features/auth/screens/phone/phoneFlowShared";
import { font, scriptType } from "@/lib/tokens";

interface LocationPrimerSheetProps {
  visible: boolean;
  /** Fire the OS prompt (parent requests, marks seen, closes). */
  onAllow: () => void;
  /** "Not now" or backdrop tap (parent marks seen, closes). */
  onDismiss: () => void;
}

// Somewhere with texture at street level; which city is irrelevant —
// the map is a backdrop, the pins carry the story.
const START_REGION = {
  latitude: 48.8584,
  longitude: 2.2945,
  latitudeDelta: 0.018,
  longitudeDelta: 0.018,
};
const END_REGION = { ...START_REGION, latitudeDelta: 0.05, longitudeDelta: 0.05 };
const ZOOM_OUT_MS = 9000;

// Muted "photo" fills for the decorative pins — deliberately not real
// images, so the sheet never implies these are the user's photos.
const PINS: Array<{
  colors: [string, string];
  style: { top?: number; bottom?: number; left?: string | number; right?: string | number };
  delay: number;
}> = [
  { colors: ["#c9a98d", "#8d6f56"], style: { top: 34, left: "16%" }, delay: 250 },
  { colors: ["#7f8c99", "#4a5561"], style: { top: 96, right: "20%" }, delay: 420 },
  { colors: ["#87a08b", "#5c7361"], style: { bottom: 30, left: "34%" }, delay: 590 },
];

/** Blue "you are here" dot with a soft expanding pulse ring. */
const PulsingDot: React.FC = () => {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [pulse]);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 1.9 }],
    opacity: 0.45 * (1 - pulse.value),
  }));
  return (
    <View style={styles.dotWrap} pointerEvents="none">
      <Animated.View style={[styles.dotRing, ringStyle]} />
      <View style={styles.dot} />
    </View>
  );
};

const LocationPrimerSheet = memo<LocationPrimerSheetProps>(
  ({ visible, onAllow, onDismiss }) => {
    const mapRef = useRef<MapView>(null);

    // Slow Ken Burns zoom-out once the sheet has slid in. Content mounts
    // fresh each time the Modal shows, so this runs per presentation.
    useEffect(() => {
      if (!visible) return;
      const timer = setTimeout(() => {
        mapRef.current?.animateToRegion(END_REGION, ZOOM_OUT_MS);
      }, 600);
      return () => clearTimeout(timer);
    }, [visible]);

    return (
      <Sheet visible={visible} onClose={onDismiss} tone="dark">
        <View style={styles.content}>
          <Animated.View entering={FadeInDown.duration(300)} style={styles.mapBlock}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={START_REGION}
              pointerEvents="none"
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              showsCompass={false}
              toolbarEnabled={false}
            />
            {PINS.map((pin) => (
              <Animated.View
                key={pin.delay}
                entering={ZoomIn.springify().damping(14).delay(pin.delay)}
                style={[styles.pin, pin.style as object]}
              >
                <LinearGradient colors={pin.colors} style={StyleSheet.absoluteFill} />
              </Animated.View>
            ))}
            <PulsingDot />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(100)}>
            <Text style={styles.title}>
              Put your memories{"\n"}
              <Text style={styles.titleAccent}>on the map</Text>
            </Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.duration(300).delay(160)}>
            <Text style={flowStyles.subtitle}>
              With location on, each photo pins itself where it was taken —
              your albums build a map of everywhere you've been together.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(220)}>
            <Text style={styles.settingsHint}>
              Only while using the app. Change it anytime in Settings.
            </Text>
            <Pressable
              style={[flowStyles.primaryButton, styles.button]}
              onPress={onAllow}
              accessibilityRole="button"
            >
              <Text style={flowStyles.primaryButtonText}>Enable location</Text>
            </Pressable>
            <Pressable
              style={styles.skipButton}
              onPress={onDismiss}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>Not now</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Sheet>
    );
  },
);
LocationPrimerSheet.displayName = "LocationPrimerSheet";

const PIN_SIZE = 46;

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  mapBlock: {
    height: 230,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#2c2c2e",
  },
  pin: {
    position: "absolute",
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#fff",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dotWrap: {
    position: "absolute",
    top: "56%",
    left: "56%",
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dotRing: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#0A84FF",
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#0A84FF",
    borderWidth: 2.5,
    borderColor: "#fff",
  },
  title: {
    marginTop: 24,
    fontSize: 26,
    ...font.bold,
    letterSpacing: -0.5,
    lineHeight: 34,
    color: "#fff",
  },
  titleAccent: {
    ...scriptType(26),
    letterSpacing: 0,
    color: "#fff",
  },
  settingsHint: {
    marginTop: 24,
    fontSize: 13,
    color: "#6e6e73",
    textAlign: "center",
  },
  button: {
    marginTop: 14,
  },
  skipButton: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 2,
  },
  skipText: {
    fontSize: 15,
    color: "#8e8e93",
  },
});

export default LocationPrimerSheet;
