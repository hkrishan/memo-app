/**
 * Local-first capture queue for the Memo library.
 *
 * A capture is INSTANT for the user: the file is copied into app storage,
 * an entry lands in this persisted queue, and the shutter is free again.
 * The processor then uploads in the background (iOS BACKGROUND NSURLSession
 * via the legacy expo-file-system uploadAsync — same transport as the album
 * uploadManager), applies the optional album copy server-side, submits to a
 * moment event when the capture was taken for one, and settles.
 *
 * Photos and videos both travel this way (the library endpoint takes
 * mp4/mov/webm and cuts their poster frame), so every capture — whatever
 * the shutter did — is resumable, background, and visible locally while it
 * flies.
 *
 * Entries are resumable at every stage: an entry with no serverPhotoId
 * uploads; one WITH a serverPhotoId but a pending album target only redoes
 * the copy. Failures auto-retry with capped backoff and on app-foreground /
 * network-regained / next-capture triggers. The local file is never deleted
 * until the upload succeeded, so nothing can be lost offline.
 *
 * Settled entries linger briefly as status "done" (pruned after a minute)
 * so the capture banner can still retarget the album (a move at that point).
 */

import { AppState, Image as RNImage, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useEffect } from "react";
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
import AsyncStorage from "@react-native-async-storage/async-storage";

import { env } from "@/lib/env";
import { captureException } from "@/lib/sentry";
import { endpoints, isApiError, queryClient, tokenStorage } from "@/lib/api";
import { uploadIndicator } from "@/components/global/uploadIndicator";
import { photoKeys } from "@/features/album/api/photo.queries";
import photoApi from "@/features/album/api/photo.api";
import momentsApi from "@/features/moments/api/moments.api";
import { momentKeys } from "@/features/moments/api/moments.queries";
import libraryApi, { libraryKeys } from "../api/library.api";

const QUEUE_DIR = `${documentDirectory ?? ""}library-queue/`;
/** Backoff: 30s * attempts, capped at 5 minutes. */
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 5 * 60_000;
/** How long a settled ("done") entry lingers for banner retargeting. */
const DONE_PRUNE_MS = 60_000;

/** Queue-file extension per content type (the server keys off the mime). */
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "video/quicktime": "mov",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
const DEFAULT_MIME_TYPE = "image/jpeg";

export type QueuedCaptureStatus = "queued" | "uploading" | "failed" | "done";

/** One album this capture should (also) land in. `albumPhotoId` is set once
 *  the server-side copy exists, which is what makes removal possible. */
export type QueuedAlbumTarget = {
  albumId: string;
  title: string;
  albumPhotoId: string | null;
};

/** A moment event this capture was taken for ("Post now" → the camera). */
export type QueuedMomentTarget = {
  albumId: string;
  momentId: string;
  eventId: string;
};

export type QueuedCapture = {
  localId: string;
  /** App-storage copy of the capture — survives restarts. */
  fileUri: string;
  capturedAt: string;
  /** "photo" unless the shutter recorded a video. */
  mediaType: "photo" | "video";
  /** Content type of the queued file — drives the upload AND its extension. */
  mimeType: string;
  /**
   * Videos only: a local uri that renders as a poster frame (the device
   * library asset — ph:// on iOS, the file itself on Android). A video file
   * has no renderable image of its own, so grids show this instead.
   */
  posterUri?: string;
  /** Submitted to this event once the album copy exists. */
  momentTarget?: QueuedMomentTarget;
  /** True once the moment submission landed (or was already there). */
  momentSubmitted?: boolean;
  latitude?: number;
  longitude?: number;
  /** Albums this capture should (also) land in; editable while pending. */
  albumTargets: QueuedAlbumTarget[];
  cameraRollSaved: boolean;
  /** Display dimensions of the local file — lets the viewer fit it with no
   *  resize-pop while the upload is still in flight. */
  width?: number;
  height?: number;
  status: QueuedCaptureStatus;
  attempts: number;
  /** Library photoId once the upload landed (upload is then never redone). */
  serverPhotoId: string | null;
  /** When the entry settled — drives pruning of "done" entries. */
  settledAt: string | null;
};

/** Pre-`albumTargets` persisted shape, migrated on rehydrate. */
type LegacyQueuedCapture = QueuedCapture & {
  albumId?: string | null;
  albumTitle?: string | null;
  albumPhotoId?: string | null;
};

interface LibraryUploadQueueState {
  entries: QueuedCapture[];
}

