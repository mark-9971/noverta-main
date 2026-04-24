import { useEffect, useState } from "react";
import { useParams } from "wouter";

interface SnapshotData {
  districtName: string;
  schoolYear: string;
  generatedAt: string;
  createdAt: string;
  expiresAt: string;
  summary: {
    overallComplianceRate: number;
    totalStudents: number;
    atRiskCount: number;
    totalExposure: number;
  };
  atRiskRows: {
    anonymizedId: string;
    service: string;
    shortfallMinutes: number;
    percentComplete: number;
    riskStatus: string;
    riskLabel: string;
    estimatedExposure: number;
  }[];
  providerSummary: {
    providerName: string;
    studentsServed: number;
    totalDelivered: number;
    totalRequired: number;
    totalShortfall: number;
    complianceRate: number;
  }[];
}

function fmtDollars(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function ComplianceSnapshotPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<SnapshotData | null>(null);
  const [status, setStatus] = useState<"loading" | "not_found" | "error" | "ok">("loading");

  useEffect(() => {
    if (!token) { setStatus("not_found"); return; }
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
    fetch(`${base}/api/share/compliance/${encodeURIComponent(token)}`)
      .then(async r => {
        if (r.status === 404) { setStatus("not_found"); return; }
        if (!r.ok) { setStatus("error"); return; }
        const json = await r.json();
        setData(json);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading snapshot…</div>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-700 mb-2">Snapshot unavailable</h1>
          <p className="text-sm text-gray-400">This link has expired or is no longer valid. Compliance snapshots are valid for 7 days from the time they were created.</p>
        </div>
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold text-gray-700 mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-400">Unable to load this snapshot. Please try again later.</p>
        </div>
      </div>
    );
  }

  const compRate = data.summary.overallComplianceRate;
  const compColor = compRate >= 90 ? "#10b981" : compRate >= 75 ? "#f59e0b" : "#ef4444";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">Compliance Snapshot — shared via Noverta</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">{data.districtName}</h1>
            <p className="text-sm text-gray-400 mt-0.5">School Year: {data.schoolYear}</p>
          </div>
          <div className="text-right text-xs text-gray-400 space-y-0.5">
            <div>Generated {fmtDate(data.generatedAt)}</div>
            <div className="text-gray-300">Expires {fmtDate(data.expiresAt)}</div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Compliance Rate</div>
            <div className="text-2xl font-bold" style={{ color: compColor }}>{compRate}%</div>
            <div className="text-[11px] text-gray-400 mt-0.5">of required minutes delivered</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Students</div>
            <div className="text-2xl font-bold text-gray-800">{data.summary.totalStudents}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">with active service requirements</div>
          </div>
          <div className={`bg-white rounded-xl border p-4 ${data.summary.atRiskCount > 0 ? "border-amber-200" : "border-gray-200"}`}>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">At Risk</div>
            <div className={`text-2xl font-bold ${data.summary.atRiskCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>{data.summary.atRiskCount}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">students behind on services</div>
          </div>
          <div className={`bg-white rounded-xl border p-4 ${data.summary.totalExposure > 0 ? "border-red-200" : "border-gray-200"}`}>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Financial Exposure</div>
            <div className={`text-2xl font-bold ${data.summary.totalExposure > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtDollars(data.summary.totalExposure)}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">estimated compensatory cost</div>
          </div>
        </div>

        {/* At-risk students (anonymized) */}
        {data.atRiskRows.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              <h2 className="text-sm font-semibold text-gray-700">Students Needing Attention ({data.atRiskRows.length})</h2>
              <span className="ml-auto text-[11px] text-gray-400">Student names are anonymized in shared views</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">ID</th>
                    <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Progress</th>
                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Shortfall (min)</th>
                    <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Est. Exposure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.atRiskRows.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-[12px] font-mono text-gray-500">{r.anonymizedId}</td>
                      <td className="px-4 py-2.5 text-[13px] text-gray-600">{r.service}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.percentComplete)}%`, backgroundColor: r.riskStatus === "out_of_compliance" ? "#ef4444" : "#f59e0b" }} />
                          </div>
                          <span className="text-[12px] tabular-nums text-gray-500 w-8">{r.percentComplete}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-red-600 font-medium">{r.shortfallMinutes}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          r.riskStatus === "out_of_compliance"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}>{r.riskLabel}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-red-600">{r.estimatedExposure > 0 ? fmtDollars(r.estimatedExposure) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Provider delivery rates */}
        {data.providerSummary.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Provider Delivery Rates</h2>
            </div>
            <div className="p-4 space-y-3">
              {data.providerSummary.map((p, i) => {
                const pct = Math.min(100, p.complianceRate);
                const color = pct >= 90 ? "#10b981" : pct >= 75 ? "#f59e0b" : "#ef4444";
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-36 truncate text-[13px] text-gray-700 font-medium" title={p.providerName}>{p.providerName}</div>
                    <div className="text-[11px] text-gray-400 w-16 text-right">{p.studentsServed} students</div>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <div className="w-12 text-right">
                      <span className="text-[13px] font-semibold tabular-nums" style={{ color }}>{p.complianceRate.toFixed(0)}%</span>
                    </div>
                    {p.totalShortfall > 0 && (
                      <div className="w-20 text-right text-[11px] text-red-500 tabular-nums">-{p.totalShortfall} min</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Read-only notice + CTA */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col md:flex-row items-center gap-4">
          <div className="flex-1">
            <div className="text-xs font-semibold text-gray-500 mb-1">This is a read-only view</div>
            <p className="text-sm text-gray-600">
              This snapshot was generated on {fmtDate(data.generatedAt)} and reflects compliance data at that point in time.
              To explore the full dashboard, drill into individual students, or manage service delivery, request a Noverta demo account.
            </p>
          </div>
          <a
            // The marketing demo-request URL is env-driven so it can be
            // flipped to the Noverta marketing site (e.g.
            // https://noverta.education/demo) without a code change.
            // Default preserves the current `usetrellis.co` link until
            // the new site is live. See NEXT-6 cutover checklist.
            href={import.meta.env.VITE_DEMO_REQUEST_URL ?? "https://usetrellis.co/demo"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            View Full Dashboard
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>

        <div className="mt-6 text-center text-[11px] text-gray-300">
          Powered by Noverta — SPED compliance management · This link expires {fmtDate(data.expiresAt)}
        </div>
      </div>
    </div>
  );
}
