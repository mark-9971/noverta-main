export const IGNORE_ERRORS: (string | RegExp)[] = [
  "Non-Error promise rejection captured",
  "Non-Error exception captured",
  /^The operation was aborted/i,
  /AbortError/i,
  /^ECONNRESET$/,
  /^EPIPE$/,
  /^request aborted$/i,
  /^socket hang up$/i,
];

export interface SentryEventLike {
  request?: { url?: string; headers?: Record<string, string | string[] | undefined> };
}

const BOT_UA_RX = /(bot|crawler|spider|crawling|googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp|facebookexternalhit|semrush|ahrefs|mj12bot|petalbot|headlesschrome|phantomjs)/i;

export function shouldDropEvent(event: SentryEventLike, environment: string): boolean {
  if (environment === "development" || environment === "test") return true;

  const url = event.request?.url ?? "";
  if (/(^https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)) {
    return true;
  }

  const headers = event.request?.headers ?? {};
  const ua = headers["user-agent"] ?? headers["User-Agent"];
  const uaStr = Array.isArray(ua) ? ua.join(" ") : ua ?? "";
  if (uaStr && BOT_UA_RX.test(uaStr)) return true;

  return false;
}
