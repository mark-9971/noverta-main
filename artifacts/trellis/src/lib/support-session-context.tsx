/**
 * Noverta-support session context. Mirrors view-as-context but for the
 * trellis_support read-only role.
 *
 * Polls /api/support-session/active every 30s so the countdown banner stays
 * in sync with the server's expires_at and self-heals expired rows.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";

export interface SupportSession {
  sessionId: number;
  districtId: number;
  reason: string;
  openedAt: string;
  expiresAt: string;
}

interface ActiveSessionPayload {
  active: boolean;
  session?: SupportSession;
}

interface Ctx {
  session: SupportSession | null;
  remainingMs: number;
  loading: boolean;
  refresh: () => Promise<void>;
  openSession: (districtId: number, reason: string) => Promise<SupportSession>;
  endSession: () => Promise<void>;
}

const SupportSessionContext = createContext<Ctx | null>(null);

const POLL_INTERVAL_MS = 30_000;

export function SupportSessionProvider({ children }: { children: ReactNode }) {
  const { role } = useRole();
  const enabled = role === "trellis_support";
  const [session, setSession] = useState<SupportSession | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [now, setNow] = useState(() => Date.now());
  const pollTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) { setSession(null); setLoading(false); return; }
    try {
      const r = await authFetch("/api/support-session/active");
      if (r.status === 404) { setSession(null); return; }
      if (!r.ok) return;
      const data = await r.json() as ActiveSessionPayload;
      setSession(data.active && data.session ? data.session : null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  // Tick + poll
  useEffect(() => {
    if (!enabled) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    pollTimer.current = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(tick);
      if (pollTimer.current != null) window.clearInterval(pollTimer.current);
    };
  }, [enabled, refresh]);

  const remainingMs = useMemo(() => {
    if (!session) return 0;
    return Math.max(0, new Date(session.expiresAt).getTime() - now);
  }, [session, now]);

  // Auto-refresh once expired so the banner clears and UI re-prompts for a new session.
  useEffect(() => {
    if (session && remainingMs <= 0) refresh();
  }, [session, remainingMs, refresh]);

  const openSession = useCallback(async (districtId: number, reason: string) => {
    const r = await authFetch("/api/support-session/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ districtId, reason }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: "Failed to open support session" }));
      throw new Error(err.error || "Failed to open support session");
    }
    const data = await r.json() as { session: SupportSession };
    setSession(data.session);
    return data.session;
  }, []);

  const endSession = useCallback(async () => {
    await authFetch("/api/support-session/end", { method: "POST" });
    setSession(null);
  }, []);

  return (
    <SupportSessionContext.Provider value={{ session, remainingMs, loading, refresh, openSession, endSession }}>
      {children}
    </SupportSessionContext.Provider>
  );
}

export function useSupportSession(): Ctx {
  const ctx = useContext(SupportSessionContext);
  if (!ctx) throw new Error("useSupportSession must be used within SupportSessionProvider");
  return ctx;
}
