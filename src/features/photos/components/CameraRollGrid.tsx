/**
 * CameraRollGrid Component
 * Performant N-column photo grid (iOS Photos look, 3 columns by default).
 *
 * Perf notes:
 * - Cells are memoized and only re-render when their props change (callbacks
 *   passed in are stable, so the default shallow comparison is enough).
 * - expo-image renders local ph:// URIs directly at cell size; memory-only
 *   cache (disk caching local assets is pure overhead) and no transition
 *   (fades on recycled cells cause visible churn when scrolling back up).
 *   Remote thumbnails (album photos) additionally cache to disk.
 *
 * Zoom-transition support:
 * - On press each cell measures its visible image area in window coordinates
 *   and hands it to onPressItem, so the viewer can expand the photo from the
 *   exact cell rect.
 * - An imperative getReturnFrame(index) resolves the window frame a dismissed
 *   photo should fly back to, scrolling the grid first — but only when the
 *   cell is mostly hidden, because callers may invoke it behind a
 *   semi-transparent backdrop where a scroll jump would show through.
 * - Scroll tracking lives in a Reanimated SharedValue written by a scroll
 *   worklet; getReturnFrame reads .value synchronously from JS, and the
 *   optional animatedScrollY prop mirrors it for collapsing headers.
 *
 * Sectioned mode (opt-in via `sectioned`):
 * - Assets (sorted newest-first) are grouped consecutively by month into a
 *   flattened item list: a full-width year divider whenever the year
 *   changes, a full-width month header per group, then the group's asset
 *   cells. Assets with an invalid/zero creationTime collect into a final
 *   "Unknown" group. Header rows span all columns via overrideItemLayout.
 * - The deterministic geometry stays exact: a precomputed per-asset table
 *   ({ col, rowsBefore, yearHeadersBefore, monthHeadersBefore }) drives
 *   both the cells' directional padding and getReturnFrame, with headers
 *   contributing their FIXED heights (YEAR_HEADER_HEIGHT /
 *   MONTH_HEADER_HEIGHT — the header components render exactly these).
 * - All external contracts stay asset-index based (onPressItem,
 *   getReturnFrame, dimmedIndex, onCellImageLoad): header items are
 *   invisible to consumers.
 * - A right-edge GridScrubber (with a month/year date bubble while
 *   dragging) renders when the content is tall enough to warrant it.
 */

import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { type ImageLoadEventData } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "react-native-paper";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  Easing,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import dayjs from "dayjs";
import { MediaAsset } from "@/features/album/hooks";
import UploadingBadge from "@/components/ui/UploadingBadge";
import { MediaTile } from "@/components/ui/MediaTile";
import { hasRenderableStill } from "@/lib/mediaStill";
import { GridScrubber, type MonthRange } from "./GridScrubber";
import { Frame } from "./types";

const DEFAULT_NUM_COLUMNS = 3;
const GRID_GAP = 2;
/** Default bottom padding of the list content. */
const DEFAULT_BOTTOM_PADDING = 40;
/**
 * FIXED heights of the sectioned-mode header rows. The header components
 * render exactly these (no intrinsic sizing) — the deterministic
 * return-frame math and the scrubber's month ranges depend on them.
 */
const YEAR_HEADER_HEIGHT = 56;
const MONTH_HEADER_HEIGHT = 40;
/** The scrubber only appears when content exceeds this many viewports. */
const SCRUBBER_MIN_CONTENT_RATIO = 1.5;
/**
 * getReturnFrame only scrolls when less than this fraction of the cell's
 * height is visible — a mostly-visible cell is landed on as-is, since a
 * scroll jump can peek through a pan-dismiss's semi-transparent backdrop.
 */
const MIN_VISIBLE_CELL_FRACTION = 0.6;

// Cast to any to bypass the FlashList/createAnimatedComponent type
// mismatch with the installed versions (same pattern as elsewhere in the app)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as any,
) as any;

/**
 * Formats a duration in seconds as m:ss (e.g. 83 -> "1:23"),
 * or h:mm:ss at an hour and above (e.g. 3900 -> "1:05:00").
 */
const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

/** Screen-reader label, e.g. "Photo, 19 July 2026" / "Video, 12 seconds". */
const accessibilityLabelForAsset = (asset: MediaAsset): string => {
  if (asset.mediaType === "video") {
    const secs = Math.round(asset.duration);
    return `Video, ${secs} ${secs === 1 ? "second" : "seconds"}`;
  }
  const date = dayjs(asset.creationTime);
  return date.isValid() ? `Photo, ${date.format("D MMMM YYYY")}` : "Photo";
};

/**
 * Content-space rect of the visible image area of the cell at `index`,
 * mirroring GridCell's directional padding exactly, plus the row's outer
 * top edge (used for scroll targeting).
 */
