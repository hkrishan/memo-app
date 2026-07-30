/**
 * One entry point for "retry everything that failed to upload" — both
 * queues (camera captures → library, picker batches → albums) in one
 * call. Used by tap-to-retry on failed tiles: tapping the thing that
 * failed is the retry affordance, no hunting for a pill.
 */

import * as Haptics from "expo-haptics";

import { notify } from "@/components/global";
import { retryFailedEntries } from "@/features/photos/store/libraryUploadQueue";
import { retryFailedUploads } from "@/features/album/store/uploadManager";

export function retryAllFailedUploads(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  retryFailedEntries();
  retryFailedUploads();
}

/**
 * Tap on a tile that's parked waiting for the network. There's nothing to
 * retry — the queues resume by themselves on reconnect — so the tap just
 * explains the wait. A retry nudge rides along anyway, covering the case
 * where connectivity is back but the reconnect event was missed.
 */
export function showWaitingForConnectionNotice(): void {
  notify.toast({
    type: "info",
    title: "No internet connection",
    message: "It'll upload automatically once you're back online.",
  });
  retryFailedEntries();
  retryFailedUploads();
}
