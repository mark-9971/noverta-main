/**
 * District-admin view of recent Noverta-support sessions affecting this
 * district. Mounted as a tab inside Settings. Read-only.
 */
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface SessionRow {
  sessionId: number;
  supportUserId: string;
  supportDisplayName: string;
  districtId: number;
  reason: string;
  openedAt: string;
  expiresAt: string;
  endedAt: string | null;
  endReason: string | null;
  auditEntryCount: number;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusFor(row: SessionRow): { label: string; className: string } {
  if (row.endedAt) {
    return {
      label: row.endReason ? `Ended (${row.endReason})` : "Ended",
      className: "bg-gray-100 text-gray-700",
    };
  }
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    return { label: "Expired", className: "bg-amber-100 text-amber-800" };
  }
  return { label: "Active", className: "bg-sky-100 text-sky-800" };
}

export default function SupportSessionsAdminPage() {
  const { data, isLoading, error } = useQuery<{ sessions: SessionRow[] }>({
    queryKey: ["support-sessions/recent"],
    queryFn: async () => {
      const r = await authFetch("/api/support-sessions/recent?limit=50");
      if (!r.ok) throw new Error("Failed to load support sessions");
      return r.json();
    },
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <LifeBuoy className="w-5 h-5 text-sky-700 mt-0.5" />
        <div>
          <h2 className="text-base font-semibold text-gray-900">Noverta support read-only access</h2>
          <p className="text-sm text-gray-500">
            When a Noverta support engineer opens a read-only session against your district, it appears here along with the reason they provided and how many records were viewed.
          </p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">Failed to load sessions.</p>}

      {data && data.sessions.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          No Noverta support has accessed this district's data.
        </div>
      )}

      {data && data.sessions.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Support user</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-left">Opened</th>
                <th className="px-3 py-2 text-left">Ended</th>
                <th className="px-3 py-2 text-right">Records viewed</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.sessions.map(row => {
                const s = statusFor(row);
                return (
                  <tr key={row.sessionId} data-testid={`support-session-row-${row.sessionId}`}>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {row.supportDisplayName}
                      <div className="text-xs text-gray-500 font-mono">{row.supportUserId}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700 max-w-md italic">{row.reason}</td>
                    <td className="px-3 py-2 text-gray-600">{fmtDate(row.openedAt)}</td>
                    <td className="px-3 py-2 text-gray-600">{fmtDate(row.endedAt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{row.auditEntryCount}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
