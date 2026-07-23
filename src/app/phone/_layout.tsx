import { Stack } from "expo-router";

/**
 * The phone (SMS OTP) auth flow: number → code → name, each its own
 * screen with native slide transitions. The name screen locks the back
 * gesture — by then the account exists and forward is the only direction.
 */
export default function PhoneAuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#000" },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="code" />
      <Stack.Screen name="name" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
