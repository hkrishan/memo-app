/**
 * Where a capture was taken.
 *
 * Fetched in the background whenever something is captured, so an upload
 * that follows can tag the photo with its position. Permission is READ
 * only here — the OS prompt is owned by the camera's LocationPrimerSheet
 * (shown once, with context, before the first capture). Requesting from
 * inside the shutter path would ambush a user who chose "Not now" on the
 * primer. Everything is best-effort — captures never wait on a GPS fix.
 */

import { useCallback, useRef } from "react";
import * as Location from "expo-location";

export interface CaptureLocation {
  latitude: number;
  longitude: number;
}

export const useCaptureLocation = () => {
  const captureLocationRef = useRef<CaptureLocation | null>(null);
  // Guards a slow fix from tagging a later capture
  const locationFetchIdRef = useRef(0);

  const captureCurrentLocation =
    useCallback(async (): Promise<CaptureLocation | null> => {
      const fetchId = ++locationFetchIdRef.current;
      captureLocationRef.current = null;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return null;

        // A recent cached fix is instant; otherwise get a fresh one
        let position = await Location.getLastKnownPositionAsync({
          maxAge: 60_000,
        });
        if (!position) {
          position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        }
        if (!position || locationFetchIdRef.current !== fetchId) return null;
        const fix: CaptureLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        captureLocationRef.current = fix;
        return fix;
      } catch {
        // No location for this capture — the photo simply goes untagged
        return null;
      }
    }, []);

  return { captureLocationRef, captureCurrentLocation };
};
