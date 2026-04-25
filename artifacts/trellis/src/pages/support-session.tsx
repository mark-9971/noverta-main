/**
 * Noverta-support landing page: pick a district + provide a reason to open
 * a 60-minute read-only session, or view the currently-active one.
 *
 * Shown as the home route for the trellis_support role. When no session is
 * active, the rest of the app surfaces 403s — that's by design; this page
 * is the gate.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy, AlertTriangle } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { useSupportSession } from "@/lib/support-session-context";

interface DistrictOption { id: number; name: string; state: string | null }

export default function SupportSessionPage() {
  const { session, openSession, endSession, remainingMs } = useSupportSession();
  const [districtId, setDistrictId] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: districtList, isLoading } = useQuery<{ districts: DistrictOption[] }>({
    queryKey: ["support-session/districts"],
    queryFn: async () => {
      const r = await authFetch("/api/support-session/districts");
      if (!r.ok) throw new Error("Failed to load district list");
      return r.json();
    },
    staleTime: 60_000,
  });

  // Reset form when an existing session is detected/cleared so the form
  // doesn't carry stale values across session lifecycle changes.
  useEffect(() => { if (session) { setDistrictId(""); setReason(""); setError(null); } }, [session?.sessionId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (typeof districtId !== "number") { setError("Pick a district"); return; }
    if (reason.trim().length < 8) { setError("Reason must be at least 8 characters"); return; }
    setSubmitting(true);
    try {
      await openSession(districtId, reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open session");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
          <LifeBuoy className="w-5 h-5 text-sky-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Noverta Support — Read-Only Access</h1>
          <p className="text-sm text-gray-500">Open a 60-minute audited session to inspect a district's data.</p>
        </div>
      </div>

      {session ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-5 space-y-3">
          <p className="text-sm text-sky-900">
            <strong>Active session</strong> for district #{session.districtId}.
            Time remaining: <span className="font-mono">{Math.max(0, Math.round(remainingMs / 1000))}s</span>.
          </p>
          <p className="text-xs text-sky-800 italic">Reason: {session.reason}</p>
          <p className="text-xs text-gray-600">
            Every page view and API read while this session is open is tagged with session id <code>{session.sessionId}</code> and visible to the district admin.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => endSession()}
              className="px-3 py-1.5 rounded-md border border-sky-300 bg-white text-sm text-sky-800 hover:bg-sky-100"
              data-testid="button-end-support-session"
            >
              End session now
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 flex gap-2 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              Sessions are time-boxed to 60 minutes and read-only. Your activity is recorded in the
              district's audit log along with the reason you give below. The district admin can see this session.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
            <select
              data-testid="select-support-district"
              value={districtId === "" ? "" : String(districtId)}
              onChange={e => setDistrictId(e.target.value ? Number(e.target.value) : "")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              disabled={isLoading || submitting}
            >
              <option value="">{isLoading ? "Loading…" : "Choose district…"}</option>
              {districtList?.districts.map(d => (
                <option key={d.id} value={d.id}>{d.name}{d.state ? ` (${d.state})` : ""} — #{d.id}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for access</label>
            <textarea
              data-testid="input-support-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Investigating ticket #4821 — guardian portal not loading for student #1002"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-sans"
              disabled={submitting}
            />
            <p className="mt-1 text-xs text-gray-500">{reason.length}/500 chars (min 8)</p>
          </div>

          {error && <p className="text-sm text-red-600" data-testid="support-session-error">{error}</p>}

          <button
            type="submit"
            data-testid="button-open-support-session"
            disabled={submitting || typeof districtId !== "number" || reason.trim().length < 8}
            className="px-4 py-2 rounded-md bg-sky-700 text-white text-sm font-medium hover:bg-sky-800 disabled:opacity-50"
          >
            {submitting ? "Opening…" : "Open 60-minute read-only session"}
          </button>
        </form>
      )}
    </div>
  );
}
