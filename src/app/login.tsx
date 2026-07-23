import { useLocalSearchParams } from "expo-router";
import AuthScreen from "@/features/auth/screens/AuthScreen";

export default function LoginPage() {
  // Set by the (app) guard when an unauthenticated user hits a guarded route
  // (e.g. an invite deeplink) — threaded through so login can return there.
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  return <AuthScreen redirect={redirect} />;
}
