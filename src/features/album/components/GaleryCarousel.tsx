/**
 * GalleryCarousel Component
 * Horizontal photo strip for the "My Photos" section. Tapping a thumbnail
 * opens the shared PhotoViewer with the same zoom-from-cell flight as the
 * All Photos page, and dismissing flies the photo back into the strip.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import { View, StyleSheet, Pressable, Image as RNImage } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import { MediaAsset } from "../hooks";
import { usePhotoAlbumStore } from "../store/photoAlbumStore";
import { PhotoViewer, Frame } from "@/features/photos/components";
import { useLibraryViewerSession } from "@/features/photos/hooks/useLibraryViewerSession";
import { MediaTile } from "@/components/ui/MediaTile";

const ITEM_SIZE = 80;
const ITEM_HEIGHT = ITEM_SIZE * 1.4;
const ITEM_SPACING = 8;
const ITEM_RADIUS = 12;
const PADDING_HORIZONTAL = 20;

/** A cell counts as visible when at least this fraction of it is on screen. */
const MIN_VISIBLE_CELL_FRACTION = 0.6;

interface GalleryCarouselProps {
  /** How many library photos the strip previews. */
  limit?: number;
}

interface ViewerSession {
  index: number;
  originFrame: Frame | null;
}

interface CarouselItemProps {
  asset: MediaAsset;
  index: number;
  hasAlbumAssociation: boolean;
  dimmed: boolean;
  onPressItem: (index: number, originFrame: Frame | null) => void;
}

const CarouselItem = memo<CarouselItemProps>(
  ({ asset, index, hasAlbumAssociation, dimmed, onPressItem }) => {
    const innerRef = useRef<View>(null);

    const handlePress = useCallback(() => {
      const node = innerRef.current;
      if (!node) {
        onPressItem(index, null);
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        if (
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          width > 0 &&
          height > 0
        ) {
          onPressItem(index, { x, y, width, height });
        } else {
          onPressItem(index, null);
        }
      });
    }, [onPressItem, index]);

    return (
      <Pressable
        onPress={handlePress}
        style={styles.imageItem}
        accessibilityRole="imagebutton"
        accessibilityLabel={asset.mediaType === "video" ? "Video" : "Photo"}
      >
        <View ref={innerRef} collapsable={false} style={styles.imageContent}>
          <MediaTile asset={asset} fallbackGlyphSize={18} />
          {asset.mediaType === "video" && (
            <View style={styles.videoIndicator}>
              <Ionicons name="play" size={14} color="#fff" />
            </View>
          )}
          {hasAlbumAssociation && (
            <View style={styles.albumIndicator}>
              <Ionicons name="albums" size={8} color="#fff" />
            </View>
          )}
          {dimmed && <View style={styles.dimmedOverlay} />}
        </View>
      </Pressable>
    );
  },
);
CarouselItem.displayName = "CarouselItem";

// Cast FlashList to bypass type definition mismatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HorizontalFlashList = FlashList as any;

