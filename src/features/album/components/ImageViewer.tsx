/**
 * ImageViewer Component
 * Full-screen media viewer with smooth animations
 * Optimized: No React state changes during animations
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  StyleSheet,
  Pressable,
  Dimensions,
  StatusBar,
  View,
  InteractionManager,
} from "react-native";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  runOnJS,
  Easing,
  SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import PagerView from "react-native-pager-view";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import * as MediaLibrary from "expo-media-library";
import { MediaAsset } from "../hooks";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const DURATION = 250;
const EASING = Easing.out(Easing.cubic);
const MAX_ZOOM = 4;

export interface ImagePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageViewerProps {
  assets: MediaAsset[];
  initialIndex: number;
  onIndexChange: (index: number) => void;
  sourcePosition?: ImagePosition | null;
  visible?: boolean;
  openKey: number;
  onClose: () => void;
  onCloseComplete: () => void;
}

const cleanUri = (u: string) => u.split("#")[0];

interface MediaPageProps {
  asset: MediaAsset;
  isCurrentPage: boolean;
  isNearby: boolean;
  onDismiss: () => void;
  dragY: SharedValue<number>;
  dismissScale: SharedValue<number>;
}

const MediaPage = React.memo<MediaPageProps>(
  ({ asset, isCurrentPage, isNearby, onDismiss, dragY, dismissScale }) => {
    const [fullResUri, setFullResUri] = useState<string | null>(null);
    const [videoUri, setVideoUri] = useState<string | null>(null);

    const isVideo = asset.mediaType === "video";

    const zoomScale = useSharedValue(1);
    const savedZoomScale = useSharedValue(1);
    const panOffsetX = useSharedValue(0);
    const panOffsetY = useSharedValue(0);
    const savedPanOffsetX = useSharedValue(0);
    const savedPanOffsetY = useSharedValue(0);

    useEffect(() => {
      if (!isNearby) return;

      let cancelled = false;
      const interaction = InteractionManager.runAfterInteractions(async () => {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(asset.id, {
            shouldDownloadFromNetwork: true,
          });
          if (cancelled) return;

          if (isVideo) {
            setFullResUri(cleanUri(asset.uri));
            setVideoUri(cleanUri(info.uri ?? asset.uri));
          } else {
            setFullResUri(cleanUri(info.localUri ?? info.uri ?? asset.uri));
          }
        } catch {
          if (cancelled) return;
          setFullResUri(cleanUri(asset.uri));
          if (isVideo) setVideoUri(cleanUri(asset.uri));
        }
      });

      return () => {
        cancelled = true;
        interaction?.cancel?.();
      };
    }, [asset.id, asset.uri, isVideo, isNearby]);

    const videoPlayer = useVideoPlayer(
      isCurrentPage && isVideo && videoUri ? videoUri : null,
      (player) => {
        player.loop = false;
        player.play();
      },
    );

    useEffect(() => {
      if (!isCurrentPage) {
        zoomScale.value = 1;
        panOffsetX.value = 0;
        panOffsetY.value = 0;
      }
    }, [isCurrentPage, zoomScale, panOffsetX, panOffsetY]);

    const pinchGesture = useMemo(
      () =>
        Gesture.Pinch()
          .enabled(!isVideo)
          .onStart(() => {
            savedZoomScale.value = zoomScale.value;
          })
          .onUpdate((e) => {
            zoomScale.value = Math.max(
              0.5,
              Math.min(MAX_ZOOM, savedZoomScale.value * e.scale),
            );
          })
          .onEnd(() => {
            if (zoomScale.value < 1) {
              zoomScale.value = withTiming(1, {
                duration: 200,
                easing: EASING,
              });
              panOffsetX.value = withTiming(0, {
                duration: 200,
                easing: EASING,
              });
              panOffsetY.value = withTiming(0, {
                duration: 200,
                easing: EASING,
              });
            } else if (zoomScale.value > MAX_ZOOM) {
              zoomScale.value = withTiming(MAX_ZOOM, {
                duration: 200,
                easing: EASING,
              });
            }
          }),
      [isVideo, zoomScale, savedZoomScale, panOffsetX, panOffsetY],
    );

    const panGesture = useMemo(
      () =>
        Gesture.Pan()
          .minPointers(1)
          .maxPointers(2)
          .activeOffsetY([-10, 10])
          .onStart(() => {
            if (!isVideo && zoomScale.value > 1.05) {
              savedPanOffsetX.value = panOffsetX.value;
              savedPanOffsetY.value = panOffsetY.value;
            }
          })
          .onUpdate((e) => {
            if (!isVideo && zoomScale.value > 1.05) {
              panOffsetX.value = savedPanOffsetX.value + e.translationX;
              panOffsetY.value = savedPanOffsetY.value + e.translationY;
            } else {
              dragY.value = e.translationY;
              dismissScale.value = interpolate(
                Math.abs(e.translationY),
                [0, 300],
                [1, 0.75],
                "clamp",
              );
            }
          })
          .onEnd((e) => {
            if (!isVideo && zoomScale.value > 1.05) {
              const maxPanX = (SCREEN_WIDTH * (zoomScale.value - 1)) / 2;
              const maxPanY = (SCREEN_HEIGHT * (zoomScale.value - 1)) / 2;
              if (Math.abs(panOffsetX.value) > maxPanX) {
                panOffsetX.value = withTiming(
                  Math.sign(panOffsetX.value) * maxPanX,
                  { duration: 200 },
                );
              }
              if (Math.abs(panOffsetY.value) > maxPanY) {
                panOffsetY.value = withTiming(
                  Math.sign(panOffsetY.value) * maxPanY,
                  { duration: 200 },
                );
              }
            } else {
              const shouldDismiss =
                Math.abs(e.translationY) > 100 || Math.abs(e.velocityY) > 800;

              if (shouldDismiss) {
                runOnJS(onDismiss)();
              } else {
                dragY.value = withSpring(0, { damping: 16, stiffness: 240 });
                dismissScale.value = withSpring(1, {
                  damping: 16,
                  stiffness: 240,
                });
              }
            }
          }),
      [
        isVideo,
        zoomScale,
        panOffsetX,
        panOffsetY,
        savedPanOffsetX,
        savedPanOffsetY,
        dragY,
        dismissScale,
        onDismiss,
      ],
    );

    const doubleTapGesture = useMemo(
      () =>
        Gesture.Tap()
          .numberOfTaps(2)
          .enabled(!isVideo)
          .onEnd(() => {
            if (zoomScale.value > 1.05) {
              zoomScale.value = withTiming(1, {
                duration: 250,
                easing: EASING,
              });
              panOffsetX.value = withTiming(0, {
                duration: 250,
                easing: EASING,
              });
              panOffsetY.value = withTiming(0, {
                duration: 250,
                easing: EASING,
              });
            } else {
              zoomScale.value = withTiming(2, {
                duration: 250,
                easing: EASING,
              });
            }
          }),
      [isVideo, zoomScale, panOffsetX, panOffsetY],
    );

    const composedGesture = useMemo(
      () => Gesture.Simultaneous(doubleTapGesture, pinchGesture, panGesture),
      [doubleTapGesture, pinchGesture, panGesture],
    );

    const zoomStyle = useAnimatedStyle(() => ({
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
      transform: [
        { scale: zoomScale.value },
        { translateX: panOffsetX.value / zoomScale.value },
        { translateY: panOffsetY.value / zoomScale.value },
      ],
    }));

    const imageUri = fullResUri || asset.uri;

    return (
      <GestureDetector gesture={composedGesture}>
        <View style={styles.mediaPage}>
          <Animated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
            {isNearby && (
              <Image
                source={{ uri: imageUri }}
                style={styles.mediaFill}
                contentFit="contain"
                transition={0}
                cachePolicy="memory-disk"
              />
            )}
          </Animated.View>
          {isVideo && isCurrentPage && videoUri && videoPlayer && (
            <VideoView
              player={videoPlayer}
              style={[StyleSheet.absoluteFill, styles.mediaFill]}
              contentFit="contain"
              nativeControls
            />
          )}
        </View>
      </GestureDetector>
    );
  },
  (prev, next) =>
    prev.asset.id === next.asset.id &&
    prev.isCurrentPage === next.isCurrentPage &&
    prev.isNearby === next.isNearby,
);

MediaPage.displayName = "MediaPage";

export const ImageViewer: React.FC<ImageViewerProps> = ({
  assets,
  initialIndex,
  onIndexChange,
  sourcePosition,
  openKey,
  onClose,
  onCloseComplete,
}) => {
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const prevOpenKey = useRef(-1);
  const savedInitialIndex = useRef(initialIndex);
  const isClosingRef = useRef(false);
  const openAnimationFrame = useRef<number | null>(null);

  // All animation controlled by shared values - no state changes during animation
  const isActive = useSharedValue(false);
  const progress = useSharedValue(0);
  const pagerOpacity = useSharedValue(0);

  const srcX = useSharedValue(0);
  const srcY = useSharedValue(0);
  const srcW = useSharedValue(120);
  const srcH = useSharedValue(120);

  const dragY = useSharedValue(0);
  const dismissScale = useSharedValue(1);

  // Open handler
  useEffect(() => {
    if (assets.length === 0 || openKey === prevOpenKey.current) return;
    prevOpenKey.current = openKey;
    isClosingRef.current = false;

    setCurrentIndex(initialIndex);
    savedInitialIndex.current = initialIndex;

    // Reset all values
    dragY.value = 0;
    dismissScale.value = 1;
    progress.value = 0;
    pagerOpacity.value = 0;

    if (sourcePosition) {
      srcX.value = sourcePosition.x;
      srcY.value = sourcePosition.y;
      srcW.value = sourcePosition.width;
      srcH.value = sourcePosition.height;
    } else {
      srcX.value = SCREEN_WIDTH / 2 - 60;
      srcY.value = SCREEN_HEIGHT / 2 - 60;
      srcW.value = 120;
      srcH.value = 120;
    }

    // Set pager page
    pagerRef.current?.setPageWithoutAnimation(initialIndex);

    if (openAnimationFrame.current !== null) {
      cancelAnimationFrame(openAnimationFrame.current);
    }

    // Defer kick-off to the next frame so layout is stable before animating
    openAnimationFrame.current = requestAnimationFrame(() => {
      isActive.value = true;
      progress.value = withTiming(1, { duration: DURATION, easing: EASING });
      // Fade in pager slightly after frame reaches full size
      pagerOpacity.value = withTiming(1, {
        duration: DURATION * 0.6,
        easing: EASING,
      });
    });

    return () => {
      if (openAnimationFrame.current !== null) {
        cancelAnimationFrame(openAnimationFrame.current);
        openAnimationFrame.current = null;
      }
    };
  }, [
    openKey,
    assets.length,
    initialIndex,
    sourcePosition,
    isActive,
    progress,
    pagerOpacity,
    dragY,
    dismissScale,
    srcX,
    srcY,
    srcW,
    srcH,
  ]);

  const finishClose = useCallback(() => {
    isActive.value = false;
    onCloseComplete();
  }, [isActive, onCloseComplete]);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const didSwipe = currentIndex !== savedInitialIndex.current;

    // Reset drag
    dragY.value = withTiming(0, { duration: 150 });
    dismissScale.value = withTiming(1, { duration: 150 });

    // Notify close immediately
    onClose();

    if (didSwipe) {
      // Fade out
      pagerOpacity.value = withTiming(0, { duration: 200, easing: EASING });
      progress.value = withTiming(
        0,
        { duration: 200, easing: EASING },
        (finished) => {
          if (finished) runOnJS(finishClose)();
        },
      );
    } else {
      // Animate back to thumbnail
      pagerOpacity.value = withTiming(0, {
        duration: DURATION * 0.4,
        easing: EASING,
      });
      progress.value = withTiming(
        0,
        { duration: DURATION, easing: EASING },
        (finished) => {
          if (finished) runOnJS(finishClose)();
        },
      );
    }
  }, [
    currentIndex,
    onClose,
    finishClose,
    progress,
    pagerOpacity,
    dragY,
    dismissScale,
  ]);

  const handlePageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      const newIndex = e.nativeEvent.position;
      setCurrentIndex(newIndex);
      onIndexChange(newIndex);
    },
    [onIndexChange],
  );

  const pages = useMemo(
    () => assets.map((asset, index) => ({ asset, index, key: asset.id })),
    [assets],
  );

  // Container visibility
  const containerStyle = useAnimatedStyle(() => ({
    opacity: isActive.value ? 1 : 0,
    pointerEvents: isActive.value ? ("auto" as const) : ("none" as const),
  }));

  // Backdrop
  const backdropStyle = useAnimatedStyle(() => {
    const dragFade = interpolate(
      Math.abs(dragY.value),
      [0, 250],
      [1, 0.3],
      "clamp",
    );
    return { opacity: progress.value * dragFade };
  });

  // Animated frame - visible during open/close animation
  const frameStyle = useAnimatedStyle(() => {
    const p = progress.value;
    // Frame fades out as pager fades in
    const frameOpacity = interpolate(
      pagerOpacity.value,
      [0, 0.5],
      [1, 0],
      "clamp",
    );
    return {
      position: "absolute" as const,
      left: interpolate(p, [0, 1], [srcX.value, 0]),
      top: interpolate(p, [0, 1], [srcY.value, 0]),
      width: interpolate(p, [0, 1], [srcW.value, SCREEN_WIDTH]),
      height: interpolate(p, [0, 1], [srcH.value, SCREEN_HEIGHT]),
      borderRadius: interpolate(p, [0, 0.5], [4, 0], "clamp"),
      overflow: "hidden" as const,
      opacity: frameOpacity,
    };
  });

  // Pager - fades in after frame expands
  const pagerStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: pagerOpacity.value,
    transform: [{ translateY: dragY.value }, { scale: dismissScale.value }],
  }));

  // Close button
  const buttonStyle = useAnimatedStyle(() => {
    const dragHide = interpolate(
      Math.abs(dragY.value),
      [0, 80],
      [1, 0],
      "clamp",
    );
    return {
      opacity: pagerOpacity.value * dragHide,
    };
  });

  if (assets.length === 0) return null;

  const initialAsset = assets[savedInitialIndex.current];

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.container, containerStyle]}
    >
      <StatusBar barStyle="light-content" />

      <Animated.View style={[styles.backdrop, backdropStyle]} />

      {/* Animated frame for open/close */}
      {initialAsset && (
        <Animated.View style={frameStyle} pointerEvents="none">
          <Image
            source={{ uri: initialAsset.uri }}
            style={styles.mediaFill}
            contentFit="contain"
            transition={0}
            cachePolicy="memory-disk"
          />
        </Animated.View>
      )}

      {/* PagerView - always rendered, opacity controlled by shared value */}
      <Animated.View style={[StyleSheet.absoluteFill, pagerStyle]}>
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={initialIndex}
          onPageSelected={handlePageSelected}
          offscreenPageLimit={1}
          overdrag
        >
          {pages.map(({ asset, index, key }) => (
            <View key={key} collapsable={false} style={styles.page}>
              <MediaPage
                asset={asset}
                isCurrentPage={index === currentIndex}
                isNearby={Math.abs(index - currentIndex) <= 1}
                onDismiss={handleClose}
                dragY={dragY}
                dismissScale={dismissScale}
              />
            </View>
          ))}
        </PagerView>
      </Animated.View>

      <Animated.View
        style={[styles.closeWrap, { top: insets.top + 10 }, buttonStyle]}
      >
        <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={12}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  mediaPage: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  mediaFill: {
    width: "100%",
    height: "100%",
  },
  closeWrap: {
    position: "absolute",
    left: 14,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(50,50,50,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default ImageViewer;
