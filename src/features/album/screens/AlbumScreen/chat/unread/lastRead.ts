// Per-album "last read" watermark for chat, persisted in AsyncStorage under
// `chat:lastRead:<albumId>` with an in-memory cache (repeated reads are
// sync-fast) and a tiny pub/sub so the unread hook reacts immediately when
// the chat screen marks messages read.

import AsyncStorage from "@react-native-async-storage/async-storage";

const storageKey = (albumId: string) => `chat:lastRead:${albumId}`;

/** albumId -> last-read timestamp (ms since epoch, 0 = never read). */
const cache = new Map<string, number>();
/** albumId -> in-flight AsyncStorage load, so concurrent reads share one IO. */
const loads = new Map<string, Promise<number>>();
/** albumId -> listeners notified when the watermark advances. */
const listeners = new Map<string, Set<(timestampMs: number) => void>>();

/**
 * Last-read timestamp for an album (0 when never read). Cached in memory
 * after the first read; storage failures resolve to the cached value or 0.
 */
export function getLastRead(albumId: string): Promise<number> {
  const cached = cache.get(albumId);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = loads.get(albumId);
  if (pending) return pending;

  const load = AsyncStorage.getItem(storageKey(albumId))
    .then((raw) => {
      // A setLastRead that raced this load wins over the stored value.
      const current = cache.get(albumId);
      if (current !== undefined) return current;

      const parsed = raw ? Number(raw) : 0;
      const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      cache.set(albumId, value);
      return value;
    })
    .catch(() => cache.get(albumId) ?? 0)
    .finally(() => {
      loads.delete(albumId);
    });

  loads.set(albumId, load);
  return load;
}

/**
 * Advance the last-read watermark for an album. Monotonic — calls with an
 * older timestamp are ignored. Updates the cache synchronously, notifies
 * subscribers, and persists best-effort in the background.
 */
export function setLastRead(albumId: string, timestampMs: number): void {
  const previous = cache.get(albumId) ?? 0;
  if (timestampMs <= previous) return;

  cache.set(albumId, timestampMs);

  listeners.get(albumId)?.forEach((listener) => {
    try {
      listener(timestampMs);
    } catch {
      // Never let a listener error break the write path
    }
  });

  AsyncStorage.setItem(storageKey(albumId), String(timestampMs)).catch(() => {
    // Persistence is best-effort; the in-memory value still applies.
  });
}

/**
 * Subscribe to last-read changes for an album. Returns an unsubscribe fn.
 */
export function subscribeToLastRead(
  albumId: string,
  listener: (timestampMs: number) => void,
): () => void {
  let set = listeners.get(albumId);
  if (!set) {
    set = new Set();
    listeners.set(albumId, set);
  }
  set.add(listener);

  return () => {
    const current = listeners.get(albumId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(albumId);
  };
}
