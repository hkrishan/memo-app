import { Redirect, Stack, usePathname } from "expo-router";
import {
  selectIsAuthenticated,
  selectIsInitialized,
  useAuthStore,
} from "@/features/auth/store/authStore";
import { useDropTakeover } from "@/features/moments/hooks/useDropTakeover";

export default function AppLayout() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isInitialized = useAuthStore(selectIsInitialized);
  const pathname = usePathname();

  // BeReal-style takeover: whenever the app opens/foregrounds with an
  // open drop the user hasn't posted to, present the capture screen
  // (also keeps the iOS Live Activity countdown in sync, app-wide).
  // Internally a no-op while unauthenticated.
  useDropTakeover();

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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="user"
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="user/[userId]"
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="blocked-users"
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="album/[albumId]/index"
        options={{
          headerShown: false,
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="album/create"
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="album/[albumId]/add-members"
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="album/[albumId]/add-photos"
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />

      <Stack.Screen
        name="album/[albumId]/page/create"
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="drop/[albumId]/[momentId]/[eventId]"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="album/[albumId]/page/[pageId]/settings"
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
    </Stack>
  );
}