export const useLibraryUploadQueue = create<LibraryUploadQueueState>()(
  persist((): LibraryUploadQueueState => ({ entries: [] }), {
    name: "library-upload-queue",
    storage: createJSONStorage(() => AsyncStorage),
    // A JS-death mid-upload leaves "uploading" — reset to queued on load.
    // Also migrates entries persisted under the single-album shape, and
    // entries from before the queue carried videos (all were JPEGs).
    onRehydrateStorage: () => (state) => {
      if (!state) return;
      useLibraryUploadQueue.setState({
        entries: state.entries.map((raw) => {
          const legacy = raw as LegacyQueuedCapture;
          const albumTargets =
            legacy.albumTargets ??
            (legacy.albumId
              ? [
                  {
                    albumId: legacy.albumId,
                    title: legacy.albumTitle ?? "Album",
                    albumPhotoId: legacy.albumPhotoId ?? null,
                  },
                ]
              : []);
          return {
            ...raw,
            albumTargets,
            mediaType: raw.mediaType ?? "photo",
            mimeType: raw.mimeType ?? DEFAULT_MIME_TYPE,
            ...(raw.status === "uploading"
              ? { status: "queued" as const }
              : {}),
          };
        }),
      });
    },
  }),
);

// ---------------------------------------------------------------------------
// Module-level bookkeeping (not renderable state)
// ---------------------------------------------------------------------------

let processing = false;
let captureCounter = 0;
let backoffTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Entries cancelled while their upload was already in flight. An in-flight
 * uploadAsync cannot be aborted, so the processor consults this after each
 * stage and tears down whatever it created instead of settling.
 */
const cancelledIds = new Set<string>();

const patchEntry = (
  localId: string,
  patch: Partial<QueuedCapture>,
): void => {
  useLibraryUploadQueue.setState((state) => ({
    entries: state.entries.map((entry) =>
      entry.localId === localId ? { ...entry, ...patch } : entry,
    ),
  }));
};

/** Records the album-copy id for one target of an entry. */
const patchAlbumTarget = (
  localId: string,
  albumId: string,
  albumPhotoId: string,
): void => {
  useLibraryUploadQueue.setState((state) => ({
    entries: state.entries.map((entry) =>
      entry.localId === localId
        ? {
            ...entry,
            albumTargets: entry.albumTargets.map((target) =>
              target.albumId === albumId ? { ...target, albumPhotoId } : target,
            ),
          }
        : entry,
    ),
  }));
};

const getEntry = (localId: string): QueuedCapture | undefined =>
  useLibraryUploadQueue
    .getState()
    .entries.find((entry) => entry.localId === localId);

const removeEntry = (localId: string): void => {
  useLibraryUploadQueue.setState((state) => ({
    entries: state.entries.filter((entry) => entry.localId !== localId),
  }));
};

const deleteLocalFile = async (fileUri: string): Promise<void> => {
  try {
    await deleteAsync(fileUri, { idempotent: true });
  } catch {
    // Best effort — an orphaned queue file is harmless
  }
};

