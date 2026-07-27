/**
 * PhotoSaveSheet Component
 * Post-capture confirmation. The frame shrinks into a bottom-left thumbnail,
 * then a compact sheet slides up confirming the capture was saved to its base
 * destination (highlighted) plus small secondary lines for any extras that
 * were actually performed. Offers a few follow-up actions. The camera stays
 * live behind it the whole time.
 *
 * The drop/dock/expand choreography is unchanged — only the sheet CONTENT
 * and props differ.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';

import { Album } from '@/features/album/types/album.types';
import { DestinationPickerSheet } from './DestinationPickerSheet';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const THUMB_WIDTH = 64;
const THUMB_HEIGHT = 84;
const THUMB_LEFT = 20;
const SHEET_CONTENT_HEIGHT = 300;

/** base action: 'saving' (in flight) | 'saved' | 'failed' (offline/denied) */
export type PhotoSaveStatus = 'saving' | 'saved' | 'failed';

interface PhotoSaveSheetProps {
  /** file:// uri of the captured photo; null hides the sheet */
  photoUri: string | null;
  status: PhotoSaveStatus;
  /** Highlighted base destination name, e.g. "Memo" or "Gallery". */
  baseName: string;
  /** Secondary lines for extras actually performed, e.g. "Camera roll". */
  extraLines: string[];
  /** Albums for the one-off "Add to album" picker. */
  albums: Album[] | undefined;
  /** Show the "Save to camera roll" action. */
  canSaveToCameraRoll: boolean;
  /** Title for the one-off album picker. */
  albumPickerTitle: string;
  /** Remove the just-saved item (base + any extras, best-effort). */
  onRemove: () => void;
  /** Write the captured file to the device camera roll. */
  onSaveToCameraRoll: () => void;
  /** One-off: copy into a chosen album. */
  onAddToAlbum: (albumId: string) => void;
  /** Retry a failed base save. */
  onRetry: () => void;
  /** Keep the photo and close the sheet (dismiss = accept). */
  onDismiss: () => void;
}

