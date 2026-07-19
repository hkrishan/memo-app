# Performance Testing Checklist

This document outlines how to measure and verify performance in the Memo app.

## Quick Start

The app includes built-in performance instrumentation (dev-only). Performance logs appear in the Metro console with the `[PERF]` prefix.

### Automatic Metrics

The following are automatically tracked:
- **TTI (Time To Interactive)**: Time from app launch to first interactive UI
- **Media Library Load**: Time to load photos from device
- **Upload Single/Batch**: Time to upload photos to albums

### Viewing Metrics

In development, all performance traces log to the console:
```
[PERF] ▶️ mediaLibraryLoad started
[PERF] ⏹️ mediaLibraryLoad: 1234ms
[PERF] ⏱️ TTI: 1500ms
```

## Performance Budgets

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| TTI (Cold Start) | < 1500ms | < 3000ms |
| Gallery Scroll | 60 FPS | > 45 FPS |
| Photo Grid Scroll | 60 FPS | > 50 FPS |
| Media Library Load (50 items) | < 500ms | < 2000ms |
| Upload Single Photo | < 5s | < 15s |
| Upload Batch (10 photos) | < 15s | < 60s |
| Memory (gallery scroll) | < 200MB | < 400MB |

## Manual Testing Procedures

### 1. Startup Performance

**Goal:** Measure cold start to interactive UI

**Steps:**
1. Force close the app completely
2. Open Metro bundler, clear terminal
3. Launch app from device home screen
4. Watch for `[PERF] ⏱️ TTI: XXXms` in console

**What to look for:**
- TTI should be under 1500ms
- No visible white screens or loading spinners > 500ms

### 2. Gallery Scroll Performance

**Goal:** Verify smooth scrolling through photo grid

**Setup:**
- Have 500+ photos in device gallery
- Enable GPU profiling on device (Settings > Developer Options > Profile GPU rendering)

**Steps:**
1. Navigate to Albums tab
2. Wait for gallery to load
3. Scroll rapidly up and down through the carousel
4. Navigate to a specific album with 100+ photos
5. Scroll rapidly through the photo grid

**What to look for:**
- No visible "blank" areas during scroll
- Frame rate stays consistent (use GPU profiler overlay)
- No significant jank or stuttering

### 3. Photo Upload Performance

**Goal:** Verify batch upload speed and progress tracking

**Steps:**
1. Create or select an album
2. Tap "Add Photos"
3. Select exactly 10 photos
4. Start upload
5. Watch console for: `[PERF] ⏹️ uploadBatch[10]: XXXms`

**What to look for:**
- Progress indicator updates smoothly
- Total time under 15 seconds (good network)
- No UI freezing during upload

### 4. Camera Performance

**Goal:** Verify camera responsiveness and capture speed

**Steps:**
1. Navigate to Camera tab
2. Test pinch-to-zoom (should be smooth)
3. Tap to focus (indicator should appear immediately)
4. Capture a photo
5. Verify preview appears quickly
6. Switch between front/back camera

**What to look for:**
- Zoom animation is 60 FPS
- Focus indicator appears < 100ms after tap
- Photo preview appears < 500ms after capture
- Camera switch is < 300ms

### 5. Memory Testing

**Goal:** Verify no memory leaks during typical usage

**Tools:**
- iOS: Xcode Instruments (Allocations)
- Android: Android Studio Memory Profiler

**Steps:**
1. Launch app fresh
2. Note initial memory usage
3. Scroll through gallery (500+ photos)
4. Open 10 different albums
5. Take 5 photos with camera
6. Upload 5 photos
7. Navigate back to home
8. Check memory usage

**What to look for:**
- Memory should return close to baseline after navigation
- No sustained growth over multiple navigation cycles
- Peak memory during gallery scroll < 400MB

## Profiling Tools

### React DevTools Profiler

1. Install React DevTools
2. Connect to running app
3. Go to "Profiler" tab
4. Record during interaction
5. Look for components with long render times

### Flipper (React Native)

1. Install Flipper desktop app
2. Install `react-native-flipper` plugin
3. Use "React DevTools" plugin for component tree
4. Use "Network" plugin for API timing

### Native Profilers

**iOS (Instruments):**
- Time Profiler: CPU usage analysis
- Allocations: Memory usage
- Core Animation: Frame rate

**Android (Android Studio):**
- CPU Profiler: Method tracing
- Memory Profiler: Heap analysis
- GPU Profiler: Frame rendering

## Adding Custom Instrumentation

To add performance tracking to new features:

```typescript
import { perf } from "@/lib/performance";

// Simple interaction trace
const endTrace = perf.startInteraction("myFeature.action");
await doSomething();
endTrace(); // Logs: [PERF] ⏹️ myFeature.action: XXXms

// Wrap async operations
await perf.measure("myFeature.load", async () => {
  await loadData();
});

// Record custom metrics
perf.recordMeasurement("customMetric", 123);

// Get statistics
const stats = perf.getStats("myFeature.action");
// { avg: 150, min: 100, max: 200, count: 5 }

// Print all stats
perf.printStats();
```

## CI/CD Integration

Consider adding performance gates:

```yaml
# Example: Fail if TTI > 3000ms
- name: Check Performance
  run: |
    TTI=$(grep "TTI:" test-output.log | grep -oE '[0-9]+')
    if [ "$TTI" -gt 3000 ]; then
      echo "TTI exceeded threshold: ${TTI}ms > 3000ms"
      exit 1
    fi
```

## Regression Testing

Before each release:

1. [ ] TTI < 1500ms
2. [ ] Gallery scroll is smooth (60 FPS)
3. [ ] Photo grid scroll is smooth (60 FPS)
4. [ ] Upload 10 photos < 20s
5. [ ] Memory returns to baseline after navigation
6. [ ] Camera capture < 500ms
7. [ ] No ANRs or UI freezes during typical usage
