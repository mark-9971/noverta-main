import { logger } from "./logger";

let dsn: string | null = null;
let projectId: string | null = null;
let host: string | null = null;
let publicKey: string | null = null;

export function initSentry() {
  const rawDsn = process.env.SENTRY_DSN;
  if (!rawDsn) {
    logger.info("SENTRY_DSN not set — error monitoring disabled");
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
    logger.warn({ rawDsn }, "Invalid SENTRY_DSN — error monitoring disabled");
  }
}

export async function captureException(
  err: unknown,
  context?: Record<string, unknown>,
) {
  if (!dsn || !publicKey || !host || !projectId) return;

  const error = err instanceof Error ? err : new Error(String(err));
  const timestamp = Date.now() / 1000;

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp,
    platform: "node",
    level: "error",
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
                    const match = line.trim().match(/^at (.+) \((.+):(\d+):(\d+)\)$/) ||
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
    extra: context,
    tags: {
      runtime: "node",
      environment: process.env.NODE_ENV ?? "development",
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

export function setUserContext(_userId: string, _tags?: Record<string, string>) {
}

export const sentryInitialized = () => !!dsn;