/** Drops settled entries past their linger window (their files too). */
const pruneSettled = (): void => {
  const cutoff = Date.now() - DONE_PRUNE_MS;
  const stale = useLibraryUploadQueue
    .getState()
    .entries.filter(
      (entry) =>
        entry.status === "done" &&
        entry.settledAt != null &&
        new Date(entry.settledAt).getTime() < cutoff,
    );
  for (const entry of stale) {
    removeEntry(entry.localId);
    void deleteLocalFile(entry.fileUri);
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type EnqueueCaptureInput = {
  /** The vision-camera temp file (copied into app storage before return). */
  tempFileUri: string;
  /** Content type of that file. Defaults to JPEG (the photo shutter). */
  mimeType?: string;
  /** Videos: the device-library asset uri, which renders as a poster. */
  posterUri?: string;
  latitude?: number;
  longitude?: number;
  albumId?: string | null;
  albumTitle?: string | null;
  cameraRollSaved?: boolean;
  /** Set when the camera was opened from a moment's "Post now". */
  momentTarget?: QueuedMomentTarget;
};

/**
 * Copies the capture into app storage and enqueues it. Returns the entry's
 * localId (the banner's handle). Also nudges failed entries into retry.
 */
export async function enqueueCapture(
  input: EnqueueCaptureInput,
): Promise<string> {
  const localId = `cap-${Date.now()}-${captureCounter++}`;
  const mimeType = input.mimeType ?? DEFAULT_MIME_TYPE;
  const mediaType = mimeType.startsWith("video/") ? "video" : "photo";
  // The extension must match the container: the server (and the OS upload
  // session) key off it, and a .mov renamed .mp4 stores an unplayable file
  const extension =
    EXTENSION_BY_MIME[mimeType] ??
    input.tempFileUri.split(".").pop()?.toLowerCase() ??
    "jpg";
  const fileUri = `${QUEUE_DIR}${localId}.${extension}`;

  await makeDirectoryAsync(QUEUE_DIR, { intermediates: true }).catch(() => {});
  await copyAsync({ from: input.tempFileUri, to: fileUri });

  // Local file → instant, EXIF-correct display size (no network round-trip).
  // A video file isn't decodable here — its poster stands in when there is
  // one, otherwise the size arrives with the server photo.
  const sizeSource = mediaType === "video" ? input.posterUri : fileUri;
  const size = await new Promise<{ width: number; height: number } | null>(
    (resolve) => {
      if (!sizeSource) {
        resolve(null);
        return;
      }
      RNImage.getSize(
        sizeSource,
        (width, height) =>
          resolve(width > 0 && height > 0 ? { width, height } : null),
        () => resolve(null),
      );
    },
  );

  pruneSettled();
  useLibraryUploadQueue.setState((state) => ({
    entries: [
      {
        localId,
        fileUri,
        capturedAt: new Date().toISOString(),
        mediaType,
        mimeType,
        ...(input.posterUri && { posterUri: input.posterUri }),
        ...(input.momentTarget && { momentTarget: input.momentTarget }),
        ...(input.latitude !== undefined && { latitude: input.latitude }),
        ...(input.longitude !== undefined && { longitude: input.longitude }),
        albumTargets: input.albumId
          ? [
              {
                albumId: input.albumId,
                title: input.albumTitle ?? "Album",
                albumPhotoId: null,
              },
            ]
          : [],
        cameraRollSaved: input.cameraRollSaved ?? false,
        ...(size && { width: size.width, height: size.height }),
        status: "queued" as const,
        attempts: 0,
        serverPhotoId: null,
        settledAt: null,
      },
      ...state.entries,
    ],
  }));

  retryFailedEntries();
  void processQueue();
  return localId;
}

/** Marks the capture as saved to the device camera roll (banner state). */
export function markCameraRollSaved(localId: string): void {
  patchEntry(localId, { cameraRollSaved: true });
}

/**
 * Sets the FULL album membership for one still-pending capture (the album
 * picker's checkbox set). Diffs against the current targets:
 * - newly checked: copied server-side when the upload already landed,
 *   otherwise just recorded so the processor copies it after uploading
 * - unchecked: the album copy is deleted when one exists
 * An empty list is valid — the capture then lives only in the Memo library.
 */
export async function setEntryAlbums(
  localId: string,
  albums: { albumId: string; title: string }[],
): Promise<void> {
  const entry = getEntry(localId);
  if (!entry) return;

  const nextIds = new Set(albums.map((a) => a.albumId));
  const removed = entry.albumTargets.filter((t) => !nextIds.has(t.albumId));

  // Carry existing copies across so we never re-copy an album that's staying
  const kept = new Map(entry.albumTargets.map((t) => [t.albumId, t]));
  const nextTargets: QueuedAlbumTarget[] = albums.map(
    (a) =>
      kept.get(a.albumId) ?? {
        albumId: a.albumId,
        title: a.title,
        albumPhotoId: null,
      },
  );

  // Record intent first so the UI reflects the choice immediately; a settled
  // entry with fresh copies to make goes back to work.
  const needsCopy = nextTargets.some((t) => t.albumPhotoId === null);
  patchEntry(localId, {
    albumTargets: nextTargets,
    ...(entry.status === "done" && needsCopy
      ? { status: "queued" as const, settledAt: null }
      : {}),
  });

  try {
    // Copies the upload already made but the user just unchecked
    for (const target of removed) {
      if (!target.albumPhotoId) continue;
      await photoApi
        .deletePhoto(target.albumId, target.albumPhotoId)
        .catch(() => {});
      void queryClient.invalidateQueries({
        queryKey: photoKeys.byAlbum(target.albumId),
      });
    }

    // Newly checked albums can be copied right away once the upload landed;
    // otherwise the processor handles them when it does.
    if (entry.serverPhotoId) {
      for (const target of nextTargets) {
        if (target.albumPhotoId) continue;
        const copy = await libraryApi.addLibraryPhotoToAlbum(
          target.albumId,
          entry.serverPhotoId,
        );
        patchAlbumTarget(localId, target.albumId, copy.photoId);
        void queryClient.invalidateQueries({
          queryKey: photoKeys.byAlbum(target.albumId),
        });
      }
    } else {
      void processQueue();
    }
    void queryClient.invalidateQueries({ queryKey: ["albums"] });
  } catch (error) {
    if (__DEV__) console.error("Album membership update failed:", error);
    captureException(error, { operation: "libraryQueue.setEntryAlbums" });
  }
}

/**
 * Deletes a capture that hasn't settled yet.
 *
 * The entry disappears from the queue immediately (so the viewer's grid
 * updates at once), and everything it already created server-side is torn
 * down: album copies first, then the library photo. An upload that is
 * mid-flight cannot be aborted, so the id is remembered here — the processor
 * checks it after each stage and deletes whatever it just created.
 */
export async function cancelEntry(localId: string): Promise<void> {
  const entry = getEntry(localId);
  if (!entry) return;

  // Only an in-flight upload needs the marker — the processor is inside
  // processEntry for it and must undo its work instead of settling. Any
  // other status is fully handled by the teardown below.
  if (entry.status === "uploading") cancelledIds.add(localId);
  removeEntry(localId);
  void deleteLocalFile(entry.fileUri);

  await teardownEntry(entry);
  void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
}

/** Removes everything an entry created server-side. Best effort throughout. */
async function teardownEntry(entry: QueuedCapture): Promise<void> {
  try {
    for (const target of entry.albumTargets) {
      if (!target.albumPhotoId) continue;
      await photoApi
        .deletePhoto(target.albumId, target.albumPhotoId)
        .catch(() => {});
      void queryClient.invalidateQueries({
        queryKey: photoKeys.byAlbum(target.albumId),
      });
    }
    if (entry.serverPhotoId) {
      await libraryApi.deleteLibraryPhoto(entry.serverPhotoId).catch(() => {});
    }
    if (entry.albumTargets.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ["albums"] });
    }
  } catch (error) {
    if (__DEV__) console.error("Cancel teardown failed:", error);
    captureException(error, { operation: "libraryQueue.teardownEntry" });
  }
}

