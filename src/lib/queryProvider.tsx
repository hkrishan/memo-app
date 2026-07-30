/**
 * Query provider with a disk-persisted cache: the last successful server
 * data (albums, photos, feed, …) is snapshotted to AsyncStorage and
 * restored on launch, so the app renders real content with no network —
 * queries then refetch in the background once connectivity is there
 * (onlineManager is NetInfo-wired in queryClient).
 *
 * Persistence is deliberately narrow. Snapshotting EVERYTHING made the
 * persister JSON.stringify multi-megabytes of photo lists on the JS
 * thread every couple of seconds (each cache event schedules a write) —
 * a repeating interaction-time stall. Only the queries that make the app
 * useful offline are persisted, infinite queries are capped to their
 * first page, and writes are throttled well past interaction bursts.
 */

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { queryClient, QUERY_CACHE_MAX_AGE_MS } from "./api/queryClient";

/**
 * Key roots worth having offline — everything a cold offline launch needs
 * to render real content: the album shelves (albums), each album's photo
 * grid (photos), the feeds, "My Photos" (library), the profile (user),
 * each album's moments and page tab, and the activity feed. Everything
 * else (chat, comments, tags, search, invites, open-drop polling) is
 * session data that refetches fine and only bloats the snapshot. Note
 * some roots also prefix session sub-queries — those are excluded by key
 * shape below.
 */
const PERSISTED_ROOTS = new Set([
  "albums",
  "photos",
  "feed",
  "feedAlbums",
  "user",
  "library",
  "moments",
  "page",
  "activity",
  "pagePosts",
]);

const shouldPersistKey = (queryKey: readonly unknown[]): boolean => {
  const root = queryKey[0];
  if (typeof root !== "string" || !PERSISTED_ROOTS.has(root)) return false;
  switch (root) {
    // ["photos", albumId] is an album's photo list; longer keys under the
    // same root are comments/tags — session data, not offline content
    case "photos":
      return queryKey.length === 2;
    // ["moments", albumId] only — ["moments", "open-drops"] is a live
    // poll whose staleness would falsely announce an open drop offline
    case "moments":
      return queryKey[1] !== "open-drops";
    // ["page", albumId] is the album's page; longer keys (view/members)
    // are session data
    case "page":
      return queryKey.length === 2;
    // ["pagePosts", albumId, pageId] is a page's post list; the 5-part
    // keys under the same root are per-post comments
    case "pagePosts":
      return queryKey.length === 3;
    default:
      return true;
  }
};

/** First-page cap for persisted infinite queries: 100 photos / 25 feed
 *  items render a perfectly useful offline screen at a fraction of the
 *  serialization cost of a fully-drained album. */
const capInfinitePages = (data: unknown): unknown => {
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { pages?: unknown[] }).pages) &&
    Array.isArray((data as { pageParams?: unknown[] }).pageParams)
  ) {
    const infinite = data as { pages: unknown[]; pageParams: unknown[] };
    if (infinite.pages.length > 1) {
      return {
        ...infinite,
        pages: infinite.pages.slice(0, 1),
        pageParams: infinite.pageParams.slice(0, 1),
      };
    }
  }
  return data;
};

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "memo-query-cache",
  // Writes ride out interaction bursts instead of landing inside them —
  // the snapshot is a launch artifact, it doesn't need 2s freshness
  throttleTime: 15_000,
  // A single unserializable value anywhere in the cache makes EVERY
  // persist fail silently — the snapshot then freezes at its last good
  // write and restarts restore ever-staler data. Surface it.
  serialize: (client) => {
    try {
      return JSON.stringify({
        ...client,
        clientState: {
          ...client.clientState,
          queries: client.clientState.queries.map((query) => ({
            ...query,
            state: {
              ...query.state,
              data: capInfinitePages(query.state.data),
            },
          })),
        },
      });
    } catch (error) {
      if (__DEV__) {
        console.warn("Query cache persist failed to serialize:", error);
      }
      throw error;
    }
  },
});

type Props = {
  children: React.ReactNode;
};

export function QueryProvider({ children }: Props) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: QUERY_CACHE_MAX_AGE_MS,
        // Bumped whenever the persisted shape changes incompatibly
        buster: "v3",
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" &&
            shouldPersistKey(query.queryKey),
        },
      }}
      onSuccess={() => {
        // Restored data is a snapshot from a PAST session — its signed
        // media URLs may be expired. Refresh ONLY the media-bearing keys
        // (the same predicate that gates persistence, so comment/tag
        // sub-queries under "photos" are excluded), and only the ones
        // something on screen is actually observing.
        void queryClient.invalidateQueries({
          predicate: (query) => shouldPersistKey(query.queryKey),
          refetchType: "active",
        });
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
