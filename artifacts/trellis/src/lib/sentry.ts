import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

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

export function setSentryUser(userId: string, tags?: Record<string, string>) {
  if (!initialized) return;
  Sentry.setUser({ id: userId });
  if (tags) {
    for (const [key, value] of Object.entries(tags)) {
      Sentry.setTag(key, value);
    }
  }
}

export { initialized as sentryInitialized };
