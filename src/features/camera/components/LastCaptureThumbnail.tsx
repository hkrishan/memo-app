/**
 * LastCaptureThumbnail Component
 * iOS-camera-style thumbnail of the most recent capture (photo OR video),
 * docked to the left of the capture button. Pops in with a spring whenever
 * the capture changes. Tapping opens a fullscreen viewer that pages
 * horizontally through the device library (newest first), like swiping the
 * camera roll from the iOS camera.
 *
 * Video support:
 * - The docked thumb renders a tiny paused (muted) expo-video view with a
 *   play glyph when the newest item is a video.
 * - Viewer slides for videos mount an expo-video player only while the
 *   slide is the visible page (tracked via onViewableItemsChanged; FlatList
 *   windowing unmounts far slides anyway). Tapping a video slide toggles
 *   play/pause — dismissal there is the close button only. Photo slides
 *   still dismiss on tap.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  ListRenderItemInfo,
  Modal,
  Pressable,
  StyleSheet,
  View,
  ViewToken,
} from "react-native";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "react-native-paper";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useResolvedAssetUri } from "@/features/album/hooks";
import { stableCacheKey } from "@/lib/imageCache";

const THUMB_SIZE = 46;
const PAGE_SIZE = 60;
const SCREEN_WIDTH = Dimensions.get("window").width;

type RollMediaType = "photo" | "video";

type RollItem = {
  id: string;
  uri: string;
  mediaType: RollMediaType;
  /** Seconds; 0 when unknown. */
  duration: number;
};

/** m:ss video duration label (e.g. 83 -> "1:23"). */
const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------
// Video slide — player exists only while the slide is the visible page
// ---------------------------------------------------------------------------

interface RollVideoSlideProps {
  item: RollItem;
  /** True only for the visible page — gates player creation/playback. */
  isActive: boolean;
}

