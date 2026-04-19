export const IGNORE_ERRORS: (string | RegExp)[] = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "Non-Error promise rejection captured",
  "Non-Error exception captured",
  /^Network request failed$/,
  /^Failed to fetch$/,
  /^Load failed$/,
  /^The operation was aborted/i,
  /AbortError/i,
  /^cancelled$/i,
  /top\.GLOBALS/,
  /Script error\.?$/i,
  /chrome-extension:\/\//,
  /moz-extension:\/\//,
  /safari-extension:\/\//,
  /^window\.webkit\.messageHandlers/,
  /atomicFindClose/,
  /fb_xd_fragment/,
];

export const DENY_URLS: RegExp[] = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /safari-web-extension:\/\//i,
];

export interface SentryEventLike {
  request?: { url?: string };
  exception?: { values?: Array<{ stacktrace?: { frames?: Array<{ filename?: string }> } }> };
}

export function shouldDropEvent(event: SentryEventLike, environment: string): boolean {
  if (environment === "development") return true;

  const url = event.request?.url ?? "";
  if (/(^https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)) {
    return true;
  }

  const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
  for (const frame of frames) {
    const fname = frame.filename ?? "";
    if (DENY_URLS.some((rx) => rx.test(fname))) return true;
  }
  return false;
}
