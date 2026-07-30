/**
 * LastCaptureThumbnail Component
 * iOS-camera-style thumbnail of the most recent capture (photo OR video),
 * docked to the left of the capture button. Pops in with a spring when the
 * user takes a capture (the caller's popSignal) — NOT whenever the uri
 * changes: the merged library swaps each entry's local file uri for the
 * server url as its upload settles, and popping on every swap made the
 * thumb jitter through a whole queue drain. Those swaps just crossfade.
 *
 * The thumbnail does NOT own a viewer: tapping it hands the caller the
 * thumb's window frame, and the caller opens the shared PhotoViewer flying
 * out of that rect. (It used to carry a second, complete fullscreen viewer
 * for the device roll — unreachable once every call site passed onPress.)
 *
 * Video thumbs paint their POSTER image (server- or queue-generated) under
 * a play glyph. Only when no poster exists does a tiny paused, muted
 * expo-video view stand in — expo-image can't paint a frame from a raw
 * video file, and a video player can't paint a poster JPEG.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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

import { font } from "@/lib/tokens";

const THUMB_SIZE = 56;

export interface LastCapture {
  /** The media itself (photo image, or the video file). */
  uri: string;
  /** Poster/thumbnail image; preferred for display when present. */
  posterUri?: string | null;
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
  /** Captures still uploading — shown as a corner tally (0 hides it). */
  badgeCount?: number;
  /**
   * Bump on each in-session capture to run the pop-in spring. Data-only
   * changes (upload settling, library refetch) leave it alone and the
   * thumbnail stays put.
   */
  popSignal?: number;
}

export const LastCaptureThumbnail: React.FC<LastCaptureThumbnailProps> = ({
  capture,
  onPress,
  badgeCount = 0,
  popSignal = 0,
}) => {
  // Visible from the first frame — no entrance animation on mount
  const pop = useSharedValue(1);
  // Window frame source for the caller-owned viewer's zoom flight
  const thumbRef = useRef<View>(null);

  const uri = capture?.uri ?? null;
  const posterUri = capture?.posterUri ?? null;
  const isVideoThumb = capture?.mediaType === "video";
  // A poster image beats decoding video; the player is the last resort
  const useVideoFallback = isVideoThumb && !posterUri;

  // Tiny paused preview for a posterless video thumb — muted, never
  // played, no controls; just the first frame under a play glyph
  const thumbPlayer = useVideoPlayer(useVideoFallback ? uri : null, (p) => {
    p.loop = false;
    p.muted = true;
  });

  useEffect(() => {
    // 0 is the mount value — only real captures (bumps) animate
    if (popSignal > 0) {
      pop.value = 0;
      pop.value = withSpring(1, { damping: 14, stiffness: 220 });
    }
  }, [popSignal, pop]);

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
        {useVideoFallback ? (
          <VideoView
            player={thumbPlayer}
            style={styles.thumbImage}
            contentFit="cover"
            nativeControls={false}
            pointerEvents="none"
          />
        ) : (
          <Image
            source={{
              uri: posterUri ?? uri,
              cacheKey: stableCacheKey(posterUri ?? uri),
            }}
            style={styles.thumbImage}
            contentFit="cover"
            transition={120}
          />
        )}
        {isVideoThumb && (
          <View style={styles.thumbPlayOverlay} pointerEvents="none">
            <Ionicons name="play" size={14} color="rgba(255, 255, 255, 0.95)" />
          </View>
        )}
      </Pressable>
      {badgeCount > 0 && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>
            {badgeCount > 99 ? "99+" : badgeCount}
          </Text>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.25)",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  badge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: "#111",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    ...font.bold,
    fontSize: 11,
    color: "#fff",
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
