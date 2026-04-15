function getStoredToken(): string | null {
  try { return localStorage.getItem("trellis_session"); } catch { return null; }
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(input, { ...init, headers });
}

// No-op kept for backward compatibility — token is read directly from localStorage.
export function registerTokenProvider(_fn: () => Promise<string | null>) {}