const cellImageRect = (
  index: number,
  cellSize: number,
  headerHeight: number,
  numColumns: number,
) => {
  const col = index % numColumns;
  const row = Math.floor(index / numColumns);
  const paddingLeft = col === 0 ? 0 : GRID_GAP / 2;
  const paddingRight = col === numColumns - 1 ? 0 : GRID_GAP / 2;
  const paddingTop = row === 0 ? 0 : GRID_GAP;
  const rowTop = headerHeight + row * cellSize;
  return {
    x: col * cellSize + paddingLeft,
    y: rowTop + paddingTop,
    width: cellSize - paddingLeft - paddingRight,
    height: cellSize - paddingTop,
    rowTop,
  };
};

// ---------------------------------------------------------------------------
// Sectioned mode: flattened items + deterministic placement table
// ---------------------------------------------------------------------------

/** Flattened list item in sectioned mode. */
type SectionedGridItem =
  | { type: "year"; key: string; label: string }
  | { type: "month"; key: string; label: string; yearLabel: string }
  | { type: "asset"; asset: MediaAsset; assetIndex: number };

/**
 * Where an asset's cell sits in the sectioned layout. All counts are taken
 * across the whole flattened list, above the asset's own row:
 * - rowsBefore: completed asset ROWS (each section fills rows of
 *   numColumns; a partial final row still counts as one row, and the next
 *   header starts a fresh row — matching FlashList's span layout, where a
 *   full-span item always starts a new row)
 * - yearHeadersBefore / monthHeadersBefore: header items above the asset
 */
interface AssetPlacement {
  col: number;
  rowsBefore: number;
  yearHeadersBefore: number;
  monthHeadersBefore: number;
  /** Row within the asset's own section (0 = directly under its header). */
  sectionRow: number;
}

/** One month section's structural position (converted to px at use time). */
interface SectionPlacement {
  /** Scrubber bubble label, e.g. "July 2026" (or "Unknown"). */
  label: string;
  /** Asset rows above this section's first header item. */
  rowsBefore: number;
  /** Year headers above this section (its own divider excluded). */
  yearHeadersBefore: number;
  /** Month headers above this section (its own header excluded). */
  monthHeadersBefore: number;
  /** Whether this section starts with a year divider. */
  hasYearDivider: boolean;
  /** Asset rows inside this section. */
  rowCount: number;
}

interface SectionedLayout {
  items: SectionedGridItem[];
  /** Indexed by assetIndex. */
  placements: AssetPlacement[];
  sections: SectionPlacement[];
  totalAssetRows: number;
  yearHeaderCount: number;
  monthHeaderCount: number;
}

/**
 * Groups assets (sorted newest-first) consecutively by month and emits the
 * flattened item list plus the placement tables the deterministic geometry
 * math needs. Assets with an invalid/zero creationTime collect into a
 * final "Unknown" group (month header only, no year divider).
 */
const buildSectionedLayout = (
  assets: MediaAsset[],
  numColumns: number,
): SectionedLayout => {
  interface Group {
    monthKey: string;
    label: string;
    yearLabel: string;
    entries: { asset: MediaAsset; assetIndex: number }[];
  }
  const groups: Group[] = [];
  const unknown: Group = {
    monthKey: "unknown",
    label: "Unknown",
    yearLabel: "",
    entries: [],
  };
  for (let assetIndex = 0; assetIndex < assets.length; assetIndex++) {
    const asset = assets[assetIndex];
    const date = dayjs(asset.creationTime);
    if (!asset.creationTime || !date.isValid()) {
      unknown.entries.push({ asset, assetIndex });
      continue;
    }
    const monthKey = date.format("YYYY-MM");
    const last = groups[groups.length - 1];
    if (last && last.monthKey === monthKey) {
      last.entries.push({ asset, assetIndex });
    } else {
      groups.push({
        monthKey,
        label: date.format("MMMM"),
        yearLabel: date.format("YYYY"),
        entries: [{ asset, assetIndex }],
      });
    }
  }
  if (unknown.entries.length > 0) {
    groups.push(unknown);
  }

  const items: SectionedGridItem[] = [];
  const placements: AssetPlacement[] = new Array(assets.length);
  const sections: SectionPlacement[] = [];
  // Header keys are stable ("y-2026" / "m-2026-07"); should imperfectly
  // sorted input ever repeat a month/year, a counter suffix keeps them
  // unique so FlashList never sees a key collision
  const keyCounts = new Map<string, number>();
  const uniqueKey = (base: string): string => {
    const count = keyCounts.get(base) ?? 0;
    keyCounts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };

  let rowsBefore = 0;
  let yearHeaders = 0;
  let monthHeaders = 0;
  let previousYear: string | null = null;
  for (const group of groups) {
    const hasYearDivider =
      group.yearLabel !== "" && group.yearLabel !== previousYear;
    sections.push({
      label: group.yearLabel
        ? `${group.label} ${group.yearLabel}`
        : group.label,
      rowsBefore,
      yearHeadersBefore: yearHeaders,
      monthHeadersBefore: monthHeaders,
      hasYearDivider,
      rowCount: Math.ceil(group.entries.length / numColumns),
    });
    if (hasYearDivider) {
      items.push({
        type: "year",
        key: uniqueKey(`y-${group.yearLabel}`),
        label: group.yearLabel,
      });
      yearHeaders++;
      previousYear = group.yearLabel;
    }
    items.push({
      type: "month",
      key: uniqueKey(`m-${group.monthKey}`),
      label: group.label,
      yearLabel: group.yearLabel,
    });
    monthHeaders++;
    for (let position = 0; position < group.entries.length; position++) {
      const { asset, assetIndex } = group.entries[position];
      items.push({ type: "asset", asset, assetIndex });
      placements[assetIndex] = {
        col: position % numColumns,
        rowsBefore: rowsBefore + Math.floor(position / numColumns),
        yearHeadersBefore: yearHeaders,
        monthHeadersBefore: monthHeaders,
        sectionRow: Math.floor(position / numColumns),
      };
    }
    rowsBefore += Math.ceil(group.entries.length / numColumns);
  }

  return {
    items,
    placements,
    sections,
    totalAssetRows: rowsBefore,
    yearHeaderCount: yearHeaders,
    monthHeaderCount: monthHeaders,
  };
};

