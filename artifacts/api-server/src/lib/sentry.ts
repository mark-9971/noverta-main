import { logger } from "./logger";

let dsn: string | null = null;
let projectId: string | null = null;
let host: string | null = null;
let publicKey: string | null = null;

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

export function initSentry() {
  const rawDsn = process.env.SENTRY_DSN;
  if (!rawDsn) {
    logger.info("SENTRY_DSN not set — Sentry disabled; errors logged to stdout only");
    return;
  }

  try {
    const url = new URL(rawDsn);
    publicKey = url.username;
    host = url.host;
    projectId = url.pathname.replace(/^\//, "");
    dsn = rawDsn;
    logger.info({ host, projectId }, "Sentry error monitoring enabled");
  } catch {
    logger.warn({ rawDsn }, "Invalid SENTRY_DSN — Sentry disabled");
  }
}

export async function captureException(
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
  if (!dsn || !publicKey || !host || !projectId) return;

  const error = err instanceof Error ? err : new Error(String(err));
  const timestamp = Date.now() / 1000;

  const tags: Record<string, string> = {
    runtime: "node",
    environment: process.env.NODE_ENV ?? "development",
  };
  if (context?.userId) tags["userId"] = context.userId;
  if (context?.schoolId) tags["schoolId"] = context.schoolId;

  const user = context?.userId ? { id: context.userId } : undefined;

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp,
    platform: "node",
    level: "error",
    user,
    tags,
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          stacktrace: error.stack
            ? {
                frames: error.stack
                  .split("\n")
                  .slice(1)
                  .map((line) => {
                    const match =
                      line.trim().match(/^at (.+) \((.+):(\d+):(\d+)\)$/) ||
                      line.trim().match(/^at (.+):(\d+):(\d+)$/);
                    if (!match) return { filename: line.trim() };
                    if (match.length === 5) {
                      return {
                        function: match[1],
                        filename: match[2],
                        lineno: parseInt(match[3], 10),
                        colno: parseInt(match[4], 10),
                      };
                    }
                    return {
                      filename: match[1],
                      lineno: parseInt(match[2], 10),
                      colno: parseInt(match[3], 10),
                    };
                  })
                  .reverse(),
              }
            : undefined,
        },
      ],
    },
    extra: {
      method: context?.method,
      url: context?.url,
      httpStatus: context?.status,
    },
  };

  const envelope = [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");

  const ingestUrl = `https://${host}/api/${projectId}/envelope/`;

  try {
    await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=trellis/1.0, sentry_key=${publicKey}`,
      },
      body: envelope,
    });
  } catch (fetchErr) {
    logger.warn({ err: fetchErr }, "Failed to send error to Sentry");
  }
}

export const sentryInitialized = () => !!dsn;
