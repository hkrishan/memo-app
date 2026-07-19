/**
 * Performance Instrumentation Library
 * DEV-ONLY: Provides markers and utilities to measure app performance.
 * All logging is disabled in production builds.
 */

import { env } from "./env";

const isDev = env?.isDevelopment ?? __DEV__;

interface InteractionMark {
  name: string;
  startTime: number;
}

interface PerfMetrics {
  startupStart: number;
  ttiMarked: boolean;
  interactions: Map<string, InteractionMark>;
  measurements: Map<string, number[]>;
}

const metrics: PerfMetrics = {
  startupStart: 0,
  ttiMarked: false,
  interactions: new Map(),
  measurements: new Map(),
};

/**
 * Performance markers and utilities
 */
export const perf = {
  /**
   * Mark app startup start time. Call this as early as possible (e.g., index.ts)
   */
  markStartup(): void {
    metrics.startupStart = Date.now();
    if (isDev) {
      console.log("[PERF] Startup marked");
    }
  },

  /**
   * Mark Time To Interactive (first meaningful render complete)
   * Call this when the main UI is ready for user interaction
   */
  markTTI(): void {
    if (metrics.ttiMarked) return;
    metrics.ttiMarked = true;

    const tti = Date.now() - metrics.startupStart;
    if (isDev) {
      console.log(`[PERF] ⏱️ TTI: ${tti}ms`);
    }
    this.recordMeasurement("tti", tti);
  },

  /**
   * Start an interaction trace. Returns a function to end the trace.
   * @param name - Name of the interaction (e.g., "galleryOpen", "uploadBatch")
   * @returns End function that logs duration when called
   */
  startInteraction(name: string): () => number {
    const startTime = Date.now();
    const id = `${name}_${startTime}`;
    metrics.interactions.set(id, { name, startTime });

    if (isDev) {
      console.log(`[PERF] ▶️ ${name} started`);
    }

    return () => {
      const mark = metrics.interactions.get(id);
      if (!mark) return 0;

      const duration = Date.now() - mark.startTime;
      metrics.interactions.delete(id);

      if (isDev) {
        console.log(`[PERF] ⏹️ ${name}: ${duration}ms`);
      }
      this.recordMeasurement(name, duration);
      return duration;
    };
  },

  /**
   * Measure a synchronous or async operation
   * @param name - Name of the operation
   * @param operation - Function to measure (can be async)
   */
  async measure<T>(name: string, operation: () => T | Promise<T>): Promise<T> {
    const end = this.startInteraction(name);
    try {
      const result = await operation();
      return result;
    } finally {
      end();
    }
  },

  /**
   * Record a measurement value for later analysis
   */
  recordMeasurement(name: string, value: number): void {
    const existing = metrics.measurements.get(name) ?? [];
    existing.push(value);
    // Keep only last 100 measurements per metric
    if (existing.length > 100) {
      existing.shift();
    }
    metrics.measurements.set(name, existing);
  },

  /**
   * Get statistics for a specific measurement
   */
  getStats(name: string): { avg: number; min: number; max: number; count: number } | null {
    const values = metrics.measurements.get(name);
    if (!values || values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round(sum / values.length),
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
  },

  /**
   * Print all collected stats to console (dev only)
   */
  printStats(): void {
    if (!isDev) return;

    console.log("\n[PERF] 📊 Performance Statistics:");
    console.log("================================");

    metrics.measurements.forEach((values, name) => {
      const stats = this.getStats(name);
      if (stats) {
        console.log(
          `${name}: avg=${stats.avg}ms, min=${stats.min}ms, max=${stats.max}ms (n=${stats.count})`
        );
      }
    });
    console.log("================================\n");
  },

  /**
   * Clear all measurements (useful for fresh testing)
   */
  reset(): void {
    metrics.startupStart = 0;
    metrics.ttiMarked = false;
    metrics.interactions.clear();
    metrics.measurements.clear();
    if (isDev) {
      console.log("[PERF] Metrics reset");
    }
  },

  /**
   * Get raw metrics (for debugging/testing)
   */
  getMetrics(): Readonly<PerfMetrics> {
    return { ...metrics };
  },
};

/**
 * Hook for component-level performance tracking
 * Use this to track mount/unmount and render times
 */
export function createComponentPerfTracker(componentName: string) {
  return {
    trackMount(): () => void {
      return perf.startInteraction(`${componentName}.mount`);
    },
    trackRender(): () => void {
      return perf.startInteraction(`${componentName}.render`);
    },
  };
}

// Standard interaction names for consistency
export const PerfInteractions = {
  STARTUP: "startup",
  TTI: "tti",
  GALLERY_OPEN: "galleryOpen",
  ALBUM_OPEN: "albumOpen",
  PHOTO_OPEN: "photoOpen",
  PHOTO_CAPTURE: "photoCapture",
  UPLOAD_SINGLE: "uploadSingle",
  UPLOAD_BATCH: "uploadBatch",
  MEDIA_LIBRARY_LOAD: "mediaLibraryLoad",
  NAVIGATION: "navigation",
  SCROLL_START: "scrollStart",
} as const;

export type PerfInteractionName = (typeof PerfInteractions)[keyof typeof PerfInteractions];

export default perf;
