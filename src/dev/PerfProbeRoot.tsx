/**
 * PERF-PROBE (TEMPORARY — remove after profiling session).
 *
 * Boots the app into a profilable state with no touch input: completes
 * onboarding, test-logs-in as the probe user, then navigates to the probe
 * album. The gallery-side probe (useGalleryPerfProbe) takes over from there.
 */

import { useEffect, useRef } from "react";
import { router } from "expo-router";

import useAuth from "@/features/auth/hooks/useAuth";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useOnboardingStore } from "@/features/onboarding/store/onboardingStore";
import {
  PERF_PROBE_ENABLED,
  PROBE_ALBUM_ID,
  PROBE_USER_ID,
  mark,
  sleep,
} from "./perfProbe";

export function PerfProbeRoot(): null {
  const { testLogin } = useAuth();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!PERF_PROBE_ENABLED || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      // Let fonts/splash/root queries settle
      await sleep(1500);
      useOnboardingStore.getState().completeOnboarding();
      if (!useAuthStore.getState().isAuthenticated) {
        // eslint-disable-next-line no-console
        console.log("[PERF-PROBE] logging in as probe user");
        await testLogin(PROBE_USER_ID, { skipNavigation: true });
        await sleep(800);
      }
      mark("navigate_to_album");
      // eslint-disable-next-line no-console
      console.log("[PERF-PROBE] navigating to probe album");
      router.push(`/album/${PROBE_ALBUM_ID}`);
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.log("[PERF-PROBE] setup failed", err);
    });
  }, [testLogin]);

  return null;
}
