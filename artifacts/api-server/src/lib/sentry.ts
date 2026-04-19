import * as Sentry from "@sentry/node";
import { logger } from "./logger";
import { IGNORE_ERRORS, shouldDropEvent } from "./sentryFilters";

const ERROR_BUCKET_WINDOW = 60;
const errorBuckets: Record<number, number> = {};

function currentMinuteBucket() {
  return Math.floor(Date.now() / 60000);
}

function pruneOldBuckets() {
  const cutoff = currentMinuteBucket() - ERROR_BUCKET_WINDOW;
  for (const k of Object.keys(errorBuckets)) {
    if (Number(k) < cutoff) delete errorBuckets[Number(k)];
  }
}

export function recordError5xx() {
  const bucket = currentMinuteBucket();
  errorBuckets[bucket] = (errorBuckets[bucket] ?? 0) + 1;
  pruneOldBuckets();
}

export function getErrorCount1h(): number {
  pruneOldBuckets();
  const cutoff = currentMinuteBucket() - ERROR_BUCKET_WINDOW;
  return Object.entries(errorBuckets)
    .filter(([k]) => Number(k) > cutoff)
    .reduce((sum, [, v]) => sum + v, 0);
}

// Resolve the release identifier shared with the frontend so issues across
// the stack collapse onto the same release in Sentry. Order of precedence:
//   1. SENTRY_RELEASE  (explicit override, set by CI / deploy script)
//   2. APP_VERSION     (build-time tag, mirrors VITE_APP_VERSION)
//   3. RENDER_GIT_COMMIT / REPLIT_GIT_COMMIT_SHA / GIT_COMMIT  (CI env)
//   4. npm_package_version
function resolveRelease(): string | undefined {
  return (
    process.env.SENTRY_RELEASE ||
    process.env.APP_VERSION ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.REPLIT_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    process.env.npm_package_version ||
    undefined
  );
}

// Initialize at module-load time so Sentry is active before any route in
// app.ts is registered (ESM imports execute module-level code before the
// importing module's body runs).
const _dsn = process.env.SENTRY_DSN;
const _environment = process.env.NODE_ENV ?? "development";
const _release = resolveRelease();
let _initialized = false;

if (_dsn) {
  Sentry.init({
    dsn: _dsn,
    environment: _environment,
    release: _release,
    tracesSampleRate: 0,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
    ignoreErrors: IGNORE_ERRORS,
    beforeSend(event) {
      if (shouldDropEvent(event, _environment)) return null;
      return event;
    },
  });
  _initialized = true;
}

// Called from index.ts entry point to emit a startup log line.
export function initSentry() {
  if (_initialized) {
    logger.info(
      {
        dsn: _dsn!.replace(/\/\/[^@]+@/, "//***@"),
        environment: _environment,
        release: _release ?? "(unset)",
      },
      "Sentry error monitoring enabled",
    );
  } else {
    logger.info("SENTRY_DSN not set — Sentry disabled; errors logged to stdout only");
  }
}

// Lightweight wrapper used for non-request-scoped captures (uncaughtException,
// unhandledRejection). For in-request captures, prefer Sentry.withScope() +
// Sentry.captureException() directly so httpIntegration request context is
// preserved on the active scope.
export function captureException(
  err: unknown,
  context?: {
    method?: string;
    url?: string;
    status?: number;
    userId?: string;
    schoolId?: string;
    [key: string]: unknown;
  },
) {
  if (!_initialized) return;

  Sentry.withScope((scope) => {
    if (context?.userId) scope.setUser({ id: context.userId });
    if (context?.schoolId) scope.setTag("districtId", context.schoolId);
    if (context?.method !== undefined) scope.setExtra("method", context.method);
    if (context?.url !== undefined) scope.setExtra("url", context.url);
    if (context?.status !== undefined) scope.setExtra("httpStatus", context.status);

    const extra = { ...context };
    delete extra.userId;
    delete extra.schoolId;
    delete extra.method;
    delete extra.url;
    delete extra.status;
    for (const [key, val] of Object.entries(extra)) {
      scope.setExtra(key, val);
    }

    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
  });
}

// Wrap a scheduler tick with a Sentry cron monitor check-in. If Sentry is
// not initialized this is a passthrough — the callback runs as-is and any
// thrown error propagates so existing logging/alerting behaviour is preserved.
//
// `slug` should be a stable identifier (e.g. "reminder-scheduler"); the
// `schedule` describes the expected cadence so Sentry can fire a missed-tick
// alert on its own. Configure a generous `checkinMargin` so brief startup
// delays don't trigger noise.
export function withMonitor<T>(
  slug: string,
  schedule: { type: "interval"; value: number; unit: "minute" | "hour" | "day" } | { type: "crontab"; value: string },
  options: { checkinMargin?: number; maxRuntime?: number } = {},
  callback: () => Promise<T>,
): Promise<T> {
  if (!_initialized) return callback();
  return Sentry.withMonitor(
    slug,
    callback,
    {
      schedule,
      checkinMargin: options.checkinMargin ?? 5,
      maxRuntime: options.maxRuntime ?? 30,
      timezone: "Etc/UTC",
    },
  );
}

// Flush pending Sentry events — call before process.exit in fatal handlers.
export function flushSentry(timeoutMs = 2000): Promise<boolean> {
  if (!_initialized) return Promise.resolve(true);
  return Sentry.flush(timeoutMs);
}

export const sentryInitialized = () => _initialized;
export const sentryRelease = () => _release;