/** Flips failed entries back to queued (attempts kept) and kicks the loop. */
export function retryFailedEntries(): void {
  const hasFailed = useLibraryUploadQueue
    .getState()
    .entries.some((entry) => entry.status === "failed");
  if (!hasFailed) return;
  useLibraryUploadQueue.setState((state) => ({
    entries: state.entries.map((entry) =>
      entry.status === "failed"
        ? { ...entry, status: "queued" as const }
        : entry,
    ),
  }));
  void processQueue();
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

/** Single-flight loop: captures upload in order, oldest pending first. */
async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    // Oldest first so the library lands in capture order
    for (;;) {
      const next = [...useLibraryUploadQueue.getState().entries]
        .reverse()
        .find((entry) => entry.status === "queued");
      if (!next) break;
      await processEntry(next.localId);
    }
  } finally {
    processing = false;
  }
}

async function processEntry(localId: string): Promise<void> {
  const entry = getEntry(localId);
  if (!entry || entry.status !== "queued") return;
  patchEntry(localId, { status: "uploading" });

  try {
    // Stage 1 — library upload (skipped when resuming after a copy failure)
    let serverPhotoId = entry.serverPhotoId;
    if (!serverPhotoId) {
      const token = await tokenStorage.getAccessToken();
      if (!token) throw new Error("No access token available");

      const base = env.apiUrl.replace(/\/+$/, "");
      const parameters: Record<string, string> = {};
      if (entry.latitude !== undefined && entry.longitude !== undefined) {
        parameters.latitude = String(entry.latitude);
        parameters.longitude = String(entry.longitude);
      }

      const result = await uploadAsync(
        `${base}${endpoints.user.photos}`,
        entry.fileUri,
        {
          httpMethod: "POST",
          uploadType: FileSystemUploadType.MULTIPART,
          fieldName: "photo",
          mimeType: entry.mimeType,
          parameters,
          headers: { Authorization: `Bearer ${token}` },
          ...(Platform.OS === "ios"
            ? { sessionType: FileSystemSessionType.BACKGROUND }
            : {}),
        },
      );
      if (result.status !== 201) {
        throw new Error(`Library upload failed (HTTP ${result.status})`);
      }
      serverPhotoId = (JSON.parse(result.body) as { photoId: string }).photoId;
      // Deleted while this upload was in flight — undo it rather than settle
      if (cancelledIds.has(localId)) {
        cancelledIds.delete(localId);
        await libraryApi.deleteLibraryPhoto(serverPhotoId).catch(() => {});
        return;
      }
      patchEntry(localId, { serverPhotoId });
    }

    // Stage 2 — album copies (reads the CURRENT targets: the album picker
    // may have changed them while the upload ran)
    const current = getEntry(localId);
    for (const target of current?.albumTargets ?? []) {
      if (target.albumPhotoId) continue;
      const copy = await libraryApi.addLibraryPhotoToAlbum(
        target.albumId,
        serverPhotoId,
      );
      patchAlbumTarget(localId, target.albumId, copy.photoId);
      void queryClient.invalidateQueries({
        queryKey: photoKeys.byAlbum(target.albumId),
      });
      void queryClient.invalidateQueries({ queryKey: ["albums"] });
    }

    // Deleted while the copies were being made — tear the whole thing down
    // (checked before the moment submission: never post a photo that's
    // about to be deleted)
    if (cancelledIds.has(localId)) {
      cancelledIds.delete(localId);
      await teardownEntry({
        ...(current ?? entry),
        serverPhotoId,
        albumTargets: getEntry(localId)?.albumTargets ?? current?.albumTargets ?? [],
      });
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      return;
    }

    // Stage 3 — moment submission ("Post now"). The event references the
    // ALBUM copy, so this can only run once stage 2 made it.
    const withCopies = getEntry(localId);
    const moment = withCopies?.momentTarget;
    if (moment && !withCopies?.momentSubmitted) {
      const albumPhotoId = withCopies?.albumTargets.find(
        (target) => target.albumId === moment.albumId,
      )?.albumPhotoId;
      if (albumPhotoId) await submitToMoment(localId, moment, albumPhotoId);
    }

    // Settle: refetch the library FIRST so the server photo is in the list
    // before the local tile stops rendering from the queue — no gap.
    await queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    patchEntry(localId, {
      status: "done",
      settledAt: new Date().toISOString(),
    });
  } catch (error) {
    // A cancelled entry is already gone from the queue (patchEntry below is
    // a no-op for it) — just drop the marker so it can't leak
    if (cancelledIds.has(localId)) {
      cancelledIds.delete(localId);
      return;
    }
    const attempts = (getEntry(localId)?.attempts ?? 0) + 1;
    patchEntry(localId, { status: "failed", attempts });
    if (__DEV__) console.error("Library queue upload failed:", error);
    if (attempts === 3) {
      captureException(error, {
        operation: "libraryQueue.processEntry",
        attempts,
      });
    }
    scheduleBackoffRetry(attempts);
  }
}

