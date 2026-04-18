import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    if (import.meta.env.PROD) {
      console.warn("[Sentry] VITE_SENTRY_DSN is not set — client-side error tracking is disabled.");
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE ?? "development",
    release: import.meta.env.VITE_APP_VERSION,
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
  });

  initialized = true;
}

export function captureException(err: unknown, context?: Record<string, unknown>) {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
    }
    Sentry.captureException(err);
  });
}

const SENTRY_USER_TAGS = ["role", "districtId"] as const;

export function setSentryUser(userId: string | null, tags?: Record<string, string>, email?: string | null) {
  if (!initialized) return;
  if (!userId) {
    Sentry.setUser(null);
    for (const tag of SENTRY_USER_TAGS) {
      Sentry.setTag(tag, "");
    }
    return;
  }
  Sentry.setUser(email ? { id: userId, email } : { id: userId });
  for (const tag of SENTRY_USER_TAGS) {
    Sentry.setTag(tag, tags?.[tag] ?? "");
  }
}

export { initialized as sentryInitialized };
