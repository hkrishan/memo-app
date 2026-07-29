/**
 * One entry point for "retry everything that failed to upload" — both
 * queues (camera captures → library, picker batches → albums) in one
 * call. Used by tap-to-retry on failed tiles: tapping the thing that
 * failed is the retry affordance, no hunting for a pill.
 */

import * as Haptics from "expo-haptics";

import { retryFailedEntries } from "@/features/photos/store/libraryUploadQueue";
import { retryFailedUploads } from "@/features/album/store/uploadManager";

export function retryAllFailedUploads(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  retryFailedEntries();
  retryFailedUploads();
}
