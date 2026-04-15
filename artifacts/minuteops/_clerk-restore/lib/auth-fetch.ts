/**
 * CLERK AUTH FETCH (restore version)
 *
 * To restore: cp this file → src/lib/auth-fetch.ts
 *
 * In Clerk mode, the token provider is registered from App.tsx's ProtectedRoutes
 * component via:  registerTokenProvider(() => getToken())
 * where getToken comes from useAuth().
 */
let _getToken: (() => Promise<string | null>) | null = null;

export function registerTokenProvider(fn: () => Promise<string | null>) {
  _getToken = fn;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let token: string | null = null;
  if (_getToken) {
    try { token = await _getToken(); } catch {}
  }
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(input, { ...init, headers });
}
