/**
 * Where a capture was taken.
 *
 * Fetched in the background whenever something is captured, so an upload
 * that follows can tag the photo with its position. Permission is asked on
 * the first capture (contextual), and everything is best-effort — captures
 * never wait on a GPS fix.
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

  const captureCurrentLocation = useCallback(async () => {
    const fetchId = ++locationFetchIdRef.current;
    captureLocationRef.current = null;
    try {
      let { status, canAskAgain } =
        await Location.getForegroundPermissionsAsync();
      if (status !== "granted" && canAskAgain) {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== "granted") return;

      // A recent cached fix is instant; otherwise get a fresh one
      let position = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
      });
      if (!position) {
        position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      }
      if (!position || locationFetchIdRef.current !== fetchId) return;
      captureLocationRef.current = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch {
      // No location for this capture — the photo simply goes untagged
    }
  }, []);

  return { captureLocationRef, captureCurrentLocation };
};