const GalleryCarousel: React.FC<GalleryCarouselProps> = ({ limit = 30 }) => {
  const associations = usePhotoAlbumStore((state) => state.associations);

  const listRef = useRef<any>(null);
  const containerRef = useRef<View>(null);
  const scrollXRef = useRef(0);

  // The session needs a return-frame resolver up front, but the real one
  // (below) closes over layout refs — bridge them with a ref so the
  // identity handed to the session never changes.
  const returnFrameRef = useRef<(index: number) => Promise<Frame | null>>(
    async () => null,
  );
  const getReturnFrame = useCallback(
    (index: number) => returnFrameRef.current(index),
    [],
  );
  const libraryViewer = useLibraryViewerSession({ getReturnFrame, limit });
  const assets = libraryViewer.assets;
  const assetCountRef = useRef(assets.length);
  assetCountRef.current = assets.length;

  const [viewedIndex, setViewedIndex] = useState<number | null>(null);

  const hasAlbumAssociation = useCallback(
    (uri: string): boolean => {
      const normalizedUri = uri.replace(/^file:\/\//, "");
      return normalizedUri in associations;
    },
    [associations],
  );

  // Dimming the pressed cell is deferred until the viewer's open transition
  // actually starts — dimming at press time exposes a gray cell for the
  // frames the flight overlay hasn't painted yet (a visible flicker with
  // server thumbnails, which decode slower than device-library ones).
  const pendingViewedIndexRef = useRef<number | null>(null);

  const handlePressItem = useCallback(
    (index: number, originFrame: Frame | null) => {
      // The session resolves the tapped photo's dimensions before it opens,
      // so the viewer gets its zoom flight instead of the shrunk fade
      pendingViewedIndexRef.current = index;
      libraryViewer.open(index, originFrame);
    },
    [libraryViewer],
  );

  const handleOpenTransitionStart = useCallback(() => {
    if (pendingViewedIndexRef.current != null) {
      setViewedIndex(pendingViewedIndexRef.current);
      pendingViewedIndexRef.current = null;
    }
  }, []);

  const handleCloseViewer = useCallback(() => {
    pendingViewedIndexRef.current = null;
    libraryViewer.viewerProps.onClose();
    setViewedIndex(null);
  }, [libraryViewer]);

  const handleActiveIndexChange = useCallback(
    (index: number) => {
      libraryViewer.viewerProps.onActiveIndexChange(index);
      setViewedIndex(index);
    },
    [libraryViewer],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleScroll = useCallback((event: any) => {
    scrollXRef.current = event.nativeEvent.contentOffset.x;
  }, []);

  // Same contract as CameraRollGrid.getReturnFrame, but horizontal: the
  // strip's cell frames are deterministic, and an off-screen landing cell
  // is scrolled into view while the viewer's backdrop still hides it.
  const getReturnFrameForIndex = useCallback(
    async (index: number): Promise<Frame | null> => {
      try {
        if (index < 0 || index >= assetCountRef.current) return null;
        const container = await new Promise<{
          x: number;
          y: number;
          width: number;
          height: number;
        } | null>((resolve) => {
          const node = containerRef.current;
          if (!node) {
            resolve(null);
            return;
          }
          node.measureInWindow((x, y, width, height) => {
            if (!Number.isFinite(x) || !(width > 0) || !(height > 0)) {
              resolve(null);
              return;
            }
            resolve({ x, y, width, height });
          });
        });
        if (!container) return null;

        const frameAt = (offset: number): Frame => ({
          x:
            container.x +
            PADDING_HORIZONTAL +
            index * (ITEM_SIZE + ITEM_SPACING) -
            offset,
          y: container.y,
          width: ITEM_SIZE,
          height: ITEM_HEIGHT,
        });

        let frame = frameAt(scrollXRef.current);
        const visibleWidth =
          Math.min(frame.x + frame.width, container.x + container.width) -
          Math.max(frame.x, container.x);
        if (visibleWidth < ITEM_SIZE * MIN_VISIBLE_CELL_FRACTION) {
          const list = listRef.current;
          if (!list) return null;
          const contentWidth =
            PADDING_HORIZONTAL * 2 +
            assetCountRef.current * (ITEM_SIZE + ITEM_SPACING) -
            ITEM_SPACING;
          const maxOffset = Math.max(0, contentWidth - container.width);
          const desired =
            PADDING_HORIZONTAL +
            index * (ITEM_SIZE + ITEM_SPACING) +
            ITEM_SIZE / 2 -
            container.width / 2;
          const offset = Math.min(Math.max(desired, 0), maxOffset);
          list.scrollToOffset({ offset, animated: false });
          scrollXRef.current = offset;
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => resolve());
            });
          });
          frame = frameAt(scrollXRef.current);
        }
        return frame;
      } catch {
        return null;
      }
    },
    [],
  );

  returnFrameRef.current = getReturnFrameForIndex;

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<MediaAsset>) => (
      <CarouselItem
        asset={item}
        index={index}
        hasAlbumAssociation={hasAlbumAssociation(item.uri)}
        dimmed={index === viewedIndex}
        onPressItem={handlePressItem}
      />
    ),
    [hasAlbumAssociation, viewedIndex, handlePressItem],
  );

  const keyExtractor = useCallback((item: MediaAsset) => item.id, []);

  if (assets.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="images-outline" size={32} color="#ccc" />
      </View>
    );
  }

  return (
    <>
      <View
        ref={containerRef}
        collapsable={false}
        style={styles.listContainer}
      >
        <HorizontalFlashList
          ref={listRef}
          data={assets}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          estimatedItemSize={ITEM_SIZE + ITEM_SPACING}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          extraData={viewedIndex}
        />
      </View>
      {/* The SAME session the camera's last-capture thumbnail opens —
          social overlay, pagination and sizing all come with it. Only the
          return flight is ours: the photo flies back into its strip cell.
          Mounted only while open (visible clears post-animation). */}
      {libraryViewer.viewerProps.visible && (
        <PhotoViewer
          {...libraryViewer.viewerProps}
          onClose={handleCloseViewer}
          onActiveIndexChange={handleActiveIndexChange}
          onOpenTransitionStart={handleOpenTransitionStart}
          gridCornerRadius={ITEM_RADIUS}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  listContainer: {
    height: ITEM_HEIGHT,
  },
  contentContainer: {
    paddingHorizontal: PADDING_HORIZONTAL,
  },
  imageItem: {
    width: ITEM_SIZE,
    height: ITEM_HEIGHT,
    borderRadius: ITEM_RADIUS,
    marginRight: ITEM_SPACING,
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
  },
  imageContent: {
    width: "100%",
    height: "100%",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  videoIndicator: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  albumIndicator: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 4,
    padding: 3,
  },
  dimmedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#e3e3e3",
  },
  emptyContainer: {
    height: ITEM_SIZE,
    marginHorizontal: 20,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default GalleryCarousel;