/**
 * Posts the album copy to the moment event the capture was taken for, with
 * the same pill treatment the old in-screen flow had. A 409 means someone
 * (this device, earlier) already posted for the event — that's settled, not
 * a failure. Anything else rethrows into the entry's retry path; the album
 * copy already exists, so a retry redoes only this step.
 */
async function submitToMoment(
  localId: string,
  moment: QueuedMomentTarget,
  albumPhotoId: string,
): Promise<void> {
  const indicatorId = `moment-submit-${localId}`;
  uploadIndicator.begin(indicatorId, "Posting to moment…");
  try {
    await momentsApi.submitToEvent(
      moment.albumId,
      moment.momentId,
      moment.eventId,
      albumPhotoId,
    );
    uploadIndicator.succeed(indicatorId, "Posted to moment");
  } catch (error) {
    if (isApiError(error) && error.status === 409) {
      uploadIndicator.succeed(indicatorId, "Already posted");
    } else {
      uploadIndicator.fail(indicatorId, "Couldn't post to moment");
      throw error;
    }
  }
  patchEntry(localId, { momentSubmitted: true });
  void queryClient.invalidateQueries({
    queryKey: momentKeys.byAlbum(moment.albumId),
  });
  // The submitted event no longer counts as an open drop
  void queryClient.invalidateQueries({ queryKey: momentKeys.openDrops });
}

function scheduleBackoffRetry(attempts: number): void {
  if (backoffTimer) clearTimeout(backoffTimer);
  const delay = Math.min(BACKOFF_BASE_MS * attempts, BACKOFF_MAX_MS);
  backoffTimer = setTimeout(() => {
    backoffTimer = null;
    retryFailedEntries();
  }, delay);
}

// ---------------------------------------------------------------------------
// Resume hook — mounted once in the authenticated layout
// ---------------------------------------------------------------------------

/**
 * Resumes pending uploads on app start and retries on foreground / network
 * regained. Safe to keep mounted for the whole session.
 */
export function useResumeLibraryUploads(): void {
  useEffect(() => {
    pruneSettled();
    void processQueue();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") retryFailedEntries();
    });
    const netInfoUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected) retryFailedEntries();
    });
    return () => {
      appStateSub.remove();
      netInfoUnsub();
    };
  }, []);
}
