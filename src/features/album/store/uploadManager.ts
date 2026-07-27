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
 * UI (the floating pill + expanded modal) subscribes via
 * `useUploadManagerStore`; screens only ever call `startUploadBatch`.
 */

import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import {
  FileSystemSessionType,
  FileSystemUploadType,
  uploadAsync,
} from "expo-file-system/legacy";
import { create } from "zustand";

import { env } from "@/lib/env";
import { captureException } from "@/lib/sentry";
import { endpoints, queryClient, tokenStorage } from "@/lib/api";
import { photoKeys } from "../api/photo.queries";
import {
  usePendingUploadsStore,
  type PendingAsset,
} from "./pendingUploadsStore";
import { usePhotoAlbumStore } from "./photoAlbumStore";

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
 */
export type PendingAlbumUpload = {
  uri: string;
  albumId: string;
  /** Server took it; the tile retires on the next album refetch. */
  uploaded: boolean;
  /** The album photo the server created — lets the server tile borrow this
   *  local file as its placeholder while the remote image downloads. */
  albumPhotoId: string | null;
  /** Failed — waiting on the batch's retry (or its dismissal). */
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

export const useUploadManagerStore = create<UploadManagerState>(() => ({
  batch: null,
  pending: [],
}));

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

const clearHideTimer = () => {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Start uploading a batch of photos to an album. If a batch is already
 * running, the new assets are appended to it (the total grows) and are
 * enqueued immediately alongside the in-flight ones.
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
  const staleBefore = startedAt - SETTLED_LINGER_MS;
  useUploadManagerStore.setState((state) => ({
    pending: [
      ...state.pending
        .filter(
          (upload) =>
            upload.settledAt == null || upload.settledAt > staleBefore,
        )
        .filter(
        (upload) =>
          !(
            upload.albumId === albumId &&
            toEnqueue.some((asset) => asset.uri === upload.uri)
          ),
      ),
      ...toEnqueue.map((asset) => ({
        uri: asset.uri,
        albumId,
        uploaded: false,
        albumPhotoId: null,
        failed: false,
        startedAt,
        settledAt: null,
      })),
    ],
  }));

  albumIdsToInvalidate.add(albumId);
  for (const asset of toEnqueue) {
    inFlightUris.add(asset.uri);
    inFlight += 1;
    void uploadOne(albumId, asset);
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
    useUploadManagerStore.setState((state) => ({
      batch: null,
      pending: state.pending.filter((upload) => !upload.failed),
    }));
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Upload a single photo and record the outcome. Uses the legacy
 * expo-file-system upload API so the native side owns the transfer
 * (BACKGROUND NSURLSession on iOS keeps it running when the app is
 * backgrounded; Android uploads always run in the background).
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

    const result = await uploadAsync(url, asset.uri, {
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
    if (__DEV__) console.error("Photo upload failed", error);
    captureException(error, { albumId, operation: "uploadOne" });
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
    // The local tile stays (the album's list doesn't have the photo until
    // the batch settles and refetches) — it just stops spinning
    patchPending(isThisUpload, { uploaded: true, albumPhotoId: createdPhotoId });
    useUploadManagerStore.setState({
      batch: { ...batch, completed: batch.completed + 1 },
    });
  } else {
    patchPending(isThisUpload, { failed: true });
    useUploadManagerStore.setState({
      batch: {
        ...batch,
        failedAssets: [...batch.failedAssets, { ...asset, albumId }],
      },
    });
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
    // Deterministic cleanup: the picker's cache files aren't ours to keep
    // alive forever, and by now the remote image is a normal album fetch
    setTimeout(() => {
      useUploadManagerStore.setState((state) => ({
        pending: state.pending.filter(
          (upload) => upload.settledAt == null || upload.settledAt > settledAt,
        ),
      }));
    }, SETTLED_LINGER_MS);
  });
  // Also refresh the albums LIST (["albums"]) + every album detail
  // (["albums", id]) by prefix — the My Albums tab derives each card's
  // cover from the list's recentPhotos, which a per-id invalidation misses.
  queryClient.invalidateQueries({ queryKey: ["albums"] });

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