export const PhotoSaveSheet: React.FC<PhotoSaveSheetProps> = ({
  photoUri,
  status,
  baseName,
  extraLines,
  albums,
  canSaveToCameraRoll,
  albumPickerTitle,
  onRemove,
  onSaveToCameraRoll,
  onAddToAlbum,
  onRetry,
  onDismiss,
}) => {
  const insets = useSafeAreaInsets();
  const sheetHeight = SHEET_CONTENT_HEIGHT + insets.bottom;
  const thumbTop = SCREEN_HEIGHT - sheetHeight + 16;

  const dropProgress = useSharedValue(0);
  const sheetProgress = useSharedValue(0);
  const exitOpacity = useSharedValue(1);
  const [mounted, setMounted] = useState(false);
  // Docked = the initial shrink finished; only a docked thumb can expand
  const [docked, setDocked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // One-off "Add to album" picker
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);

  useEffect(() => {
    if (photoUri) {
      dropProgress.value = 0;
      sheetProgress.value = 0;
      exitOpacity.value = 1;
      setMounted(true);
      setDocked(false);
      setExpanded(false);
      setShowAlbumPicker(false);
      dropProgress.value = withTiming(
        1,
        {
          duration: 480,
          easing: Easing.out(Easing.cubic),
        },
        (finished) => {
          if (finished) {
            runOnJS(setDocked)(true);
          }
        },
      );
      sheetProgress.value = withDelay(
        400,
        withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }),
      );
    } else {
      setMounted(false);
    }
  }, [photoUri, dropProgress, sheetProgress, exitOpacity]);

  // Zoom state for the expanded preview (pinch + pan + double-tap)
  const zoomScale = useSharedValue(1);
  const zoomSavedScale = useSharedValue(1);
  const zoomTx = useSharedValue(0);
  const zoomTy = useSharedValue(0);
  const zoomSavedTx = useSharedValue(0);
  const zoomSavedTy = useSharedValue(0);

  const resetZoom = (animated: boolean) => {
    if (animated) {
      zoomScale.value = withTiming(1, { duration: 200 });
      zoomTx.value = withTiming(0, { duration: 200 });
      zoomTy.value = withTiming(0, { duration: 200 });
    } else {
      zoomScale.value = 1;
      zoomTx.value = 0;
      zoomTy.value = 0;
    }
    zoomSavedScale.value = 1;
    zoomSavedTx.value = 0;
    zoomSavedTy.value = 0;
  };

  // Tap the docked thumb: the photo grows back to fullscreen (the dock
  // animation in reverse) while the sheet slides away; tap again to re-dock
  const handleExpand = () => {
    if (!docked || expanded) return;
    setExpanded(true);
    resetZoom(false);
    sheetProgress.value = withTiming(0, {
      duration: 200,
      easing: Easing.out(Easing.quad),
    });
    dropProgress.value = withTiming(0, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  };

  const handleCollapse = () => {
    if (!expanded) return;
    setExpanded(false);
    // Ease any zoom back out while the frame docks
    resetZoom(true);
    dropProgress.value = withTiming(1, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
    sheetProgress.value = withDelay(
      220,
      withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }),
    );
  };

  const handlePhotoPress = () => {
    if (expanded) {
      handleCollapse();
    } else {
      handleExpand();
    }
  };

  // Clamp pan so the zoomed photo's edges pin to the screen edges
  const clampPan = (value: number, extent: number, scale: number) => {
    'worklet';
    const bound = (extent * (scale - 1)) / 2;
    return Math.min(Math.max(value, -bound), bound);
  };

  const pinchGesture = Gesture.Pinch()
    .enabled(expanded)
    .onStart(() => {
      zoomSavedScale.value = zoomScale.value;
    })
    .onUpdate((e) => {
      zoomScale.value = Math.min(
        Math.max(zoomSavedScale.value * e.scale, 1),
        4,
      );
      zoomTx.value = clampPan(zoomTx.value, SCREEN_WIDTH, zoomScale.value);
      zoomTy.value = clampPan(zoomTy.value, SCREEN_HEIGHT, zoomScale.value);
    })
    .onEnd(() => {
      if (zoomScale.value < 1.02) {
        zoomScale.value = withTiming(1, { duration: 180 });
        zoomTx.value = withTiming(0, { duration: 180 });
        zoomTy.value = withTiming(0, { duration: 180 });
      }
    });

  const panZoomGesture = Gesture.Pan()
    .enabled(expanded)
    .minPointers(1)
    .maxPointers(2)
    .onStart(() => {
      zoomSavedTx.value = zoomTx.value;
      zoomSavedTy.value = zoomTy.value;
    })
    .onUpdate((e) => {
      if (zoomScale.value <= 1.02) return;
      zoomTx.value = clampPan(
        zoomSavedTx.value + e.translationX,
        SCREEN_WIDTH,
        zoomScale.value,
      );
      zoomTy.value = clampPan(
        zoomSavedTy.value + e.translationY,
        SCREEN_HEIGHT,
        zoomScale.value,
      );
    });

  const doubleTapGesture = Gesture.Tap()
    .enabled(expanded)
    .numberOfTaps(2)
    .onEnd(() => {
      if (zoomScale.value > 1.02) {
        zoomScale.value = withTiming(1, { duration: 220 });
        zoomTx.value = withTiming(0, { duration: 220 });
        zoomTy.value = withTiming(0, { duration: 220 });
        zoomSavedScale.value = 1;
      } else {
        zoomScale.value = withTiming(2.5, { duration: 220 });
        zoomSavedScale.value = 2.5;
      }
    });

  // Single tap: expand when docked; dock again when expanded and not zoomed
  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (zoomScale.value > 1.02) return;
      runOnJS(handlePhotoPress)();
    });

  const photoGesture = Gesture.Race(
    Gesture.Simultaneous(pinchGesture, panZoomGesture),
    Gesture.Exclusive(doubleTapGesture, singleTapGesture),
  );

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: zoomTx.value },
      { translateY: zoomTy.value },
      { scale: zoomScale.value },
    ],
  }));

  // The exit button rides the expansion: visible only at/near fullscreen
  const closeButtonStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      dropProgress.value,
      [0, 0.4],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  // Animate out, then hand control back to the parent
  const animateOut = (callback: () => void) => {
    sheetProgress.value = withTiming(0, { duration: 200 });
    exitOpacity.value = withTiming(0, { duration: 220 }, () => {
      runOnJS(callback)();
    });
  };

  const photoStyle = useAnimatedStyle(() => {
    const p = dropProgress.value;
    return {
      left: interpolate(p, [0, 1], [0, THUMB_LEFT]),
      top: interpolate(p, [0, 1], [0, thumbTop]),
      width: interpolate(p, [0, 1], [SCREEN_WIDTH, THUMB_WIDTH]),
      height: interpolate(p, [0, 1], [SCREEN_HEIGHT, THUMB_HEIGHT]),
      borderRadius: interpolate(p, [0, 1], [0, 12]),
      borderWidth: interpolate(p, [0.7, 1], [0, 1.5], Extrapolation.CLAMP),
      opacity: exitOpacity.value,
    };
  });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - sheetProgress.value) * sheetHeight },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: sheetProgress.value,
  }));

  if (!mounted || !photoUri) {
    return null;
  }

  const isFailed = status === 'failed';
  const isSaving = status === 'saving';

  // Confirmation line (the destination chip is the only highlighted element)
  const confirmText = isSaving
    ? `Saving to ${baseName}…`
    : isFailed
      ? `Couldn't save to ${baseName}`
      : `Saved to ${baseName}`;

  const handleDismiss = () => animateOut(onDismiss);
  const handleRemove = () => animateOut(onRemove);
  const handleRetry = () => onRetry();
  const handleSaveToCameraRoll = () => onSaveToCameraRoll();
  const openAlbumPicker = () => setShowAlbumPicker(true);
  const handlePickAlbum = (albumId: string) => {
    setShowAlbumPicker(false);
    onAddToAlbum(albumId);
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Backdrop above the camera; tap = keep photo and close */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { height: sheetHeight, paddingBottom: insets.bottom },
          sheetStyle,
        ]}
      >
        {/* Header (left space is where the thumbnail docks) */}
        <View style={styles.header}>
          <View style={styles.thumbSpacer} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>
              {isFailed ? 'Not saved' : isSaving ? 'Saving…' : 'Saved'}
            </Text>
          </View>
          <Pressable onPress={handleDismiss} style={styles.closeButton}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>

        {/* Destination confirmation chip — the ONLY highlighted element */}
        <View style={styles.chipRow}>
          <View
            style={[
              styles.destChip,
              isFailed ? styles.destChipFailed : styles.destChipOk,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : isFailed ? (
              <Ionicons name="alert-circle" size={20} color="#FFD60A" />
            ) : (
              <Ionicons name="checkmark-circle" size={20} color="#30D158" />
            )}
            <Text style={styles.destChipText} numberOfLines={1}>
              {confirmText}
            </Text>
          </View>
          {/* Small secondary lines for any extras performed */}
          {!isFailed &&
            extraLines.map((line) => (
              <View key={line} style={styles.extraLine}>
                <Ionicons
                  name="checkmark"
                  size={14}
                  color="rgba(255,255,255,0.5)"
                />
                <Text style={styles.extraLineText} numberOfLines={1}>
                  {line}
                </Text>
              </View>
            ))}
        </View>

        {/* Actions */}
        <View style={styles.actionsArea}>
          <View style={styles.primaryRow}>
            {isFailed && (
              <Pressable
                onPress={handleRetry}
                style={[styles.actionButton, styles.primaryButton]}
              >
                <Ionicons name="refresh" size={18} color="#000" />
                <Text style={[styles.actionText, styles.primaryText]}>
                  Retry
                </Text>
              </Pressable>
            )}

            {canSaveToCameraRoll && (
              <Pressable
                onPress={handleSaveToCameraRoll}
                style={[
                  styles.actionButton,
                  isFailed ? styles.secondaryButton : styles.primaryButton,
                ]}
              >
                <Ionicons
                  name="download-outline"
                  size={18}
                  color={isFailed ? '#fff' : '#000'}
                />
                <Text
                  style={[
                    styles.actionText,
                    isFailed ? null : styles.primaryText,
                  ]}
                >
                  Camera roll
                </Text>
              </Pressable>
            )}

            {!isFailed && (
              <Pressable
                onPress={openAlbumPicker}
                style={[styles.actionButton, styles.secondaryButton]}
              >
                <Ionicons name="albums-outline" size={18} color="#fff" />
                <Text style={styles.actionText}>Add to album</Text>
              </Pressable>
            )}
          </View>

          {/* Remove — destructive but subtle */}
          <Pressable onPress={handleRemove} style={styles.removeButton}>
            <Ionicons name="trash-outline" size={16} color="#FF6961" />
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* The photo itself: full screen → bottom-left thumbnail. Tapping the
          docked thumb enlarges it back to fullscreen; when enlarged it can
          be pinch-zoomed, panned, double-tapped, and docked again by tap */}
      <Animated.View style={[styles.photoContainer, photoStyle]}>
        <GestureDetector gesture={photoGesture}>
          <Animated.View
            style={[styles.photoPressable, zoomStyle]}
            accessibilityRole="imagebutton"
            accessibilityLabel={
              expanded ? "Photo preview, pinch to zoom" : "Expand photo preview"
            }
          >
            <Image
              source={{ uri: photoUri }}
              style={styles.photo}
              resizeMode="cover"
            />
          </Animated.View>
        </GestureDetector>
      </Animated.View>

      {/* Exit button for the enlarged preview */}
      {expanded && (
        <Animated.View
          style={[
            styles.previewCloseButton,
            { top: insets.top + 8 },
            closeButtonStyle,
          ]}
        >
          <Pressable
            onPress={handleCollapse}
            hitSlop={8}
            style={({ pressed }) => [
              styles.previewCloseInner,
              pressed && styles.previewClosePressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </Animated.View>
      )}

      {/* One-off "Add to album" picker */}
      <DestinationPickerSheet
        visible={showAlbumPicker}
        albums={albums}
        showGallery={false}
        title={albumPickerTitle}
        selectedType="album"
        selectedAlbumId={null}
        onSelectAlbum={handlePickAlbum}
        onClose={() => setShowAlbumPicker(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(22, 22, 24, 0.97)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: THUMB_HEIGHT,
  },
  thumbSpacer: {
    width: THUMB_WIDTH,
    marginRight: 16,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  chipRow: {
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 18,
    gap: 6,
  },
  destChip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
  },
  destChipOk: {
    backgroundColor: 'rgba(48, 209, 88, 0.16)',
  },
  destChipFailed: {
    backgroundColor: 'rgba(255, 214, 10, 0.16)',
  },
  destChipText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  extraLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
  },
  extraLineText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  actionsArea: {
    paddingHorizontal: 20,
    gap: 12,
  },
  primaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#fff',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  actionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryText: {
    color: '#000',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
  },
  removeText: {
    color: '#FF6961',
    fontSize: 14,
    fontWeight: '600',
  },
  photoContainer: {
    position: 'absolute',
    overflow: 'hidden',
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: '#000',
  },
  photoPressable: {
    flex: 1,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  previewCloseButton: {
    position: 'absolute',
    right: 16,
  },
  previewCloseInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewClosePressed: {
    opacity: 0.6,
  },
});

export default PhotoSaveSheet;
