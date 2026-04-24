let _getToken: (() => Promise<string | null>) | null = null;
let _extraHeaders: Record<string, string> | null = null;

export function registerTokenProvider(fn: () => Promise<string | null>) {
  _getToken = fn;
}

export function setAuthFetchExtraHeaders(headers: Record<string, string> | null) {
  _extraHeaders = headers;
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