/**
 * Sectioned-mode analogue of cellImageRect: content-space rect of the
 * visible image area of an asset's cell, derived from its precomputed
 * placement. Mirrors the sectioned GridCell's directional padding exactly
 * (paddingTop is 0 only in the FIRST asset row overall).
 */
const sectionedCellImageRect = (
  placement: AssetPlacement,
  cellSize: number,
  headerHeight: number,
  numColumns: number,
) => {
  const { col, rowsBefore, yearHeadersBefore, monthHeadersBefore } = placement;
  const paddingLeft = col === 0 ? 0 : GRID_GAP / 2;
  const paddingRight = col === numColumns - 1 ? 0 : GRID_GAP / 2;
  // First row of EACH section sits flush under its month header, so every
  // section gets uniform header-to-photos spacing
  const paddingTop = placement.sectionRow === 0 ? 0 : GRID_GAP;
  const rowTop =
    headerHeight +
    rowsBefore * cellSize +
    yearHeadersBefore * YEAR_HEADER_HEIGHT +
    monthHeadersBefore * MONTH_HEADER_HEIGHT;
  return {
    x: col * cellSize + paddingLeft,
    y: rowTop + paddingTop,
    width: cellSize - paddingLeft - paddingRight,
    height: cellSize - paddingTop,
    rowTop,
  };
};

interface GridCellProps {
  asset: MediaAsset;
  index: number;
  numColumns: number;
  onPressItem: (index: number, originFrame: Frame | null) => void;
  /**
   * Natural size of the cell's painted thumbnail (expo-image onLoad).
   * Used to enrich assets whose metadata lacks dimensions — a thumbnail
   * preserves the aspect ratio, which is all the zoom flight needs.
   */
  onCellImageLoad?: (assetId: string, width: number, height: number) => void;
  /** iOS Photos-style: the slot being previewed in the viewer shows gray. */
  dimmed?: boolean;
  /**
   * The photo is being deleted: play a pop-away (grow, then shrink to
   * nothing) and stay invisible until the data refetch removes the cell.
   * Flipping back to false on the SAME asset (failed delete) pops it
   * back in; a recycled cell showing a different asset resets instantly.
   */
  popping?: boolean;
  /**
   * Deletion reflow (flat mode): bumped once per landed removal. Cells at
   * index >= reflowFromIndex start at their previous slot's offset and
   * glide into place. cellSize = container width / columns.
   */
  reflowGeneration?: number;
  reflowFromIndex?: number;
  cellSize?: number;
  /**
   * Sectioned mode: the cell's column, from the placement table (position
   * in its SECTION, not the asset index). Flat mode omits it and the cell
   * falls back to the pure index math.
   */
  col?: number;
  /**
   * Sectioned mode: true only for cells in the first asset row overall
   * (paddingTop 0). Flat mode omits it (falls back to index < numColumns).
   */
  flushTop?: boolean;
}

