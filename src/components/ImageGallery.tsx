import React, {
  useCallback,
  useRef,
  useState,
  useMemo,
  ReactNode,
} from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  FlatList,
  InteractionManager,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  FadeIn,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageGalleryProps<T> {
  data: T[];
  getId: (item: T) => string;
  getUri: (item: T) => string;
  getFullUri?: (item: T) => string;
  getAspectRatio?: (item: T) => number;
  numColumns?: number;
  spacing?: number;
  initialIndex?: number;
  renderOverlay?: (item: T, index: number) => ReactNode;
  onIndexChange?: (index: number) => void;
  onOpen?: (index: number) => void;
  onClose?: (index: number) => void;
  viewerWindowSize?: number;
  viewerEdgeThreshold?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SW, height: SH } = Dimensions.get("window");
const FADE_MS = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function containRect(ar: number, sw: number, sh: number): Rect {
  let w: number, h: number;
  if (ar > sw / sh) {
    w = sw;
    h = sw / ar;
  } else {
    h = sh;
    w = sh * ar;
  }
  return { x: (sw - w) / 2, y: (sh - h) / 2, width: w, height: h };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

// ---------------------------------------------------------------------------
// Grid Cell  (lightweight — no animation work)
// ---------------------------------------------------------------------------

interface CellProps<T> {
  item: T;
  index: number;
  getUri: (item: T) => string;
  size: number;
  spacing: number;
  cols: number;
  overlay?: (item: T, index: number) => ReactNode;
  onPress: (index: number) => void;
}

const CellInner = <T,>({
  item,
  index,
  getUri,
  size,
  spacing,
  cols,
  overlay,
  onPress,
}: CellProps<T>) => {
  const last = (index + 1) % cols === 0;
  return (
    <Pressable onPress={() => onPress(index)}>
      <View
        style={{
          width: size,
          height: size,
          marginBottom: spacing,
          marginRight: last ? 0 : spacing,
        }}
      >
        <Image
          source={{ uri: getUri(item) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={getUri(item)}
        />
        {overlay?.(item, index)}
      </View>
    </Pressable>
  );
};
const Cell = React.memo(CellInner) as typeof CellInner;

// ---------------------------------------------------------------------------
// Viewer Page  (single full-screen image)
// ---------------------------------------------------------------------------

interface PageProps<T> {
  item: T;
  getFullUri: (item: T) => string;
  getAspectRatio?: (item: T) => number;
}

const PageInner = <T,>({ item, getFullUri, getAspectRatio }: PageProps<T>) => {
  const ar = getAspectRatio?.(item);
  const img = ar
    ? { width: containRect(ar, SW, SH).width, height: containRect(ar, SW, SH).height }
    : { width: SW, height: SH };

  return (
    <View style={styles.page}>
      <Image
        source={{ uri: getFullUri(item) }}
        style={img}
        contentFit="contain"
      />
    </View>
  );
};
const Page = React.memo(PageInner) as typeof PageInner;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function ImageGalleryInner<T>({
  data,
  getId,
  getUri,
  getFullUri,
  getAspectRatio,
  numColumns = 3,
  spacing = 2,
  renderOverlay,
  onIndexChange,
  onOpen,
  onClose,
  viewerWindowSize = 60,
  viewerEdgeThreshold = 10,
}: ImageGalleryProps<T>) {
  const insets = useSafeAreaInsets();
  const fullUri = getFullUri ?? getUri;

  // ---- viewer state (minimal) ----
  const [open, setOpen] = useState(false);
  const [windowStart, setWindowStart] = useState(0);
  const [startLocalIdx, setStartLocalIdx] = useState(0);
  const curGlobal = useRef(0);
  const listRef = useRef<FlatList<T>>(null);
  const shifting = useRef(false);
  const halfWin = Math.floor(viewerWindowSize / 2);

  // overlay opacity (Reanimated — runs on UI thread)
  const overlayOpacity = useSharedValue(0);

  // ---- grid sizing ----
  const cellSize = useMemo(
    () => (SW - spacing * (numColumns - 1)) / numColumns,
    [numColumns, spacing],
  );

  // ---- window slice ----
  const slice = useMemo(() => {
    const end = Math.min(data.length, windowStart + viewerWindowSize);
    return data.slice(windowStart, end);
  }, [data, windowStart, viewerWindowSize]);

  // ---- open ----
  const openViewer = useCallback(
    (globalIdx: number) => {
      curGlobal.current = globalIdx;
      const ws = clamp(globalIdx - halfWin, 0, Math.max(0, data.length - viewerWindowSize));
      const localIdx = globalIdx - ws;
      setWindowStart(ws);
      setStartLocalIdx(localIdx);
      setOpen(true);
      onOpen?.(globalIdx);
      // fade in on next frame (after RN commits the view)
      requestAnimationFrame(() => {
        overlayOpacity.value = withTiming(1, { duration: FADE_MS });
      });
    },
    [data.length, halfWin, viewerWindowSize, overlayOpacity, onOpen],
  );

  // ---- close ----
  const closeViewer = useCallback(() => {
    const idx = curGlobal.current;
    overlayOpacity.value = withTiming(0, { duration: FADE_MS }, (done) => {
      if (done) {
        runOnJS(setOpen)(false);
        if (onClose) runOnJS(onClose)(idx);
      }
    });
  }, [overlayOpacity, onClose]);

  // ---- scroll tracking ----
  const onScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      if (shifting.current) return;
      const local = Math.round(e.nativeEvent.contentOffset.x / SW);
      const global = windowStart + local;
      if (global !== curGlobal.current && global >= 0 && global < data.length) {
        curGlobal.current = global;
        onIndexChange?.(global);

        const pos = global - windowStart;
        const winSize = Math.min(viewerWindowSize, data.length);
        if (
          (pos <= viewerEdgeThreshold && windowStart > 0) ||
          (pos >= winSize - viewerEdgeThreshold && windowStart + viewerWindowSize < data.length)
        ) {
          shift(global);
        }
      }
    },
    [windowStart, data.length, viewerWindowSize, viewerEdgeThreshold, onIndexChange],
  );

  const shift = useCallback(
    (global: number) => {
      if (shifting.current) return;
      shifting.current = true;
      const ns = clamp(global - halfWin, 0, Math.max(0, data.length - viewerWindowSize));
      if (ns === windowStart) { shifting.current = false; return; }
      const nl = global - ns;
      setWindowStart(ns);
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          listRef.current?.scrollToIndex({ index: nl, animated: false });
          shifting.current = false;
        });
      });
    },
    [halfWin, data.length, viewerWindowSize, windowStart],
  );

  // ---- FlatList helpers (stable) ----
  const getItemLayout = useCallback(
    (_: ArrayLike<T> | null | undefined, i: number) => ({
      length: SW,
      offset: SW * i,
      index: i,
    }),
    [],
  );

  const renderPage = useCallback(
    ({ item }: { item: T }) => (
      <Page item={item} getFullUri={fullUri} getAspectRatio={getAspectRatio} />
    ),
    [fullUri, getAspectRatio],
  );

  const pageKey = useCallback((item: T) => getId(item), [getId]);

  // ---- grid helpers ----
  const renderCell = useCallback(
    ({ item, index }: { item: T; index: number }) => (
      <Cell
        item={item}
        index={index}
        getUri={getUri}
        size={cellSize}
        spacing={spacing}
        cols={numColumns}
        overlay={renderOverlay}
        onPress={openViewer}
      />
    ),
    [getUri, cellSize, spacing, numColumns, renderOverlay, openViewer],
  );

  const cellKey = useCallback((item: T) => getId(item), [getId]);

  // ---- animated overlay style ----
  const bgStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  return (
    <View style={styles.root}>
      {/* Grid */}
      <FlashList
        data={data}
        renderItem={renderCell}
        keyExtractor={cellKey}
        numColumns={numColumns}
        showsVerticalScrollIndicator={false}
      />

      {/* Viewer overlay — no Modal, just an absolute View */}
      {open && (
        <View style={styles.viewer} pointerEvents="box-none">
          {/* Black backdrop (animated opacity) */}
          <Animated.View style={[styles.backdrop, bgStyle]} pointerEvents="none" />

          {/* Paging list */}
          <Animated.View
            style={StyleSheet.absoluteFill}
            entering={FadeIn.duration(FADE_MS)}
          >
            <FlatList
              ref={listRef}
              data={slice}
              renderItem={renderPage}
              keyExtractor={pageKey}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={startLocalIdx}
              getItemLayout={getItemLayout}
              onScroll={onScroll}
              scrollEventThrottle={16}
              windowSize={3}
              maxToRenderPerBatch={2}
              removeClippedSubviews
            />

            {/* Close button */}
            <Pressable
              style={[styles.close, { top: insets.top + 8 }]}
              onPress={closeViewer}
              hitSlop={16}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },
  viewer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  page: {
    width: SW,
    height: SH,
    justifyContent: "center",
    alignItems: "center",
  },
  close: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default function ImageGallery<T>(props: ImageGalleryProps<T>) {
  return <ImageGalleryInner {...props} />;
}
