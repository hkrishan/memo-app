/**
 * LastCaptureThumbnail Component
 * iOS-camera-style thumbnail of the most recent capture (photo OR video),
 * docked to the left of the capture button. Pops in with a spring whenever
 * the capture changes.
 *
 * The thumbnail does NOT own a viewer: tapping it hands the caller the
 * thumb's window frame, and the caller opens the shared PhotoViewer flying
 * out of that rect. (It used to carry a second, complete fullscreen viewer
 * for the device roll — unreachable once every call site passed onPress.)
 *
 * Video thumbs render a tiny paused, muted expo-video view under a play
 * glyph; expo-image can't paint a frame from a raw video file.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { stableCacheKey } from "@/lib/imageCache";
import type { Frame } from "@/features/photos/components";

const THUMB_SIZE = 46;

export interface LastCapture {
  /** Displayable/playable uri of the latest capture. */
  uri: string;
  mediaType: "photo" | "video";
}

interface LastCaptureThumbnailProps {
  /** Latest library/session capture; null renders nothing. */
  capture: LastCapture | null;
  /**
   * Opens the caller's viewer. Receives the thumbnail's window frame so the
   * viewer can zoom-fly out of it (null when it couldn't be measured, which
   * degrades to the viewer's fade).
   */
  onPress: (originFrame: Frame | null) => void;
}

export const LastCaptureThumbnail: React.FC<LastCaptureThumbnailProps> = ({
  capture,
  onPress,
}) => {
  const pop = useSharedValue(0);
  // Window frame source for the caller-owned viewer's zoom flight
  const thumbRef = useRef<View>(null);

  const uri = capture?.uri ?? null;
  const isVideoThumb = capture?.mediaType === "video";

  // Tiny paused preview for a video thumb — muted, never played, no
  // controls; just the first frame under a play glyph
  const thumbPlayer = useVideoPlayer(isVideoThumb ? uri : null, (p) => {
    p.loop = false;
    p.muted = true;
  });

  useEffect(() => {
    if (uri) {
      pop.value = 0;
      pop.value = withSpring(1, { damping: 14, stiffness: 220 });
    }
  }, [uri, pop]);

  const popStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.6 + 0.4 * pop.value }],
  }));

  const handlePress = useCallback(() => {
    Haptics.selectionAsync();
    const node = thumbRef.current;
    if (!node) {
      onPress(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      onPress(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  }, [onPress]);

  if (!uri || !capture) {
    return null;
  }

  return (
    <Animated.View style={popStyle}>
      <Pressable
        ref={thumbRef}
        onPress={handlePress}
        style={({ pressed }) => [styles.thumb, pressed && styles.pressed]}
        accessibilityRole="imagebutton"
        accessibilityLabel="View your photos and videos"
      >
        {isVideoThumb ? (
          <>
            <VideoView
              player={thumbPlayer}
              style={styles.thumbImage}
              contentFit="cover"
              nativeControls={false}
              pointerEvents="none"
            />
            <View style={styles.thumbPlayOverlay} pointerEvents="none">
              <Ionicons
                name="play"
                size={14}
                color="rgba(255, 255, 255, 0.95)"
              />
            </View>
          </>
        ) : (
          <Image
            source={{ uri, cacheKey: stableCacheKey(uri) }}
            style={styles.thumbImage}
            contentFit="cover"
            transition={120}
          />
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.9)",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  pressed: {
    opacity: 0.8,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  thumbPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.15)",
  },
});

export default LastCaptureThumbnail;
