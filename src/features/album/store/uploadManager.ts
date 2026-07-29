/**
 * Global background photo-upload manager.
 *
 * A zustand store plus non-React actions that own the whole upload batch
 * lifecycle. Every asset is handed to the OS immediately via the legacy
 * expo-file-system `uploadAsync` with an iOS BACKGROUND NSURLSession, so
 * transfers keep going when the app is backgrounded — the OS throttles
 * per-host concurrency natively, which makes enqueueing the entire batch
 * at once safe. Promises for in-flight tasks resolve when JS resumes.
 *
 * Offline-first: each picked asset is STAGED (copied into app storage —
 * picker files live in an OS-clearable cache) and the pending list is
 * persisted. Adding photos with no connection just queues them: failures
 * auto-retry when the network returns or the app foregrounds, and a
 * restart resumes interrupted uploads from the staged copies (see
 * useResumeAlbumUploads, mounted in the authenticated layout).
 *
 * UI (the floating pill + expanded modal) subscribes via
 * `useUploadManagerStore`; screens only ever call `startUploadBatch`.
 */

import { AppState, InteractionManager, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useEffect } from "react";
import * as Haptics from "expo-haptics";
import {
  FileSystemSessionType,
  FileSystemUploadType,
  copyAsync,
  deleteAsync,
  documentDirectory,
  makeDirectoryAsync,
  uploadAsync,
} from "expo-file-system/legacy";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createDebouncedStorage } from "@/lib/debouncedStorage";

import { env } from "@/lib/env";
import { captureException } from "@/lib/sentry";
import { endpoints, queryClient, tokenStorage } from "@/lib/api";
import { photoKeys } from "../api/photo.queries";
import {
  usePendingUploadsStore,
  type PendingAsset,
} from "./pendingUploadsStore";
import { usePhotoAlbumStore } from "./photoAlbumStore";

/** App-storage home of staged copies — survives restarts and cache purges. */
const QUEUE_DIR = `${documentDirectory ?? ""}album-upload-queue/`;

/** How long the "done" state lingers before the pill auto-hides. */
const DONE_HIDE_MS = 1500;
/**
 * How long a landed upload's local file stays available to the album tiles
 * after the server row appears. Long enough for the remote image to be
 * fetched normally, so the switch is never visible.
 */
const SETTLED_LINGER_MS = 5 * 60_000;

/** A failed asset remembers which album it was headed to, for retries. */
export type FailedAsset = PendingAsset & { albumId: string };

export interface UploadBatch {
  /** Album of the most recent `startUploadBatch` call (drives the UI copy). */
  albumId: string;
  albumTitle: string;
  /** Total photos enqueued into this batch (grows when batches are appended). */
  total: number;
  completed: number;
  failedAssets: FailedAsset[];
  /**
   * "uploading" until every photo settles successfully; "done" only when the
   * whole batch landed (failures keep the batch in "uploading" so the UI can
   * offer retry — use `isBatchSettled` to tell "still moving" apart from
   * "finished with failures").
   */
  status: "uploading" | "done";
}

/**
 * One photo this manager is carrying into an album, kept so the album can
 * render it from its LOCAL file while it flies (see useAlbumPendingAssets).
 * A record outlives its upload: it retires only once the album's photo list
 * has refetched, so the local tile hands over to the server one with no gap.
 *
 * Records are persisted — they carry everything needed to redo the upload
 * after a restart, and `fileUri` points at a staged copy that is ours (the
 * original picker file may be gone by then).
 */
export type PendingAlbumUpload = {
  /** Display uri for the album tile — the picker file this session, the
   *  staged copy after a restart. Also the record's identity key. */
  uri: string;
  /** Staged app-storage copy (upload source); null until staging lands. */
  fileUri: string | null;
  albumId: string;
  albumTitle: string;
  fileName: string;
  mimeType: string;
  latitude?: number;
  longitude?: number;
  /** Server took it; the tile retires on the next album refetch. */
  uploaded: boolean;
  /** The album photo the server created — lets the server tile borrow this
   *  local file as its placeholder while the remote image downloads. */
  albumPhotoId: string | null;
  /** Failed — waiting on a retry (manual, reconnect, or foreground). */
  failed: boolean;
  /** Drives newest-first ordering alongside the album's server photos. */
  startedAt: number;
  /**
   * When the album's list picked this photo up. The record LINGERS past
   * that: its local file is what the album tile draws until the record is
   * pruned, so the photo never blanks while its remote image downloads.
   */
  settledAt: number | null;
};

