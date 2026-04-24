/**
 * View-as / impersonation context for platform admins.
 *
 * Stores the active session token in sessionStorage (NOT localStorage — we
 * intentionally limit lifetime to the browser tab so a closed tab cannot be
 * resumed without re-authenticating the impersonation). Token is injected into
 * every authFetch call via setAuthFetchExtraHeaders, which is the same pipe
 * used for X-Test-* dev headers.
 *
 * On mount we revalidate the stored token by calling /api/support/view-as/active;
 * if the server says it's expired/invalid the local state is cleared.
 *
 * The provider exposes startSession / endSession imperatives plus session
 * info for the persistent banner. It is mounted INSIDE RoleProvider so the
 * `isPlatformAdmin` gate is available, but the auth-fetch header injection
 * runs unconditionally so any user who somehow has a token (including one
 * carried over from a previous platform-admin login) gets it sent.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { setAuthFetchExtraHeaders, authFetch } from "@/lib/auth-fetch";

const STORAGE_KEY = "noverta_view_as_token";
const LEGACY_STORAGE_KEY = "trellis_view_as_token";
const HEADER_NAME = "X-View-As-Token";

export interface ViewAsTarget {
  userId: string;
  role: string;
  displayName: string;
  districtId: number | null;
  staffId: number | null;
  studentId: number | null;
  guardianId: number | null;
}

export interface ViewAsSessionInfo {
  sessionId: number;
  reason: string;
  startedAt: string;
  expiresAt: string;
  target: ViewAsTarget;
}

interface StartParams {
  targetUserId: string;
  reason: string;
  /** Dev/test fallback when the target has no Clerk record (e.g. seeded staff). */
  targetSnapshot?: Partial<ViewAsTarget> & { role: string };
}

interface ViewAsContextType {
  session: ViewAsSessionInfo | null;
  isActive: boolean;
  startSession: (params: StartParams) => Promise<{ ok: true } | { ok: false; error: string; status?: number; policyBlocked?: boolean }>;
  endSession: () => Promise<void>;
  /** Milliseconds remaining until expiresAt; 0 if no session. Recomputes every second. */
  remainingMs: number;
}

const ViewAsContext = createContext<ViewAsContextType | null>(null);

function ssGet(k: string): string | null { try { return sessionStorage.getItem(k); } catch { return null; } }
function ssSet(k: string, v: string): void { try { sessionStorage.setItem(k, v); } catch {} }
function ssDel(k: string): void { try { sessionStorage.removeItem(k); } catch {} }

/**
 * Read-fallback for the impersonation token: prefer the new
 * `noverta_view_as_token` key; if absent, copy-forward from the legacy
 * `trellis_view_as_token` and (only on a successful copy) clear the
 * legacy key. Never drops the active impersonation session.
 */
function readToken(): string | null {
  const fresh = ssGet(STORAGE_KEY);
  if (fresh !== null) {
    if (ssGet(LEGACY_STORAGE_KEY) !== null) ssDel(LEGACY_STORAGE_KEY);
    return fresh;
  }
  const legacy = ssGet(LEGACY_STORAGE_KEY);
  if (legacy === null) return null;
  ssSet(STORAGE_KEY, legacy);
  if (ssGet(STORAGE_KEY) === legacy) ssDel(LEGACY_STORAGE_KEY);
  return legacy;
}

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => readToken());
  const [session, setSession] = useState<ViewAsSessionInfo | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  // Track whether we've done the initial server-side revalidation so the banner
  // doesn't flash for one tick on tab-open while a stored token is still being
  // verified.
  const hydratedRef = useRef(false);

  // Apply the token to all outgoing authFetch calls whenever it changes.
  useEffect(() => {
    if (token) setAuthFetchExtraHeaders({ [HEADER_NAME]: token });
    else setAuthFetchExtraHeaders(null);
  }, [token]);

  const setToken = useCallback((t: string | null) => {
    if (t) {
      ssSet(STORAGE_KEY, t);
    } else {
      ssDel(STORAGE_KEY);
      // Belt-and-suspenders: clear the legacy key on logout/end-session
      // so a stale token cannot resurface via the read-fallback.
      ssDel(LEGACY_STORAGE_KEY);
    }
    setTokenState(t);
  }, []);

  // On mount (and whenever the token changes), revalidate against the server.
  // This handles: server-side expiry, manually-revoked sessions, and
  // sessionStorage tokens carried over from a stale tab.
  useEffect(() => {
    let cancelled = false;
    if (!token) { setSession(null); hydratedRef.current = true; return; }
    (async () => {
      try {
        const r = await authFetch("/api/support/view-as/active");
        if (cancelled) return;
        if (r.ok) {
          const body = await r.json() as { active: boolean; session?: ViewAsSessionInfo };
          if (body.active && body.session) setSession(body.session);
          else { setSession(null); setToken(null); }
        } else {
          setSession(null);
          setToken(null);
        }
      } catch {
        // Network blip — keep the token but null the session so the banner
        // hides until the next successful poll.
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [token, setToken]);

  // 1Hz tick for countdown re-render. Stops when no session is active to avoid
  // unnecessary work in the common (non-impersonating) case.
  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session]);

  // Auto-end on client-side expiry. The server will eventually mark the row
  // expired itself, but clearing local state immediately prevents the banner
  // from showing a negative countdown.
  useEffect(() => {
    if (!session) return;
    const expiresAtMs = new Date(session.expiresAt).getTime();
    if (now >= expiresAtMs) {
      setSession(null);
      setToken(null);
    }
  }, [now, session, setToken]);

  const startSession = useCallback<ViewAsContextType["startSession"]>(async (params) => {
    try {
      const r = await authFetch("/api/support/view-as/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: params.targetUserId,
          reason: params.reason,
          targetSnapshot: params.targetSnapshot,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        return {
          ok: false,
          error: body.error ?? `Failed (${r.status})`,
          status: r.status,
          policyBlocked: r.status === 403,
        };
      }
      const body = await r.json() as {
        token: string; sessionId: number; startedAt: string; expiresAt: string; target: ViewAsTarget;
      };
      setToken(body.token);
      setSession({
        sessionId: body.sessionId,
        reason: params.reason,
        startedAt: body.startedAt,
        expiresAt: body.expiresAt,
        target: body.target,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Network error" };
    }
  }, [setToken]);

  const endSession = useCallback(async () => {
    if (!token) { setSession(null); return; }
    try {
      // Use the token via header (already attached by authFetch's extra headers).
      await authFetch("/api/support/view-as/end", { method: "POST" });
    } catch { /* ignore — clear local state regardless */ }
    setSession(null);
    setToken(null);
  }, [token, setToken]);

  const remainingMs = useMemo(() => {
    if (!session) return 0;
    return Math.max(0, new Date(session.expiresAt).getTime() - now);
  }, [session, now]);

  const value = useMemo<ViewAsContextType>(() => ({
    session,
    isActive: session !== null,
    startSession,
    endSession,
    remainingMs,
  }), [session, startSession, endSession, remainingMs]);

  return <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
}

export function useViewAs(): ViewAsContextType {
  const ctx = useContext(ViewAsContext);
  if (!ctx) throw new Error("useViewAs must be used inside <ViewAsProvider>");
  return ctx;
}
