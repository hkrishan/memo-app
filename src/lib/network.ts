/**
 * The app's single source of truth for "are we online".
 *
 * react-query's onlineManager is already fed by NetInfo (queryClient.ts),
 * so subscribing to it keeps every consumer — query pausing, upload
 * retries, the offline banner — in agreement about what "offline" means.
 */

import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/** Current connectivity, outside React (stores, queue processors). */
export const isOnline = (): boolean => onlineManager.isOnline();

/** Reactive connectivity for components. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
  );
}