const RollVideoSlide: React.FC<RollVideoSlideProps> = ({ item, isActive }) => {
  // ph:// asset uris are not reliably playable — resolve lazily, only once
  // the slide is actually looked at
  const { resolvedUri } = useResolvedAssetUri({
    assetId: item.id,
    uri: item.uri,
    enabled: isActive,
  });

  // Null source while inactive: no player resources held, nothing plays.
  // (The hook re-creates the player when the source flips.)
  const player = useVideoPlayer(isActive ? resolvedUri : null, (p) => {
    p.loop = false;
  });
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  // Paused first frame when the slide appears; pause when scrolled away
  useEffect(() => {
    if (!isActive) {
      try {
        player.pause();
      } catch {
        // Player may already be released
      }
    }
  }, [isActive, player]);

  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  useEffect(() => {
    if (!isActive) setFirstFrameRendered(false);
  }, [isActive]);
  const handleFirstFrame = useCallback(() => setFirstFrameRendered(true), []);

  // Tap anywhere on a video slide toggles playback (never dismisses)
  const handleToggle = useCallback(() => {
    try {
      if (player.playing) {
        player.pause();
      } else {
        // Replay from the start when the video ran to its end
        if (
          player.duration > 0 &&
          player.currentTime >= player.duration - 0.05
        ) {
          player.currentTime = 0;
        }
        player.play();
      }
    } catch {
      // Player may already be released
    }
  }, [player]);

  const showPlayer = isActive && !!resolvedUri;

  return (
    <Pressable style={styles.slide} onPress={handleToggle}>
      {showPlayer && (
        <VideoView
          player={player}
          style={styles.slideImage}
          contentFit="contain"
          nativeControls={false}
          onFirstFrameRender={handleFirstFrame}
        />
      )}
      {/* Poster (expo-image renders ph:// video uris as poster frames)
          until the player's first frame paints, so no black flash */}
      {(!showPlayer || !firstFrameRendered) && (
        <Image
          source={{ uri: item.uri, cacheKey: stableCacheKey(item.uri) }}
          style={[StyleSheet.absoluteFill, styles.slideImage]}
          contentFit="contain"
          recyclingKey={`${item.id}-poster`}
          transition={80}
        />
      )}
      {!isPlaying && (
        <View style={styles.slidePlayOverlay} pointerEvents="none">
          <View style={styles.slidePlayButton}>
            <Ionicons
              name="play"
              size={26}
              color="#fff"
              style={styles.slidePlayIconNudge}
            />
          </View>
        </View>
      )}
      {item.duration > 0 && (
        <View style={styles.slideDurationBadge} pointerEvents="none">
          <Text style={styles.slideDurationText}>
            {formatDuration(item.duration)}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// Docked thumbnail + viewer
// ---------------------------------------------------------------------------

export interface LastCapture {
  /** Displayable/playable uri of the latest capture. */
  uri: string;
  mediaType: RollMediaType;
}

interface LastCaptureThumbnailProps {
  /** Latest library/session capture; null renders nothing. */
  capture: LastCapture | null;
  /**
   * Overrides the tap behavior. When set, tapping the thumbnail calls this
   * instead of opening the built-in device-library viewer (the main-tab
   * camera opens the Memo-library viewer this way). Receives the
   * thumbnail's window frame so the caller's viewer can zoom-fly from it.
   */
  onPress?: (originFrame: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null) => void;
}

export const LastCaptureThumbnail: React.FC<LastCaptureThumbnailProps> = ({
  capture,
  onPress,
}) => {
  const insets = useSafeAreaInsets();
  const [viewerOpen, setViewerOpen] = useState(false);
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

  // Camera-roll pages for the viewer. Refetched from scratch on each open
  // so freshly captured (auto-saved) media is included.
  const [rollItems, setRollItems] = useState<RollItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const endCursorRef = useRef<MediaLibrary.AssetRef | undefined>(undefined);
  const hasNextPageRef = useRef(true);
  const isLoadingPageRef = useRef(false);

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

  const fetchRollPage = useCallback(async (): Promise<RollItem[]> => {
    const page = await MediaLibrary.getAssetsAsync({
      first: PAGE_SIZE,
      after: endCursorRef.current,
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    endCursorRef.current = page.endCursor;
    hasNextPageRef.current = page.hasNextPage;
    // expo-image renders ph:// (iOS) and content:// (Android) asset uris
    return page.assets.map((asset) => ({
      id: asset.id,
      uri: asset.uri,
      mediaType: asset.mediaType === "video" ? "video" : "photo",
      duration: asset.duration,
    }));
  }, []);

  const openViewer = useCallback(async () => {
    Haptics.selectionAsync();
    if (onPress) {
      // Caller owns the viewer (main-tab camera → Memo library viewer).
      // Hand over the thumb's window frame for the zoom flight.
      const node = thumbRef.current;
      if (node) {
        node.measureInWindow((x, y, width, height) => {
          onPress(
            width > 0 && height > 0 ? { x, y, width, height } : null,
          );
        });
      } else {
        onPress(null);
      }
      return;
    }
    setActiveIndex(0);
    setViewerOpen(true);

    // Reload the roll fresh each open; the tapped capture shows immediately
    // as a single-item list while this resolves.
    endCursorRef.current = undefined;
    hasNextPageRef.current = true;
    isLoadingPageRef.current = true;
    try {
      let { status, canAskAgain } = await MediaLibrary.getPermissionsAsync();
      if (status !== "granted" && canAskAgain) {
        ({ status } = await MediaLibrary.requestPermissionsAsync());
      }
      if (status !== "granted") {
        setRollItems([]);
        return;
      }
      setRollItems(await fetchRollPage());
    } catch {
      setRollItems([]);
    } finally {
      isLoadingPageRef.current = false;
    }
  }, [fetchRollPage, onPress]);

  const loadMoreItems = useCallback(async () => {
    if (isLoadingPageRef.current || !hasNextPageRef.current) return;
    isLoadingPageRef.current = true;
    try {
      const nextPage = await fetchRollPage();
      setRollItems((prev) => [...prev, ...nextPage]);
    } catch {
      // Older pages just stop loading — what's loaded stays browsable
    } finally {
      isLoadingPageRef.current = false;
    }
  }, [fetchRollPage]);

  const closeViewer = useCallback(() => setViewerOpen(false), []);

  // Visible-page tracking: gates which video slide owns a live player.
  // FlatList requires a stable callback identity — hold it in a ref.
  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const visible = viewableItems.find((token) => token.isViewable);
      if (visible?.index != null) {
        setActiveIndex(visible.index);
      }
    },
  ).current;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  const renderSlide = useCallback(
    ({ item, index }: ListRenderItemInfo<RollItem>) => {
      if (item.mediaType === "video") {
        return <RollVideoSlide item={item} isActive={index === activeIndex} />;
      }
      // Photo slides keep the original behavior: tap to dismiss
      return (
        <Pressable style={styles.slide} onPress={closeViewer}>
          <Image
            source={{ uri: item.uri, cacheKey: stableCacheKey(item.uri) }}
            style={styles.slideImage}
            contentFit="contain"
            recyclingKey={item.id}
            transition={80}
          />
        </Pressable>
      );
    },
    [closeViewer, activeIndex],
  );

  if (!uri || !capture) {
    return null;
  }

  // Until (or unless) the roll loads, the viewer shows just the tapped item
  const viewerData: RollItem[] =
    rollItems.length > 0
      ? rollItems
      : [
          {
            id: "last-capture",
            uri,
            mediaType: capture.mediaType,
            duration: 0,
          },
        ];

  return (
    <>
      <Animated.View style={popStyle}>
        <Pressable
          ref={thumbRef}
          onPress={openViewer}
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

      {/* Fullscreen roll viewer — swipe horizontally through the library.
          Photos dismiss on tap; video slides play/pause on tap, so the
          close button is the way out there. */}
      <Modal
        visible={viewerOpen}
        transparent
        animationType="fade"
        onRequestClose={closeViewer}
      >
        <View style={styles.viewer}>
          <FlatList
            data={viewerData}
            keyExtractor={(item) => item.id}
            renderItem={renderSlide}
            extraData={activeIndex}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onEndReached={loadMoreItems}
            onEndReachedThreshold={2}
            initialNumToRender={2}
            maxToRenderPerBatch={3}
            windowSize={5}
            removeClippedSubviews
          />
          <Pressable
            onPress={closeViewer}
            hitSlop={8}
            style={({ pressed }) => [
              styles.viewerClose,
              { top: insets.top + 8 },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close photos"
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </>
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
    opacity: 0.7,
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
  viewer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.96)",
  },
  slide: {
    width: SCREEN_WIDTH,
    height: "100%",
    justifyContent: "center",
  },
  slideImage: {
    width: "100%",
    height: "100%",
  },
  slidePlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  slidePlayButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(20, 20, 22, 0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  slidePlayIconNudge: {
    marginLeft: 3,
  },
  slideDurationBadge: {
    position: "absolute",
    left: 14,
    bottom: 16,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  slideDurationText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  viewerClose: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default LastCaptureThumbnail;