const GridCell = memo<GridCellProps>(
  ({
    asset,
    index,
    numColumns,
    onPressItem,
    onCellImageLoad,
    dimmed,
    popping,
    reflowGeneration,
    reflowFromIndex,
    cellSize,
    col: colOverride,
    flushTop,
  }) => {
    const imageAreaRef = useRef<View>(null);

    // Deletion-reflow glide: on a new generation, an affected cell paints
    // at its OLD slot's offset in the very frame the data shifts (values
    // set during render, ahead of this commit) and eases into its new
    // slot. Guarded by generation so re-renders never replay it.
    const shiftX = useSharedValue(0);
    const shiftY = useSharedValue(0);
    const seenReflowGenRef = useRef<number | undefined>(reflowGeneration);
    if (reflowGeneration !== seenReflowGenRef.current) {
      seenReflowGenRef.current = reflowGeneration;
      if (
        reflowGeneration != null &&
        reflowFromIndex != null &&
        cellSize != null &&
        cellSize > 0 &&
        index >= reflowFromIndex
      ) {
        // This asset moved from slot index+1 to slot index: start at the
        // old slot relative to the new one. Wrapping cells (old slot
        // began a new row) come from the row below's first column.
        const wraps = (index + 1) % numColumns === 0;
        shiftX.value = wraps ? -(numColumns - 1) * cellSize : cellSize;
        shiftY.value = wraps ? cellSize : 0;
        const easing = { duration: 320, easing: Easing.out(Easing.cubic) };
        shiftX.value = withTiming(0, easing);
        shiftY.value = withTiming(0, easing);
      }
    }

    // Pop-away for deletions. FlashList RECYCLES cell instances, so these
    // values persist across asset changes: a recycled cell must snap back
    // to identity instantly, while a failed delete on the SAME asset
    // animates back in.
    const popScale = useSharedValue(1);
    const popOpacity = useSharedValue(1);
    const popAssetIdRef = useRef(asset.id);
    useEffect(() => {
      const assetChanged = popAssetIdRef.current !== asset.id;
      popAssetIdRef.current = asset.id;
      if (popping) {
        // Grow slightly, then collapse to nothing with a back-ease
        popScale.value = withSequence(
          withTiming(1.08, { duration: 90, easing: Easing.out(Easing.quad) }),
          withTiming(0.001, {
            duration: 280,
            easing: Easing.in(Easing.back(1.6)),
          }),
        );
        popOpacity.value = withDelay(160, withTiming(0, { duration: 200 }));
      } else if (assetChanged) {
        cancelAnimation(popScale);
        cancelAnimation(popOpacity);
        cancelAnimation(shiftX);
        cancelAnimation(shiftY);
        popScale.value = 1;
        popOpacity.value = 1;
        shiftX.value = 0;
        shiftY.value = 0;
      } else if (popScale.value !== 1 || popOpacity.value !== 1) {
        // Failed delete — the photo is staying after all
        popScale.value = withTiming(1, { duration: 200 });
        popOpacity.value = withTiming(1, { duration: 200 });
      }
    }, [popping, asset.id, popScale, popOpacity, shiftX, shiftY]);
    const popStyle = useAnimatedStyle(() => ({
      opacity: popOpacity.value,
      transform: [
        { translateX: shiftX.value },
        { translateY: shiftY.value },
        { scale: popScale.value },
      ],
    }));

    const handlePress = useCallback(() => {
      if (popping) return;
      const node = imageAreaRef.current;
      if (!node) {
        onPressItem(index, null);
        return;
      }
      // Measure the visible image area (the inner view excludes the
      // directional padding) so the open flight starts exactly on the pixels
      // the user tapped.
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
    }, [onPressItem, index, popping]);

    const handleImageLoad = useCallback(
      (event: ImageLoadEventData) => {
        onCellImageLoad?.(asset.id, event.source.width, event.source.height);
      },
      [onCellImageLoad, asset.id],
    );

    // Directional padding: screen edges stay flush while neighbouring cells
    // still end up GRID_GAP apart (half a gap from each side, full gap rows).
    // Sectioned mode supplies col/flushTop from the placement table (the
    // index math is wrong there — headers offset the flattened positions).
    const col = colOverride ?? index % numColumns;
    const isFlushTop = flushTop ?? index < numColumns;
    const cellStyle = {
      paddingLeft: col === 0 ? 0 : GRID_GAP / 2,
      paddingRight: col === numColumns - 1 ? 0 : GRID_GAP / 2,
      paddingTop: isFlushTop ? 0 : GRID_GAP,
    };

    const isVideo = asset.mediaType === "video";
    const posterlessVideo = isVideo && !hasRenderableStill(asset);

    return (
      <Pressable
        onPress={handlePress}
        style={[styles.cell, cellStyle]}
        accessibilityRole="imagebutton"
        accessibilityLabel={accessibilityLabelForAsset(asset)}
      >
        {/* Inner wrapper fills the padded area so the badge offset stays
          consistent relative to the visible image in every column */}
        <View ref={imageAreaRef} collapsable={false} style={styles.cellInner}>
          <Animated.View style={[styles.cellPop, popStyle]}>
            <MediaTile
              asset={asset}
              onLoad={onCellImageLoad ? handleImageLoad : undefined}
            />
            {isVideo && !posterlessVideo && (
              <View style={styles.durationBadge}>
                {asset.duration > 0 ? (
                  <Text style={styles.durationText}>
                    {formatDuration(asset.duration)}
                  </Text>
                ) : (
                  // Remote album videos arrive without a duration — the
                  // play glyph still marks the poster as a video
                  <Ionicons
                    name="play"
                    size={11}
                    color="rgba(255, 255, 255, 0.95)"
                  />
                )}
              </View>
            )}
            {(asset.likeCount ?? 0) > 0 && (
              <View style={styles.likeBadge} pointerEvents="none">
                <Ionicons name="heart" size={9} color="#fff" />
                <Text style={styles.likeBadgeText}>{asset.likeCount}</Text>
              </View>
            )}
            {/* Local-first tile whose upload is still in flight */}
            {(asset.pending || asset.uploadFailed) && (
              <UploadingBadge failed={asset.uploadFailed} />
            )}
            {dimmed && <View style={styles.dimmedOverlay} />}
          </Animated.View>
        </View>
      </Pressable>
    );
  },
);
GridCell.displayName = "GridCell";

