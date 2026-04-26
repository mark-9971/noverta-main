let _getToken: (() => Promise<string | null>) | null = null;
let _extraHeaders: Record<string, string> | null = null;

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

const DEV_AUTH_BYPASS =
  import.meta.env.VITE_DEV_AUTH_BYPASS === "1" &&
  import.meta.env.MODE !== "production";

function applyApiBaseUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!API_BASE_URL || typeof input !== "string" || !input.startsWith("/")) {
    return input;
  }
  return `${API_BASE_URL}${input}`;
}

export function registerTokenProvider(fn: () => Promise<string | null>) {
  _getToken = fn;
}

export function setAuthFetchExtraHeaders(headers: Record<string, string> | null) {
  _extraHeaders = headers;
}

/**
 * Dev-only auth bypass headers. When VITE_DEV_AUTH_BYPASS=1 in a non-production
 * build, these x-test-* headers are merged into every authFetch call so the
 * agent can hit the API without a real Clerk session. Production rejects these
 * headers server-side regardless of any flag.
 *
 * Returns {} when bypass is off, so callers can spread unconditionally.
 *
 * Belt-and-braces: explicitly returns {} whenever MODE === "production" so
 * that even if `VITE_DEV_AUTH_BYPASS=1` somehow leaks into a production build
 * (this is also blocked at build time by `vite.config.ts`), the runtime
 * cannot emit spoofable identity headers.
 */
export function getDevAuthBypassHeaders(): Record<string, string> {
  if (import.meta.env.MODE === "production") return {};
  if (import.meta.env.VITE_DEV_AUTH_BYPASS !== "1") return {};
  if (typeof window !== "undefined" && !(window as { __TRELLIS_DEV_BYPASS_WARNED__?: boolean }).__TRELLIS_DEV_BYPASS_WARNED__) {
    (window as { __TRELLIS_DEV_BYPASS_WARNED__?: boolean }).__TRELLIS_DEV_BYPASS_WARNED__ = true;
    // Visible in the browser console so an engineer immediately notices when
    // a non-prod build is running with the bypass on.
    console.warn(
      "[Trellis] VITE_DEV_AUTH_BYPASS is enabled — every API call carries x-test-* admin headers. " +
        "This must NEVER be set in a Railway / Render / Fly deployment.",
    );
  }
  return {
    "x-test-user-id": "dev_bypass_admin",
    "x-test-role": "admin",
    "x-test-district-id": "6",
  };
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  input = applyApiBaseUrl(input);

  let token: string | null = null;
  const shouldSkipToken =
    DEV_AUTH_BYPASS || Boolean(_extraHeaders?.["x-test-user-id"]);

  if (_getToken && !shouldSkipToken) {
    try { token = await _getToken(); } catch {}
  }
  const headers: Record<string, string> = {
    ...(_extraHeaders ?? undefined),
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(input, { ...init, headers });
}
