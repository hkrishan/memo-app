import { Redirect, Stack, usePathname } from "expo-router";
import {
  selectIsAuthenticated,
  selectIsInitialized,
  useAuthStore,
} from "@/features/auth/store/authStore";
import {
  selectHasCompletedOnboarding,
  useOnboardingStore,
} from "@/features/onboarding/store/onboardingStore";
import { useDropTakeover } from "@/features/moments/hooks/useDropTakeover";
import { useInAppNotificationBanners } from "@/features/notifications/inApp/useInAppNotificationBanners";
import { useResumeLibraryUploads } from "@/features/photos/store/libraryUploadQueue";
import { useResumeAlbumUploads } from "@/features/album/store/uploadManager";
import OfflineBanner from "@/components/global/OfflineBanner";


// Identity-stable screen options (this layout re-renders on every
// navigation via usePathname — fresh inline objects made every
// Stack.Screen reconcile)
const MODAL_OPTIONS = { headerShown: false, presentation: "modal" } as const;
const PLAIN_OPTIONS = { headerShown: false, gestureEnabled: true } as const;
const NO_GESTURE_OPTIONS = { headerShown: false, gestureEnabled: false } as const;
const TAKEOVER_OPTIONS = {
  headerShown: false,
  presentation: "fullScreenModal",
  gestureEnabled: false,
} as const;

export default function AppLayout() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isInitialized = useAuthStore(selectIsInitialized);
  const hasCompletedOnboarding = useOnboardingStore(
    selectHasCompletedOnboarding,
  );
  const pathname = usePathname();

  // BeReal-style takeover: whenever the app opens/foregrounds with an
  // open drop the user hasn't posted to, present the capture screen
  // (also keeps the iOS Live Activity countdown in sync, app-wide).
  // Internally a no-op while unauthenticated.
  useDropTakeover();

  // Socket-delivered banners for pushes that arrive while the app is
  // foregrounded (the OS banner is suppressed in push.ts). No-op while
  // unauthenticated.
  useInAppNotificationBanners();

  // Resume any captures still waiting to upload to the Memo library
  // (persisted queue survives restarts; retries on foreground/network)
  useResumeLibraryUploads();

  // Same for photo-picker batches headed into albums — photos added while
  // offline upload themselves once there's a connection again
  useResumeAlbumUploads();

  // Wait for the persisted auth state to rehydrate before deciding
  if (!isInitialized) {
    return null;
  }

  // Guard the whole (app) group — deep links can't bypass the login screen.
  // NOTE: must target /login, never "/" — the (app) group's own index also
  // matches "/", so a bare-slash redirect from inside the group resolves
  // right back into it and loops forever.
  // Carry the intended path (e.g. a cold-start invite deeplink) so the login
  // flow can land the user where they were headed instead of on home.
  if (!isAuthenticated) {
    const redirect = pathname && pathname !== "/" ? pathname : undefined;
    return (
      <Redirect
        href={
          redirect ? { pathname: "/login", params: { redirect } } : "/login"
        }
      />
    );
  }

  // One-time intro + permission priming. Sits AFTER the auth guard (the
  // flow is meaningless logged out) and targets a route OUTSIDE this group
  // so the redirect can't loop. The MMKV-backed flag hydrates synchronously,
  // so no isInitialized-style wait is needed. Carries the intended path the
  // same way the login guard does.
  if (!hasCompletedOnboarding) {
    const redirect = pathname && pathname !== "/" ? pathname : undefined;
    return (
      <Redirect
        href={
          redirect
            ? { pathname: "/onboarding", params: { redirect } }
            : "/onboarding"
        }
      />
    );
  }

  return (
    <>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="user"
        options={MODAL_OPTIONS}
      />
      <Stack.Screen
        name="user/[userId]"
        options={MODAL_OPTIONS}
      />
      <Stack.Screen
        name="profile"
        options={MODAL_OPTIONS}
      />
      <Stack.Screen
        name="activity"
        options={MODAL_OPTIONS}
      />
      <Stack.Screen
        name="search"
        options={MODAL_OPTIONS}
      />
      <Stack.Screen
        name="blocked-users"
        options={MODAL_OPTIONS}
      />
      <Stack.Screen
        name="premium"
        options={MODAL_OPTIONS}
      />
      <Stack.Screen
        name="album/[albumId]/index"
        options={PLAIN_OPTIONS}
      />
      <Stack.Screen
        name="album/create"
        options={MODAL_OPTIONS}
      />
      <Stack.Screen
        name="album/[albumId]/add-members"
        options={MODAL_OPTIONS}
      />
      <Stack.Screen
        name="album/[albumId]/add-photos"
        options={MODAL_OPTIONS}
      />

      <Stack.Screen
        name="album/[albumId]/page/create"
        options={MODAL_OPTIONS}
      />
      {/* Studio editor pans its canvas horizontally — the iOS back-swipe
          would swallow drags near the left edge */}
      <Stack.Screen
        name="create/studio"
        options={NO_GESTURE_OPTIONS}
      />
      <Stack.Screen
        name="drop/[albumId]/[momentId]/[eventId]"
        options={TAKEOVER_OPTIONS}
      />
      <Stack.Screen
        name="album/[albumId]/page/[pageId]/settings"
        options={MODAL_OPTIONS}
      />
    </Stack>
    {/* Connectivity strip over every authenticated screen */}
    <OfflineBanner />
    </>
  );
}