/**
 * Full-width year divider ("2026"). Renders at EXACTLY
 * YEAR_HEADER_HEIGHT — the deterministic frame math depends on it.
 */
const YearHeader = memo<{ label: string }>(({ label }) => (
  <View style={styles.yearHeader}>
    <Text style={styles.yearHeaderText}>{label}</Text>
  </View>
));
YearHeader.displayName = "YearHeader";

/**
 * Full-width month header ("July  2026"). Renders at EXACTLY
 * MONTH_HEADER_HEIGHT — the deterministic frame math depends on it.
 */
const MonthHeader = memo<{ label: string; yearLabel: string }>(
  ({ label, yearLabel }) => (
    <View style={styles.monthHeader}>
      <Text style={styles.monthHeaderText}>{label}</Text>
      {yearLabel !== "" && (
        <Text style={styles.monthHeaderYearText}>{yearLabel}</Text>
      )}
    </View>
  ),
);
MonthHeader.displayName = "MonthHeader";

export interface CameraRollGridHandle {
  /**
   * Window-space frame of the visible image area of the cell at `index`,
   * computed from the grid math (not a stale cell measurement). When less
   * than MIN_VISIBLE_CELL_FRACTION of the cell's height is visible the
   * grid is first scrolled (non-animated) so the frame lands on-screen;
   * mostly-visible cells are used as-is so the scroll can't show through
   * a partially faded backdrop. Resolves null on any failure.
   */
  getReturnFrame: (index: number) => Promise<Frame | null>;
}

interface CameraRollGridProps {
  assets: MediaAsset[];
  onPressItem: (index: number, originFrame: Frame | null) => void;
  /** Grid columns (default 3) — gaps, return-frame math derive from it. */
  numColumns?: number;
  /**
   * iOS-Photos-style month/year sections + fast-scroll scrubber (default
   * false). All index-based contracts (onPressItem, getReturnFrame,
   * dimmedIndex, onCellImageLoad) keep speaking ASSET indexes.
   */
  sectioned?: boolean;
  onEndReached?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  ListHeaderComponent?: React.ReactElement;
  ListEmptyComponent?: React.ComponentType | React.ReactElement | null;
  /** Index whose slot renders as an empty gray placeholder (being previewed). */
  dimmedIndex?: number | null;
  /** Asset ids mid-deletion — their cells pop away. See GridCellProps. */
  poppingIds?: string[];
  /** See GridCellProps.onCellImageLoad. */
  onCellImageLoad?: (assetId: string, width: number, height: number) => void;
  /**
   * Mirror of the grid's scroll offset, written from the scroll worklet —
   * drives collapsing headers without a JS round trip.
   */
  animatedScrollY?: SharedValue<number>;
  /** Bottom padding of the list content (default 40). */
  contentBottomPadding?: number;
}

export const CameraRollGrid = forwardRef<
  CameraRollGridHandle,
  CameraRollGridProps
