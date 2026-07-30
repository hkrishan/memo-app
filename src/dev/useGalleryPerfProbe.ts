/**
 * PERF-PROBE (TEMPORARY — remove after profiling session).
 *
 * Drives the album gallery through the three reported-laggy flows and
 * measures them:
 *
 *  1. grid_scroll   — fast scripted scroll down + up the photo grid,
 *                     UI-thread frame gaps + JS-thread stalls recorded.
 *  2. open_cold     — programmatic tile press; the tagged marks inside
 *                     GalleryPageB/PhotoViewer produce the open waterfall.
 *  3. viewer_swipe  — six animated single-step pages in the viewer.
 *  4. open_warm     — reopen of the same photo with everything cached.
 *
 * Runs once per JS load, only when PERF_PROBE_ENABLED.
 */

import { useEffect, useRef } from "react";
import { useFrameCallback, useSharedValue } from "react-native-reanimated";

import type { MediaAsset } from "@/features/album/hooks";
import {
  JsStallMonitor,
  PERF_PROBE_ENABLED,
  addSection,
  mark,
  sleep,
  waitForAnyMark,
  writeReport,
  type UiFrameReport,
} from "./perfProbe";

let hasRun = false;

interface GalleryProbeInput {
  /** Ref holding the (Animated)FlashList instance. */
  listRef: React.MutableRefObject<unknown>;
  /** Current filtered assets, freshest render. */
  assetsRef: React.MutableRefObject<MediaAsset[]>;
  /** GalleryPageB's handleTilePress. */
  openAssetRef: React.MutableRefObject<(assetId: string) => void>;
}

/** Offsets for the scripted grid scroll (pt). ~3000pt/s sustained. */
const GRID_SCROLL_OFFSETS = [1200, 2400, 3600, 4600, 3400, 2200, 1000, 0];
const GRID_STEP_MS = 420;
const SWIPE_COUNT = 6;
const SWIPE_STEP_MS = 650;
/** Grid index used for both viewer opens. Row 1 — must be fully visible at
 *  scroll offset 0 (hero header ≈520pt + one row) or the tile visibility
 *  check fails and the viewer falls back to the fade path instead of the
 *  flight we want to measure. NOTE: photo 4 is inside the ImageWarmup range
 *  (first 6 display images prefetched), so the "cold" open measures flight
 *  latency with a warm display cache — matching the common real-world tap. */
const OPEN_TARGET_INDEX = 4;

export function useGalleryPerfProbe({
  listRef,
  assetsRef,
  openAssetRef,
}: GalleryProbeInput): void {
  // ---- UI-thread frame monitor (shared values written from the frame
  // callback worklet, read from JS when a phase ends) ----
  const uiActive = useSharedValue(false);
  const uiLast = useSharedValue(-1);
  const uiFrames = useSharedValue(0);
  const uiTotal = useSharedValue(0);
  const uiMax = useSharedValue(0);
  const uiOver25 = useSharedValue(0);
  const uiOver42 = useSharedValue(0);
  const uiOver84 = useSharedValue(0);
  const uiOver200 = useSharedValue(0);

  useFrameCallback((info) => {
    "worklet";
    if (!uiActive.value) {
      uiLast.value = -1;
      return;
    }
    const t = info.timestamp;
    if (uiLast.value > 0) {
      const dt = t - uiLast.value;
      uiFrames.value += 1;
      uiTotal.value += dt;
      if (dt > uiMax.value) uiMax.value = dt;
      if (dt > 25) uiOver25.value += 1;
      if (dt > 42) uiOver42.value += 1;
      if (dt > 84) uiOver84.value += 1;
      if (dt > 200) uiOver200.value += 1;
    }
    uiLast.value = t;
  }, PERF_PROBE_ENABLED);

  const startUi = () => {
    uiFrames.value = 0;
    uiTotal.value = 0;
    uiMax.value = 0;
    uiOver25.value = 0;
    uiOver42.value = 0;
    uiOver84.value = 0;
    uiOver200.value = 0;
    uiLast.value = -1;
    uiActive.value = true;
  };

  const stopUi = (): UiFrameReport => {
    uiActive.value = false;
    const frames = uiFrames.value;
    return {
      frames,
      durationMs: Math.round(uiTotal.value),
      avgMs: frames > 0 ? +(uiTotal.value / frames).toFixed(2) : 0,
      maxMs: +uiMax.value.toFixed(1),
      over25: uiOver25.value,
      over42: uiOver42.value,
      over84: uiOver84.value,
      over200: uiOver200.value,
    };
  };

  const startUiRef = useRef(startUi);
  startUiRef.current = startUi;
  const stopUiRef = useRef(stopUi);
  stopUiRef.current = stopUi;

  useEffect(() => {
    if (!PERF_PROBE_ENABLED || hasRun) return;
    // Wait for a real dataset before committing to the run
    if (assetsRef.current.length < 40) return;
    hasRun = true;

    const js = new JsStallMonitor();

    const scrollTo = (offset: number) => {
      const node = listRef.current as
        | { scrollToOffset?: (p: { offset: number; animated: boolean }) => void; getNode?: () => { scrollToOffset?: (p: { offset: number; animated: boolean }) => void } }
        | null;
      const target =
        node && typeof node.scrollToOffset === "function"
          ? node
          : node?.getNode?.();
      target?.scrollToOffset?.({ offset, animated: true });
    };

    (async () => {
      // eslint-disable-next-line no-console
      console.log("[PERF-PROBE] gallery probe starting");
      await sleep(2500);

      // ---- Phase 1: grid scroll ----
      mark("grid_scroll_start");
      startUiRef.current();
      js.start();
      for (const offset of GRID_SCROLL_OFFSETS) {
        scrollTo(offset);
        await sleep(GRID_STEP_MS);
      }
      await sleep(300);
      addSection("grid_scroll", { ui: stopUiRef.current(), js: js.stop() });
      mark("grid_scroll_end");
      await sleep(700);

      // ---- Phase 2: cold viewer open ----
      const target = assetsRef.current[OPEN_TARGET_INDEX];
      if (target) {
        mark("tap_cold");
        openAssetRef.current(target.id);
        await waitForAnyMark(["overlay_dropped", "fade_open"], 5000);
        await sleep(700);
      }

      // ---- Phase 3: viewer swipes ----
      const drive = (globalThis as Record<string, unknown>).__memoViewerDrive as
        | { jump: (delta: number) => void; close: () => void }
        | undefined;
      if (drive) {
        startUiRef.current();
        js.start();
        for (let i = 0; i < SWIPE_COUNT; i += 1) {
          mark(`swipe_${i}`);
          drive.jump(1);
          await sleep(SWIPE_STEP_MS);
        }
        await sleep(300);
        addSection("viewer_swipe", { ui: stopUiRef.current(), js: js.stop() });

        // ---- Phase 4: close, then warm reopen ----
        drive.close();
        await sleep(1400);
        if (target) {
          mark("tap_warm");
          openAssetRef.current(target.id);
          await waitForAnyMark(["overlay_dropped", "fade_open"], 5000);
          await sleep(500);
          const drive2 = (globalThis as Record<string, unknown>)
            .__memoViewerDrive as { close: () => void } | undefined;
          drive2?.close();
          await sleep(900);
        }
      } else {
        // eslint-disable-next-line no-console
        console.log("[PERF-PROBE] viewer drive hook missing — skip swipes");
      }

      await writeReport();
      // eslint-disable-next-line no-console
      console.log("[PERF-PROBE] gallery probe finished");
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.log("[PERF-PROBE] gallery probe failed", err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsRef.current.length >= 40]);
}
