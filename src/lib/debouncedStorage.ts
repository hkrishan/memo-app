/**
 * AsyncStorage adapter for zustand's persist middleware that coalesces
 * rapid writes. The upload queues patch their state many times per photo
 * (staging, progress, per-target results); zustand persist has no
 * throttle, so each patch serialized the whole queue and crossed the
 * bridge — hundreds of full writes per picker batch. Debouncing keeps
 * the last state per key and writes it once things settle.
 *
 * Tradeoff: a hard kill inside the debounce window loses the last
 * moments of queue state. Both queues already treat rehydrated state as
 * approximate (in-flight entries reset to queued and resume), so a
 * slightly stale snapshot is recoverable by design.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StateStorage } from "zustand/middleware";

export const createDebouncedStorage = (delayMs = 1000): StateStorage => {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, string>();

  const flush = (name: string) => {
    timers.delete(name);
    const value = pending.get(name);
    pending.delete(name);
    if (value != null) void AsyncStorage.setItem(name, value);
  };

  return {
    getItem: (name) => AsyncStorage.getItem(name),
    setItem: (name, value) => {
      pending.set(name, value);
      const existing = timers.get(name);
      if (existing) clearTimeout(existing);
      timers.set(name, setTimeout(() => flush(name), delayMs));
    },
    removeItem: (name) => {
      const timer = timers.get(name);
      if (timer) clearTimeout(timer);
      timers.delete(name);
      pending.delete(name);
      return AsyncStorage.removeItem(name);
    },
  };
};