>(function CameraRollGrid(
  {
    assets,
    onPressItem,
    numColumns = DEFAULT_NUM_COLUMNS,
    sectioned = false,
    onEndReached,
    refreshing = false,
    onRefresh,
    isLoadingMore = false,
    hasMore = true,
    ListHeaderComponent,
    ListEmptyComponent,
    dimmedIndex = null,
    poppingIds,
    onCellImageLoad,
    animatedScrollY,
    contentBottomPadding = DEFAULT_BOTTOM_PADDING,
  },
  ref,
) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashListRef<MediaAsset>>(null);
  const containerRef = useRef<View>(null);
  const headerHeightRef = useRef(0);

  // Live scroll offset. Written by the scroll worklet on the UI thread;
  // getReturnFrame reads .value synchronously from JS (allowed) and writes
  // it directly after a programmatic scrollToOffset.
  const scrollY = useSharedValue(0);
  // Raised around programmatic jumps so the scrubber doesn't treat them
  // as user activity and flash in next to a dismiss landing
  const scrubberSuppress = useSharedValue(false);

  // Mirror render-scoped values into refs so getReturnFrame stays stable
  // (it is captured by the viewer across async dismiss sequences)
  const assetCountRef = useRef(assets.length);
  assetCountRef.current = assets.length;
  const insetTopRef = useRef(insets.top);
  insetTopRef.current = insets.top;
  const numColumnsRef = useRef(numColumns);
  numColumnsRef.current = numColumns;
  const bottomPaddingRef = useRef(contentBottomPadding);
  bottomPaddingRef.current = contentBottomPadding;
  const animatedScrollYRef = useRef(animatedScrollY);
  animatedScrollYRef.current = animatedScrollY;
  const sectionedRef = useRef(sectioned);
  sectionedRef.current = sectioned;

  // -------------------------------------------------------------------------
  // Sectioned layout (null in flat mode — every flat path is untouched)
  // -------------------------------------------------------------------------

  const sectionedLayout = useMemo(
    () => (sectioned ? buildSectionedLayout(assets, numColumns) : null),
    [assets, sectioned, numColumns],
  );
  // Ref mirror so the stable getReturnFrame sees the current table
  const sectionedLayoutRef = useRef(sectionedLayout);
  sectionedLayoutRef.current = sectionedLayout;

  // Container size, tracked reactively in BOTH modes: the scrubber's
  // pixel math needs it in sectioned mode, and the deletion-reflow shift
  // math needs the cell size (width / columns) in flat mode. Set once at
  // mount (and on rotation) — no per-scroll cost.
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize((prev) =>
      prev && prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
  }, []);

  // Reactive mirror of headerHeightRef, sectioned mode only (same reason)
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(0);

  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        "worklet";
        scrollY.value = event.contentOffset.y;
        if (animatedScrollY) {
          animatedScrollY.value = event.contentOffset.y;
        }
      },
    },
    [animatedScrollY, scrollY],
  );

  const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    headerHeightRef.current = height;
    // The scrubber's month ranges need the header height reactively; flat
    // mode keeps the ref-only write so its render behavior is unchanged
    if (sectionedRef.current) {
      setMeasuredHeaderHeight((prev) => (prev === height ? prev : height));
    }
  }, []);

  const measureContainer = useCallback(
    () =>
      new Promise<{
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
          if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !(width > 0) ||
            !(height > 0)
          ) {
            resolve(null);
            return;
          }
          resolve({ x, y, width, height });
        });
      }),
    [],
  );

  const getReturnFrame = useCallback(
    async (index: number): Promise<Frame | null> => {
      try {
        if (index < 0 || index >= assetCountRef.current) return null;
        const container = await measureContainer();
        if (!container) return null;
        const columns = numColumnsRef.current;
        const cellSize = container.width / columns;
        if (cellSize <= 0) return null;
        // Sectioned mode swaps in the placement-table math (headers offset
        // every row); flat mode keeps the pure index math untouched
        const layout = sectionedLayoutRef.current;
        const placement = layout ? layout.placements[index] : undefined;
        if (layout && !placement) return null;
        const rect = placement
          ? sectionedCellImageRect(
              placement,
              cellSize,
              headerHeightRef.current,
              columns,
            )
          : cellImageRect(index, cellSize, headerHeightRef.current, columns);
        const frameAt = (offset: number): Frame => ({
          x: container.x + rect.x,
          y: container.y + rect.y - offset,
          width: rect.width,
          height: rect.height,
        });
        // Visible band: below the translucent status-bar scrim, above the
        // container's bottom edge.
        const visibleTop = Math.max(container.y, insetTopRef.current);
        const visibleBottom = container.y + container.height;
        let frame = frameAt(scrollY.value);
        // Scroll only when the cell is mostly hidden: any jump can show
        // through a pan-dismiss's semi-transparent backdrop, so a partially
        // clipped landing beats a visibly teleporting grid
        const visibleHeight =
          Math.min(frame.y + frame.height, visibleBottom) -
          Math.max(frame.y, visibleTop);
        const outOfView =
          visibleHeight < frame.height * MIN_VISIBLE_CELL_FRACTION;
        if (outOfView) {
          const list = listRef.current;
          if (!list) return null;
          // Centre the target cell in the viewport, clamped to the
          // scrollable range so the list never overshoots its content
          const contentHeight = layout
            ? headerHeightRef.current +
              layout.totalAssetRows * cellSize +
              layout.yearHeaderCount * YEAR_HEADER_HEIGHT +
              layout.monthHeaderCount * MONTH_HEADER_HEIGHT +
              bottomPaddingRef.current
            : headerHeightRef.current +
              Math.ceil(assetCountRef.current / columns) * cellSize +
              bottomPaddingRef.current;
          const maxOffset = Math.max(0, contentHeight - container.height);
          const desired = rect.rowTop + cellSize / 2 - container.height / 2;
          const offset = Math.min(Math.max(desired, 0), maxOffset);
          scrubberSuppress.value = true;
          list.scrollToOffset({ offset, animated: false });
          scrollY.value = offset;
          // Keep a collapsing header in sync with the jump too — its next
          // real scroll event would land it there anyway
          const mirror = animatedScrollYRef.current;
          if (mirror) {
            mirror.value = offset;
          }
          // Let the list commit and its scroll events settle before
          // trusting the offset again
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => resolve());
            });
          });
          frame = frameAt(scrollY.value);
          // One more frame so any trailing scroll events from the jump are
          // still suppressed before the scrubber resumes watching
          requestAnimationFrame(() => {
            scrubberSuppress.value = false;
          });
        }
        return frame;
      } catch {
        return null;
      }
    },
    [measureContainer, scrollY, scrubberSuppress],
  );

  useImperativeHandle(ref, () => ({ getReturnFrame }), [getReturnFrame]);

  // ---------------------------------------------------------------------
  // Deletion reflow: when a popping (deleting) cell finally leaves the
  // data, every cell after it moves back one slot. LayoutAnimation is a
  // no-op on the new architecture and FlashList v2 dropped its animation
  // hook, so the glide is done by hand: the render that first carries
  // the removal bumps a reflow generation with the removed slot's index,
  // and each affected cell starts at its OLD slot's offset (grid
  // geometry is deterministic) and animates its transform to zero. The
  // order snapshot exists only while a deletion is in flight, so the
  // common render path pays nothing. Flat mode only (the sectioned
  // camera-roll grid has no deletions).
  const [reflow, setReflow] = useState<{
    generation: number;
    fromIndex: number;
  } | null>(null);
  const prevOrderWhilePoppingRef = useRef<Map<string, number> | null>(null);
  if (!sectioned && poppingIds && poppingIds.length > 0) {
    const prevOrder = prevOrderWhilePoppingRef.current;
    let removedIndex: number | null = null;
    if (prevOrder) {
      for (const id of poppingIds) {
        const oldIndex = prevOrder.get(id);
        if (oldIndex != null && !assets.some((asset) => asset.id === id)) {
          removedIndex = oldIndex;
          break;
        }
      }
    }
    if (removedIndex != null) {
      // One-shot per removal; render-phase setState re-renders before
      // commit so the cells receive the new generation with this data
      prevOrderWhilePoppingRef.current = null;
      const fromIndex = removedIndex;
      setReflow((prev) => ({
        generation: (prev?.generation ?? 0) + 1,
        fromIndex,
      }));
    } else {
      const order = new Map<string, number>();
      assets.forEach((asset, index) => order.set(asset.id, index));
      prevOrderWhilePoppingRef.current = order;
    }
  } else {
    prevOrderWhilePoppingRef.current = null;
  }

  const flatCellSize =
    containerSize != null && containerSize.width > 0
      ? containerSize.width / numColumns
      : undefined;

  // Set lookup — O(P) .includes ran per visible cell per render
  const poppingSet = useMemo(
    () => new Set(poppingIds ?? []),
    [poppingIds],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: MediaAsset; index: number }) => (
      <GridCell
        asset={item}
        index={index}
        numColumns={numColumns}
        onPressItem={onPressItem}
        onCellImageLoad={onCellImageLoad}
        dimmed={index === dimmedIndex}
        popping={poppingSet.has(item.id)}
        reflowGeneration={reflow?.generation}
        reflowFromIndex={reflow?.fromIndex}
        cellSize={flatCellSize}
      />
    ),
    [
      onPressItem,
      onCellImageLoad,
      dimmedIndex,
      numColumns,
      poppingSet,
      reflow,
      flatCellSize,
    ],
  );

  const keyExtractor = useCallback((item: MediaAsset) => item.id, []);

  // Re-render visible cells when preview dimming, deletion pops, or a
  // reflow generation change
  const extraData = useMemo(
    () => ({ dimmedIndex, poppingIds, reflow }),
    [dimmedIndex, poppingIds, reflow],
  );


  // -------------------------------------------------------------------------
  // Sectioned rendering + scrubber plumbing
  // -------------------------------------------------------------------------

  const renderSectionedItem = useCallback(
    ({ item }: { item: SectionedGridItem }) => {
      if (item.type === "year") {
        return <YearHeader label={item.label} />;
      }
      if (item.type === "month") {
        return <MonthHeader label={item.label} yearLabel={item.yearLabel} />;
      }
      const placement = sectionedLayout?.placements[item.assetIndex];
      return (
        <GridCell
          asset={item.asset}
          index={item.assetIndex}
          numColumns={numColumns}
          col={placement?.col}
          flushTop={placement ? placement.sectionRow === 0 : undefined}
          onPressItem={onPressItem}
          onCellImageLoad={onCellImageLoad}
          dimmed={item.assetIndex === dimmedIndex}
          popping={poppingIds?.includes(item.asset.id) === true}
        />
      );
    },
    [
      sectionedLayout,
      onPressItem,
      onCellImageLoad,
      dimmedIndex,
      numColumns,
      poppingIds,
    ],
  );

  const sectionedKeyExtractor = useCallback(
    (item: SectionedGridItem) =>
      item.type === "asset" ? item.asset.id : item.key,
    [],
  );

  // FlashList v2: mutate layout.span in place — header rows span the full
  // width, which also forces the next asset row to start fresh (the
  // placement table's rowsBefore math relies on exactly this)
  const overrideSectionedItemLayout = useCallback(
    (layout: { span?: number }, item: SectionedGridItem) => {
      if (item.type !== "asset") {
        layout.span = numColumns;
      }
    },
    [numColumns],
  );

  const getSectionedItemType = useCallback(
    (item: SectionedGridItem) => item.type,
    [],
  );

  // Pixel-space month ranges + total content height for the scrubber (and
  // its date bubble), derived from the same structural table as the
  // return-frame math so they can never disagree
  const scrubberData = useMemo(() => {
    if (
      !sectioned ||
      !sectionedLayout ||
      !containerSize ||
      containerSize.width <= 0 ||
      sectionedLayout.sections.length === 0
    ) {
      return null;
    }
    const cellSize = containerSize.width / numColumns;
    const {
      sections,
      totalAssetRows,
      yearHeaderCount,
      monthHeaderCount,
    } = sectionedLayout;
    const sectionTopY = (section: (typeof sections)[number]): number =>
      measuredHeaderHeight +
      section.rowsBefore * cellSize +
      section.yearHeadersBefore * YEAR_HEADER_HEIGHT +
      section.monthHeadersBefore * MONTH_HEADER_HEIGHT;
    const endY =
      measuredHeaderHeight +
      totalAssetRows * cellSize +
      yearHeaderCount * YEAR_HEADER_HEIGHT +
      monthHeaderCount * MONTH_HEADER_HEIGHT;
    const monthRanges: MonthRange[] = sections.map((section, i) => ({
      label: section.label,
      topY: sectionTopY(section),
      bottomY:
        i + 1 < sections.length ? sectionTopY(sections[i + 1]) : endY,
    }));
    return { monthRanges, contentHeight: endY + contentBottomPadding };
  }, [
    sectioned,
    sectionedLayout,
    containerSize,
    numColumns,
    measuredHeaderHeight,
    contentBottomPadding,
  ]);

  const showScrubber =
    scrubberData !== null &&
    containerSize !== null &&
    containerSize.height > 0 &&
    scrubberData.contentHeight >
      containerSize.height * SCRUBBER_MIN_CONTENT_RATIO;

  const handleScrubToOffset = useCallback((offset: number) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollToOffset({ offset: Math.max(0, offset), animated: false });
  }, []);

  // Wrap the header so its height is known to the return-frame math
  const wrappedHeader = useMemo(() => {
    if (!ListHeaderComponent) return undefined;
    return <View onLayout={handleHeaderLayout}>{ListHeaderComponent}</View>;
  }, [ListHeaderComponent, handleHeaderLayout]);

  const ListFooter = useMemo(() => {
    if (!isLoadingMore || !hasMore || assets.length === 0) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#999" />
      </View>
    );
  }, [isLoadingMore, hasMore, assets.length]);

  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: contentBottomPadding }),
    [contentBottomPadding],
  );

  // Year and month headers pin to the top while their section scrolls,
  // each pushed away by the next one (iOS Photos / contact-list behavior).
  // FlashList v2 renders these in its own sticky overlay, so the in-list
  // geometry (and all the return-frame math built on it) is unaffected.
  const stickyHeaderIndices = useMemo(() => {
    if (!sectionedLayout) return undefined;
    const indices: number[] = [];
    sectionedLayout.items.forEach((item, index) => {
      if (item.type !== "asset") {
        indices.push(index);
      }
    });
    return indices;
  }, [sectionedLayout]);

  return (
    <View
      ref={containerRef}
      style={styles.container}
      collapsable={false}
      onLayout={handleContainerLayout}
    >
      <AnimatedFlashList
        ref={listRef}
        data={sectionedLayout ? sectionedLayout.items : assets}
        renderItem={sectionedLayout ? renderSectionedItem : renderItem}
        keyExtractor={sectionedLayout ? sectionedKeyExtractor : keyExtractor}
        numColumns={numColumns}
        overrideItemLayout={
          sectionedLayout ? overrideSectionedItemLayout : undefined
        }
        getItemType={sectionedLayout ? getSectionedItemType : undefined}
        stickyHeaderIndices={stickyHeaderIndices}
        contentContainerStyle={contentContainerStyle}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        extraData={extraData}
        ListHeaderComponent={wrappedHeader}
        ListEmptyComponent={ListEmptyComponent ?? undefined}
        ListFooterComponent={ListFooter}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#999"
            />
          ) : undefined
        }
      />
      {showScrubber && scrubberData && containerSize && (
        <GridScrubber
          scrollY={scrollY}
          contentHeight={scrubberData.contentHeight}
          viewportHeight={containerSize.height}
          monthRanges={scrubberData.monthRanges}
          onScrubToOffset={handleScrubToOffset}
          suppressActivity={scrubberSuppress}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  cell: {
    width: "100%",
    aspectRatio: 1,
  },
  cellInner: {
    flex: 1,
  },
  cellPop: {
    flex: 1,
  },
  cellImage: {
    flex: 1,
    backgroundColor: "#f0f0f0",
  },
  durationBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  // Like count, bottom-left (duration/play keeps bottom-right)
  likeBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 9,
    paddingHorizontal: 6,
    height: 18,
  },
  likeBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  durationText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  dimmedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#e3e3e3",
  },
  // Fixed-height section headers (geometry math depends on these heights).
  // White backgrounds so photos scrolling under a sticky screen header
  // still look clean.
  yearHeader: {
    height: YEAR_HEADER_HEIGHT,
    backgroundColor: "#fff",
    justifyContent: "flex-end",
    paddingLeft: 12,
    paddingBottom: 6,
  },
  yearHeaderText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#000",
  },
  monthHeader: {
    height: MONTH_HEADER_HEIGHT,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingLeft: 12,
    paddingBottom: 6,
  },
  monthHeaderText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  monthHeaderYearText: {
    fontSize: 13,
    color: "#999",
    marginBottom: 1,
  },
  footer: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CameraRollGrid;