interface UploadManagerState {
  batch: UploadBatch | null;
  pending: PendingAlbumUpload[];
}

export const useUploadManagerStore = create<UploadManagerState>()(
  persist((): UploadManagerState => ({ batch: null, pending: [] }), {
    name: "album-upload-queue",
    // Debounced: uploads patch state several times per photo — writing
    // the whole queue to disk per patch was hundreds of serializations
    // per batch
    storage: createJSONStorage(() => createDebouncedStorage()),
    // The batch is session UI state — only the uploads themselves persist;
    // a resume rebuilds a batch for whatever is left to do.
    partialize: (state) => ({ pending: state.pending }),
  }),
);

const patchPending = (
  match: (upload: PendingAlbumUpload) => boolean,
  patch: Partial<PendingAlbumUpload>,
): void => {
  useUploadManagerStore.setState((state) => ({
    pending: state.pending.map((upload) =>
      match(upload) ? { ...upload, ...patch } : upload,
    ),
  }));
};

/** True once every enqueued photo has either completed or failed. */
export const isBatchSettled = (batch: UploadBatch): boolean =>
  batch.completed + batch.failedAssets.length >= batch.total;

// ---------------------------------------------------------------------------
// Module-level bookkeeping (not renderable state)
// ---------------------------------------------------------------------------

/** Uploads currently in flight; the batch settles when this returns to 0. */
let inFlight = 0;

/** URIs currently in flight — guards against double-enqueueing an asset. */
const inFlightUris = new Set<string>();

/** Albums touched by this batch — all get invalidated when it settles. */
const albumIdsToInvalidate = new Set<string>();

/** Timer for the auto-hide after the "done" state. */
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** Names staged copies uniquely within one JS session. */
let stagedCounter = 0;

/** Restart-resume runs at most once per session. */
let resumedThisSession = false;

const clearHideTimer = () => {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
};

const deleteStagedFile = (upload: PendingAlbumUpload): void => {
  if (!upload.fileUri) return;
  void deleteAsync(upload.fileUri, { idempotent: true }).catch(() => {});
};

