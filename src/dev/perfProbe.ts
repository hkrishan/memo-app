/**
 * PERF-PROBE (TEMPORARY — remove after profiling session).
 *
 * In-app profiling harness: records named timestamps (marks), monitors
 * JS-thread event-loop stalls, and writes a JSON report into the app's
 * Documents directory where it can be read from the host machine via
 * `xcrun simctl get_app_container`.
 *
 * Enabled only in dev. Every hook into app code is optional-chained off
 * globalThis so removing this folder (and the few tagged call sites)
 * restores the app exactly.
 */

import * as FileSystem from "expo-file-system/legacy";

// Flip to true to re-run the probe (auto-login + scripted scroll/open/swipe
// on the probe album, report written to Documents/perf-report.json).
export const PERF_PROBE_ENABLED: boolean = __DEV__ && false;

/** Johan Andersson — member of the largest local album. */
export const PROBE_USER_ID = "019faa8c-abd8-701c-ae17-6dc165529162";
/** "Summer☀️☀️☀️2025" — 140 photos in the local dev DB. */
export const PROBE_ALBUM_ID = "019faa8d-6bc5-76ef-8c08-8602ddf8e4d8";

export interface PerfMark {
  name: string;
  t: number;
}

const marks: PerfMark[] = [];

export const mark = (name: string): void => {
  if (!PERF_PROBE_ENABLED) return;
  marks.push({ name, t: performance.now() });
};

export const getMarks = (): PerfMark[] => [...marks];

/** Resolves true when any of `names` is recorded AFTER this call. */
export const waitForAnyMark = (
  names: string[],
  timeoutMs: number,
): Promise<boolean> => {
  const from = performance.now();
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      if (marks.some((m) => names.includes(m.name) && m.t >= from)) {
        resolve(true);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(poll, 40);
    };
    poll();
  });
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface JsStallReport {
  ticks: number;
  /** Ticks that arrived >2 frames late (event loop blocked ≥33ms extra). */
  stallsOver33: number;
  /** Ticks >100ms late — user-feelable JS freezes. */
  stallsOver100: number;
  maxStallMs: number;
  totalStalledMs: number;
}

/** Detects JS-thread blockage by measuring setInterval drift. */
export class JsStallMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private readonly intervalMs = 33;
  private report: JsStallReport = emptyJsReport();

  start(): void {
    this.report = emptyJsReport();
    this.last = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      const drift = now - this.last - this.intervalMs;
      this.last = now;
      this.report.ticks += 1;
      if (drift > 33) {
        this.report.stallsOver33 += 1;
        this.report.totalStalledMs += drift;
        if (drift > 100) this.report.stallsOver100 += 1;
        if (drift > this.report.maxStallMs) this.report.maxStallMs = drift;
      }
    }, this.intervalMs);
  }

  stop(): JsStallReport {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    return { ...this.report };
  }
}

const emptyJsReport = (): JsStallReport => ({
  ticks: 0,
  stallsOver33: 0,
  stallsOver100: 0,
  maxStallMs: 0,
  totalStalledMs: 0,
});

export interface UiFrameReport {
  frames: number;
  durationMs: number;
  avgMs: number;
  maxMs: number;
  /** Frame gaps >25ms (≥1 dropped frame at 60Hz). */
  over25: number;
  /** >42ms (≥2 dropped). */
  over42: number;
  /** >84ms (≥4 dropped — a visible hitch). */
  over84: number;
  /** >200ms (a hard freeze). */
  over200: number;
}

const report: Record<string, unknown> = {};

export const addSection = (name: string, data: unknown): void => {
  report[name] = data;
};

export const writeReport = async (): Promise<void> => {
  const payload = {
    finishedAt: new Date().toISOString(),
    sections: report,
    marks,
  };
  const json = JSON.stringify(payload, null, 2);
  // eslint-disable-next-line no-console
  console.log("[PERF-PROBE] REPORT " + json);
  try {
    await FileSystem.writeAsStringAsync(
      `${FileSystem.documentDirectory}perf-report.json`,
      json,
    );
    // eslint-disable-next-line no-console
    console.log("[PERF-PROBE] report written to Documents/perf-report.json");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log("[PERF-PROBE] file write failed", err);
  }
};

// Register the global mark hook the tagged call sites use.
if (PERF_PROBE_ENABLED) {
  (globalThis as Record<string, unknown>).__memoPerfMark = mark;
}
