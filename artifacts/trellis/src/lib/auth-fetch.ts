let _getToken: (() => Promise<string | null>) | null = null;
let _extraHeaders: Record<string, string> | null = null;

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
 */
export function getDevAuthBypassHeaders(): Record<string, string> {
  if (
    import.meta.env.VITE_DEV_AUTH_BYPASS === "1" &&
    import.meta.env.MODE !== "production"
  ) {
    return {
      "x-test-user-id": "dev_bypass_admin",
      "x-test-role": "admin",
      "x-test-district-id": "6",
    };
  }
  return {};
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let token: string | null = null;
  if (_getToken) {
    try { token = await _getToken(); } catch {}
  }
  const headers: Record<string, string> = {
    ...(_extraHeaders ?? undefined),
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(input, { ...init, headers });
}