/** Drops records settled before `staleBefore` and their staged files. */
const pruneSettledRecords = (
  staleBefore = Date.now() - SETTLED_LINGER_MS,
): void => {
  const stale = useUploadManagerStore
    .getState()
    .pending.filter(
      (upload) => upload.settledAt != null && upload.settledAt <= staleBefore,
    );
  if (stale.length === 0) return;
  for (const upload of stale) deleteStagedFile(upload);
  useUploadManagerStore.setState((state) => ({
    pending: state.pending.filter(
      (upload) => upload.settledAt == null || upload.settledAt > staleBefore,
    ),
  }));
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Start uploading a batch of photos to an album. If a batch is already
 * running, the new assets are appended to it (the total grows) and are
 * enqueued immediately alongside the in-flight ones.
 *
 * Works with no connection: the assets are staged locally, the uploads
 * fail into the batch's failed state, and the reconnect/foreground
 * listeners (useResumeAlbumUploads) retry them automatically.
 */
export function startUploadBatch(
  albumId: string,
  albumTitle: string,
  assets: PendingAsset[],
): void {
  // An asset already in flight (Upload pressed again mid-batch) must not be
  // enqueued twice — the running transfer already covers it
  const toEnqueue = assets.filter((a) => !inFlightUris.has(a.uri));
  if (toEnqueue.length === 0) return;
  clearHideTimer();

  const current = useUploadManagerStore.getState().batch;
  if (current && current.status === "uploading") {
    // Append into the running batch. Any asset that sits in the failed list
    // is being retried, not added: drop it from the failures and don't let
    // it grow the total a second time.
    const enqueueUris = new Set(toEnqueue.map((a) => a.uri));
    const remainingFailed = current.failedAssets.filter(
      (f) => !enqueueUris.has(f.uri),
    );
    const retriedCount = current.failedAssets.length - remainingFailed.length;
    useUploadManagerStore.setState({
      batch: {
        ...current,
        albumId,
        albumTitle,
        total: current.total + toEnqueue.length - retriedCount,
        failedAssets: remainingFailed,
      },
    });
  } else {
    // Fresh batch (also replaces a batch lingering in its "done" state)
    albumIdsToInvalidate.clear();
    useUploadManagerStore.setState({
      batch: {
        albumId,
        albumTitle,
        total: toEnqueue.length,
        completed: 0,
        failedAssets: [],
        status: "uploading",
      },
    });
  }

  // Local-first: the album renders these from their local files right away.
  // A retry replaces its old record rather than stacking a second tile.
  const startedAt = Date.now();
  pruneSettledRecords(startedAt - SETTLED_LINGER_MS);
  useUploadManagerStore.setState((state) => {
    const replaced = state.pending.filter(
      (upload) =>
        upload.albumId === albumId &&
        toEnqueue.some((asset) => asset.uri === upload.uri),
    );
    for (const upload of replaced) deleteStagedFile(upload);
    return {
      pending: [
        ...state.pending.filter((upload) => !replaced.includes(upload)),
        ...toEnqueue.map((asset) => ({
          uri: asset.uri,
          fileUri: null,
          albumId,
          albumTitle,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          ...(asset.latitude !== undefined && { latitude: asset.latitude }),
          ...(asset.longitude !== undefined && { longitude: asset.longitude }),
          uploaded: false,
          albumPhotoId: null,
          failed: false,
          startedAt,
          settledAt: null,
        })),
      ],
    };
  });

  albumIdsToInvalidate.add(albumId);
  for (const asset of toEnqueue) {
    inFlightUris.add(asset.uri);
    inFlight += 1;
    void stageAndUpload(albumId, asset);
  }
}

/** Re-enqueue every failed photo (failures land back in the failed list). */
export function retryFailedUploads(): void {
  const batch = useUploadManagerStore.getState().batch;
  if (!batch || batch.failedAssets.length === 0) return;

  const toRetry = batch.failedAssets;
  useUploadManagerStore.setState({ batch: { ...batch, failedAssets: [] } });

  for (const { albumId, ...asset } of toRetry) {
    albumIdsToInvalidate.add(albumId);
    inFlightUris.add(asset.uri);
    inFlight += 1;
    // Its tile goes back to spinning
    patchPending(
      (upload) => upload.uri === asset.uri && upload.albumId === albumId,
      { failed: false },
    );
    void uploadOne(albumId, asset);
  }
}

/**
 * Clear the batch from the UI. Only honored when nothing is mid-flight:
 * either the batch is done, or everything remaining has failed.
 */
export function dismissUploadBatch(): void {
  const batch = useUploadManagerStore.getState().batch;
  if (!batch) return;
  const finishedWithFailures =
    isBatchSettled(batch) && batch.failedAssets.length > 0;
  if (batch.status === "done" || finishedWithFailures) {
    clearHideTimer();
    // Abandoning the failures retires their tiles too — nothing is coming
    useUploadManagerStore.setState((state) => {
      const abandoned = state.pending.filter((upload) => upload.failed);
      for (const upload of abandoned) deleteStagedFile(upload);
      return {
        batch: null,
        pending: state.pending.filter((upload) => !upload.failed),
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Stage the picker file into app storage, then upload. Staging first is
 * what makes the queue offline-safe: the picker's cache file can vanish
 * (OS cleanup, restart), but the staged copy is ours until the upload
 * lands and its linger window closes.
 */
async function stageAndUpload(
  albumId: string,
  asset: PendingAsset,
): Promise<void> {
  try {
    await makeDirectoryAsync(QUEUE_DIR, { intermediates: true }).catch(
      () => {},
    );
    const extension =
      asset.fileName.split(".").pop()?.toLowerCase() ??
      asset.uri.split(".").pop()?.toLowerCase() ??
      "jpg";
    const staged = `${QUEUE_DIR}alb-${Date.now()}-${stagedCounter++}.${extension}`;
    await copyAsync({ from: asset.uri, to: staged });
    patchPending(
      (upload) => upload.uri === asset.uri && upload.albumId === albumId,
      { fileUri: staged },
    );
  } catch {
    // Staging failed (exotic uri?) — upload straight from the picker file;
    // the transfer just won't survive a restart.
  }
  await uploadOne(albumId, asset);
}

/**
 * Upload a single photo and record the outcome. Uses the legacy
 * expo-file-system upload API so the native side owns the transfer
 * (BACKGROUND NSURLSession on iOS keeps it running when the app is
 * backgrounded; Android uploads always run in the background). The source
 * is the staged copy when one exists — retries after a restart depend on
 * that.
 */
async function uploadOne(albumId: string, asset: PendingAsset): Promise<void> {
  let succeeded = false;
  let createdPhotoId: string | null = null;
  try {
    // Fresh token per file — a long batch can outlive an access token
    const token = await tokenStorage.getAccessToken();
    if (!token) throw new Error("No access token available");

    const base = env.apiUrl.replace(/\/+$/, "");
    const url = `${base}${endpoints.album.uploadPhoto(albumId)}`;

    const parameters: Record<string, string> = {};
    if (asset.latitude !== undefined && asset.longitude !== undefined) {
      parameters.latitude = String(asset.latitude);
      parameters.longitude = String(asset.longitude);
    }

    const record = useUploadManagerStore
      .getState()
      .pending.find(
        (upload) => upload.uri === asset.uri && upload.albumId === albumId,
      );
    const sourceUri = record?.fileUri ?? asset.uri;

    const result = await uploadAsync(url, sourceUri, {
      httpMethod: "POST",
      uploadType: FileSystemUploadType.MULTIPART,
      fieldName: "photo",
      mimeType: asset.mimeType,
      parameters,
      headers: { Authorization: `Bearer ${token}` },
      // iOS-only option (Android sessions are always background-capable)
      ...(Platform.OS === "ios"
        ? { sessionType: FileSystemSessionType.BACKGROUND }
        : {}),
    });

    succeeded = result.status === 201;
    if (succeeded) {
      try {
        createdPhotoId = (JSON.parse(result.body) as { photoId?: string })
          .photoId ?? null;
      } catch {
        // Body wasn't the photo we expected — the tile just loses its
        // placeholder, nothing else depends on this
      }
    }
    if (!succeeded) {
      if (__DEV__) {
        console.error(
          `Photo upload failed (HTTP ${result.status})`,
          result.body?.slice(0, 200),
        );
      }
      captureException(new Error(`Photo upload failed (HTTP ${result.status})`), {
        albumId,
        status: result.status,
        body: result.body?.slice(0, 200),
      });
    }
  } catch (error) {
    // Expected while offline — the reconnect listener retries; don't spam
    if (__DEV__) console.error("Photo upload failed", error);
  }

  inFlight -= 1;
  inFlightUris.delete(asset.uri);

  const batch = useUploadManagerStore.getState().batch;
  if (!batch) {
    // Batch was cleared while this was in flight — nothing left to record
    if (inFlight === 0) albumIdsToInvalidate.clear();
    return;
  }

  const isThisUpload = (upload: PendingAlbumUpload) =>
    upload.uri === asset.uri && upload.albumId === albumId;

  if (succeeded) {
    // Bookkeeping mirrors the old in-screen flow: remember the association
    // and drop the asset from the pending list so retries can't duplicate
    usePhotoAlbumStore
      .getState()
      .addAssociation(asset.uri, albumId, batch.albumTitle);
    usePendingUploadsStore.getState().removeAsset(asset.uri);
    // One setState for both the tile flip and the counter — two writes
    // here meant two renders (and two persist events) per photo
    useUploadManagerStore.setState((state) => ({
      batch: state.batch && {
        ...state.batch,
        completed: state.batch.completed + 1,
      },
      pending: state.pending.map((upload) =>
        isThisUpload(upload)
          ? { ...upload, uploaded: true, albumPhotoId: createdPhotoId }
          : upload,
      ),
    }));
  } else {
    useUploadManagerStore.setState((state) => ({
      batch: state.batch && {
        ...state.batch,
        failedAssets: [...state.batch.failedAssets, { ...asset, albumId }],
      },
      pending: state.pending.map((upload) =>
        isThisUpload(upload) ? { ...upload, failed: true } : upload,
      ),
    }));
  }

  if (inFlight === 0) settleBatch();
}

/** Runs once when the last in-flight upload resolves. */
function settleBatch(): void {
  // Refresh every album the batch touched (the response body is ignored —
  // invalidation is what brings the new photos into the grid)
  const touchedAlbumIds = [...albumIdsToInvalidate];
  albumIdsToInvalidate.clear();
  void Promise.all(
    touchedAlbumIds.map((id) =>
      queryClient.invalidateQueries({ queryKey: photoKeys.byAlbum(id) }),
    ),
  ).then(() => {
    // The refetch landed, so the server rows exist — but the records STAY.
    // Their local files are what the album tiles draw until the linger
    // window closes; deleting them here is what made photos blink out at
    // exactly this moment and reappear only once R2 served them back.
    const settledAt = Date.now();
    useUploadManagerStore.setState((state) => ({
      pending: state.pending.map((upload) =>
        upload.uploaded &&
        upload.settledAt == null &&
        touchedAlbumIds.includes(upload.albumId)
          ? { ...upload, settledAt }
          : upload,
      ),
    }));
    // Deterministic cleanup: by now the remote image is a normal album
    // fetch, and the staged copies aren't needed anymore
    setTimeout(() => {
      pruneSettledRecords(settledAt);
    }, SETTLED_LINGER_MS);
  });
  // Refresh the albums LIST (covers/counts derive from its recentPhotos).
  // exact: the bare prefix also matched every cached ["albums", id] detail
  // query — a refetch wave of every album opened recently.
  queryClient.invalidateQueries({ queryKey: ["albums"], exact: true });

  const batch = useUploadManagerStore.getState().batch;
  if (!batch) return;

  if (batch.failedAssets.length === 0) {
    useUploadManagerStore.setState({ batch: { ...batch, status: "done" } });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    clearHideTimer();
    hideTimer = setTimeout(() => {
      hideTimer = null;
      const current = useUploadManagerStore.getState().batch;
      if (current?.status === "done") {
        useUploadManagerStore.setState({ batch: null });
      }
    }, DONE_HIDE_MS);
  }
  // With failures the batch stays visible in its failed state until the
  // user retries or dismisses.
}

// ---------------------------------------------------------------------------
// Restart resume + auto-retry
// ---------------------------------------------------------------------------

/**
 * Picks the persisted queue back up after a restart: uploads that landed
 * get their albums refreshed and retire through the normal linger; ones
 * that didn't go back up as a fresh batch, sourced from their staged
 * copies (the picker's cache files may be gone by now).
 */
function resumeAlbumUploads(): void {
  if (resumedThisSession) return;
  resumedThisSession = true;

  pruneSettledRecords();

  // Landed before the app died but never settled — the server has them;
  // refresh their albums and let the linger window retire the tiles.
  const landed = useUploadManagerStore
    .getState()
    .pending.filter((upload) => upload.uploaded && upload.settledAt == null);
  if (landed.length > 0) {
    const settledAt = Date.now();
    useUploadManagerStore.setState((state) => ({
      pending: state.pending.map((upload) =>
        upload.uploaded && upload.settledAt == null
          ? { ...upload, settledAt }
          : upload,
      ),
    }));
    for (const albumId of new Set(landed.map((upload) => upload.albumId))) {
      void queryClient.invalidateQueries({
        queryKey: photoKeys.byAlbum(albumId),
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["albums"], exact: true });
    setTimeout(() => pruneSettledRecords(settledAt), SETTLED_LINGER_MS);
  }

  // Interrupted mid-flight or never sent — re-run them as a fresh batch.
  // The staged copy becomes the display uri too: the original picker file
  // may not have survived the restart.
  const unfinished = useUploadManagerStore
    .getState()
    .pending.filter((upload) => !upload.uploaded);
  if (unfinished.length === 0) return;

  useUploadManagerStore.setState((state) => ({
    batch: {
      albumId: unfinished[unfinished.length - 1]!.albumId,
      albumTitle: unfinished[unfinished.length - 1]!.albumTitle,
      total: unfinished.length,
      completed: 0,
      failedAssets: [],
      status: "uploading",
    },
    pending: state.pending.map((upload) =>
      !upload.uploaded
        ? { ...upload, uri: upload.fileUri ?? upload.uri, failed: false }
        : upload,
    ),
  }));

  const records = useUploadManagerStore
    .getState()
    .pending.filter((upload) => !upload.uploaded);
  for (const record of records) {
    albumIdsToInvalidate.add(record.albumId);
    inFlightUris.add(record.uri);
    inFlight += 1;
    void uploadOne(record.albumId, {
      uri: record.uri,
      fileName: record.fileName,
      mimeType: record.mimeType,
      ...(record.latitude !== undefined && { latitude: record.latitude }),
      ...(record.longitude !== undefined && { longitude: record.longitude }),
    });
  }
}

/**
 * Resumes persisted album uploads on app start and retries failures on
 * foreground / network regained. Mounted once in the authenticated layout.
 */
export function useResumeAlbumUploads(): void {
  useEffect(() => {
    // Deferred past first interactions — resume work must not race the
    // app's first paint. The persisted queue also arrives asynchronously
    // from AsyncStorage.
    const resumeWhenIdle = () => {
      void InteractionManager.runAfterInteractions(() => {
        resumeAlbumUploads();
      });
    };
    if (useUploadManagerStore.persist.hasHydrated()) {
      resumeWhenIdle();
    }
    const unsubHydration = useUploadManagerStore.persist.onFinishHydration(
      () => resumeWhenIdle(),
    );
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") retryFailedUploads();
    });
    const netInfoUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected) retryFailedUploads();
    });
    return () => {
      unsubHydration();
      appStateSub.remove();
      netInfoUnsub();
    };
  }, []);
}
