import * as Sentry from "@sentry/react-native";

// EXPO_PUBLIC_ vars are inlined at build time. When no DSN is configured
// (local dev), Sentry.init is never called and captureException is a no-op,
// so the rest of the app can call it unconditionally.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const isSentryEnabled = Boolean(dsn);

if (isSentryEnabled) {
  Sentry.init({
    dsn,
    enabled: true,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? "development",
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
  });
}

/**
 * Report an error to Sentry. Silent no-op when Sentry is not configured.
 * Optional `context` is attached as extra data on the event.
 */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!isSentryEnabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export { Sentry };
