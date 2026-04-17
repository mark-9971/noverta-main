import * as Sentry from "@sentry/node";
import { logger } from "./logger";

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

// Initialize at module-load time so Sentry is active before any route in
// app.ts is registered (ESM imports execute module-level code before the
// importing module's body runs).
const _dsn = process.env.SENTRY_DSN;
let _initialized = false;

if (_dsn) {
  Sentry.init({
    dsn: _dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0,
  });
  _initialized = true;
}

// Called from index.ts entry point to emit a startup log line.
export function initSentry() {
  if (_initialized) {
    logger.info(
      { dsn: _dsn!.replace(/\/\/[^@]+@/, "//***@") },
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

// Flush pending Sentry events — call before process.exit in fatal handlers.
export function flushSentry(timeoutMs = 2000): Promise<boolean> {
  if (!_initialized) return Promise.resolve(true);
  return Sentry.flush(timeoutMs);
}

export const sentryInitialized = () => _initialized;
