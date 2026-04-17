import { useEffect, useMemo, useState } from "react";
import { Printer, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";

// ---- Response types (only what we consume) ---------------------------------

type ExecutiveResp = {
  complianceScore: number;
  totalStudents: number;
  riskCounts: { onTrack: number; slightlyBehind: number; atRisk: number; outOfCompliance: number };
  topAtRiskStudents: Array<{
    studentId: number; studentName: string;
    percentComplete: number; riskStatus: string;
  }>;
  openAlerts: number;
  criticalAlerts: number;
  deadlineCounts: { within30: number; within60: number; within90: number };
};
type PilotMetricsResp = {
  sessionLogging: { percent: number; onTime: number; total: number; target: number };
  incidentTimeliness: { percent: number; onTime: number; total: number; target: number };
  rosterCoverage: { percent: number; withIep: number; totalActive: number };
  annualReviewCompliance: { expiredIeps: number };
};
type ComplianceTrendsResp = {
  months: string[];
  serviceMinutes: Array<{ month: string; requiredMinutes: number; deliveredMinutes: number; compliancePercent: number | null }>;
  atRiskStudents: Array<{ month: string; atRiskCount: number | null; totalTracked: number }>;
  dataQuality: "ok" | "sparse" | "empty";
};
type CompFinanceResp = {
  totalMinutesOwed: number; totalMinutesDelivered: number;
  totalDollarsOwed: number; studentsAffected: number;
  pendingCount: number; inProgressCount: number; completedCount: number;
  byServiceType: Array<{ name: string; minutesOwed: number; dollarsOwed: number; count: number }>;
  bySchool: Array<{ name: string; minutesOwed: number; dollarsOwed: number; count: number }>;
};
type IncidentRow = {
  id: number; studentId: number;
  studentFirstName: string | null; studentLastName: string | null;
  incidentDate: string; incidentTime: string | null;
  incidentType: string; restraintType: string | null;
  durationMinutes: number | null; location: string | null;
  studentInjury: boolean; staffInjury: boolean;
  parentNotified: boolean | null;
  status: string;
};
type MinutesSummaryResp = {
  staffUtilization: Array<{
    staffId: number; staffName: string; role: string | null;
    totalMinutes: number; sessionCount: number; missedCount: number;
  }>;
};

type PacketData = {
  executive: ExecutiveResp | null;
  pilot: PilotMetricsResp | null;
  trends: ComplianceTrendsResp | null;
  comp: CompFinanceResp | null;
  incidents: IncidentRow[];
  minutes: MinutesSummaryResp | null;
};

const FOURTEEN_DAYS_AGO = (): string => {
  const d = new Date(); d.setDate(d.getDate() - 14);
  return d.toISOString().slice(0, 10);
};

const fmtDate = (iso: string): string =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

const fmtMonthShort = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
};

const fmtMinutes = (n: number): string => n.toLocaleString();

const fmtDollars = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const riskLabel = (s: string): string =>
  s === "out_of_compliance" ? "Out of compliance" :
  s === "at_risk" ? "At risk" :
  s === "slightly_behind" ? "Slightly behind" :
  "On track";

// ---- Page ------------------------------------------------------------------

export default function LeadershipPacketPage() {
  const { filterParams } = useSchoolContext();
  const [data, setData] = useState<PacketData>({
    executive: null, pilot: null, trends: null, comp: null, incidents: [], minutes: null,
  });
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrors([]);

    const baseQs = new URLSearchParams(filterParams).toString();
    const trendsQs = new URLSearchParams({ months: "6", ...filterParams }).toString();
    const incidentsQs = new URLSearchParams({ startDate: FOURTEEN_DAYS_AGO(), ...filterParams }).toString();

    const fetchOne = async <T,>(path: string, label: string): Promise<T | null> => {
      try {
        const r = await authFetch(path);
        if (!r.ok) throw new Error(`${label}: HTTP ${r.status}`);
        return (await r.json()) as T;
      } catch (e: any) {
        if (!cancelled) setErrors(prev => [...prev, e?.message ?? String(e)]);
        return null;
      }
    };

    Promise.all([
      fetchOne<ExecutiveResp>(`/api/dashboard/executive?${baseQs}`, "executive"),
      fetchOne<PilotMetricsResp>(`/api/dashboard/pilot-metrics?${baseQs}`, "pilot-metrics"),
      fetchOne<ComplianceTrendsResp>(`/api/dashboard/compliance-trends?${trendsQs}`, "trends"),
      fetchOne<CompFinanceResp>(`/api/compensatory-finance/overview?${baseQs}`, "comp-finance"),
      fetchOne<IncidentRow[]>(`/api/protective-measures/incidents?${incidentsQs}`, "incidents"),
      fetchOne<MinutesSummaryResp>(`/api/analytics/minutes-summary?${baseQs}`, "minutes-summary"),
    ]).then(([executive, pilot, trends, comp, incidents, minutes]) => {
      if (cancelled) return;
      setData({ executive, pilot, trends, comp, incidents: incidents ?? [], minutes });
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [JSON.stringify(filterParams)]);

  // ---- Derived: provider issues (top offenders) ----
  const providerIssues = useMemo(() => {
    if (!data.minutes?.staffUtilization) return [];
    return data.minutes.staffUtilization
      .filter(s => (s.sessionCount + s.missedCount) >= 5) // need enough volume to be meaningful
      .map(s => {
        const total = s.sessionCount + s.missedCount;
        return {
          ...s,
          missedPercent: total > 0 ? Math.round((s.missedCount / total) * 100) : 0,
          totalSessions: total,
        };
      })
      .filter(s => s.missedPercent >= 15) // 15%+ missed = flagged
      .sort((a, b) => b.missedPercent - a.missedPercent)
      .slice(0, 8);
  }, [data.minutes]);

  // ---- Derived: shortfall trend (last 6 months) ----
  const shortfallTrend = useMemo(() => {
    if (!data.trends?.serviceMinutes) return [];
    return data.trends.serviceMinutes.map(p => ({
      month: fmtMonthShort(p.month),
      delivered: p.deliveredMinutes,
      required: p.requiredMinutes,
      shortfall: Math.max(0, p.requiredMinutes - p.deliveredMinutes),
      compliance: p.compliancePercent,
    }));
  }, [data.trends]);

  // ---- Notable incidents filter (with injury, restraint, or pending notification) ----
  const notableIncidents = useMemo(() => {
    return data.incidents
      .filter(i =>
        i.studentInjury || i.staffInjury ||
        i.incidentType === "physical_restraint" ||
        i.incidentType === "seclusion" ||
        !i.parentNotified
      )
      .slice(0, 10);
  }, [data.incidents]);

  const exportHtml = () => {
    const html = buildExportHtml(data, providerIssues, shortfallTrend, notableIncidents);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leadership-packet-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-[900px] mx-auto space-y-4">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[900px] mx-auto">
      {/* Action bar — hidden on print */}
      <div className="no-print flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
        <div className="text-xs text-gray-500">
          Print-ready packet. Page chrome is hidden in print.
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportHtml} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export HTML
          </Button>
          <Button size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="w-3.5 h-3.5" /> Print packet
          </Button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="no-print mb-4 p-3 border border-amber-200 bg-amber-50 text-xs text-amber-800 rounded">
          Some sections couldn't load: {errors.join("; ")}
        </div>
      )}

      <div id="leadership-packet-content">
        {/* Header */}
        <header className="mb-6 pb-3 border-b border-gray-300">
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Leadership Meeting Packet</h1>
          <p className="text-xs text-gray-600 mt-1">
            Generated {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            {" · "}District-wide unless otherwise scoped
          </p>
        </header>

        {/* §1 District compliance snapshot */}
        <Section title="1. District Compliance Snapshot">
          {data.executive ? (
            <>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <Kpi label="Compliance Score" value={`${data.executive.complianceScore}%`}
                     emphasis={data.executive.complianceScore < 80 ? "warn" : "ok"} />
                <Kpi label="Active Students" value={data.executive.totalStudents.toLocaleString()} />
                <Kpi label="Critical Alerts" value={data.executive.criticalAlerts.toString()}
                     emphasis={data.executive.criticalAlerts > 0 ? "warn" : "ok"} />
                <Kpi label="Open Alerts" value={data.executive.openAlerts.toString()} />
              </div>
              <table className="w-full text-xs">
                <thead><tr className="text-[10px] uppercase text-gray-500 border-b border-gray-200">
                  <th className="text-left font-semibold py-1.5">Bucket</th>
                  <th className="text-right font-semibold">Students</th>
                  <th className="text-right font-semibold">% of Active</th>
                </tr></thead>
                <tbody>
                  {(["onTrack", "slightlyBehind", "atRisk", "outOfCompliance"] as const).map(k => {
                    const n = data.executive!.riskCounts[k];
                    const pct = data.executive!.totalStudents > 0
                      ? Math.round((n / data.executive!.totalStudents) * 100) : 0;
                    return (
                      <tr key={k} className="border-b border-gray-100">
                        <td className="py-1.5">{k === "onTrack" ? "On track" : k === "slightlyBehind" ? "Slightly behind" : k === "atRisk" ? "At risk" : "Out of compliance"}</td>
                        <td className="text-right tabular-nums">{n}</td>
                        <td className="text-right text-gray-500 tabular-nums">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-500 mt-2">
                IEP / triennial deadlines: <strong>{data.executive.deadlineCounts.within30}</strong> within 30 days
                · <strong>{data.executive.deadlineCounts.within60}</strong> within 60 days
                · <strong>{data.executive.deadlineCounts.within90}</strong> within 90 days.
              </p>
            </>
          ) : <Empty reason="executive dashboard unavailable" />}
        </Section>

        {/* §2 High-risk students */}
        <Section title="2. High-Risk Students">
          {data.executive && data.executive.topAtRiskStudents.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr className="text-[10px] uppercase text-gray-500 border-b border-gray-200">
                <th className="text-left font-semibold py-1.5">Student</th>
                <th className="text-left font-semibold">Status</th>
                <th className="text-right font-semibold">% Delivered</th>
              </tr></thead>
              <tbody>
                {data.executive.topAtRiskStudents.map(s => (
                  <tr key={s.studentId} className="border-b border-gray-100">
                    <td className="py-1.5">
                      <div className="font-medium">{s.studentName}</div>
                    </td>
                    <td>
                      <span className={`badge ${s.riskStatus === "out_of_compliance" ? "badge-red" : "badge-amber"} px-1.5 py-0.5 rounded text-[10px] ${
                        s.riskStatus === "out_of_compliance" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                        {riskLabel(s.riskStatus)}
                      </span>
                    </td>
                    <td className="text-right tabular-nums font-medium">{s.percentComplete}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty reason="no students currently flagged" />}
        </Section>

        {/* §3 Provider issues */}
        <Section title="3. Provider Issues">
          {data.pilot && (
            <p className="text-[11px] text-gray-600 mb-2">
              Logging timeliness:{" "}
              <strong className={data.pilot.sessionLogging.percent < (data.pilot.sessionLogging.target ?? 80) ? "text-red-700" : "text-gray-900"}>
                {data.pilot.sessionLogging.percent}%
              </strong> ({data.pilot.sessionLogging.onTime} / {data.pilot.sessionLogging.total} sessions logged on time, target {data.pilot.sessionLogging.target ?? 80}%).
              {" "}Incident timeliness:{" "}
              <strong className={data.pilot.incidentTimeliness.percent < 100 ? "text-amber-700" : "text-gray-900"}>
                {data.pilot.incidentTimeliness.percent}%
              </strong> ({data.pilot.incidentTimeliness.onTime} / {data.pilot.incidentTimeliness.total} within 24h).
            </p>
          )}
          {providerIssues.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr className="text-[10px] uppercase text-gray-500 border-b border-gray-200">
                <th className="text-left font-semibold py-1.5">Provider</th>
                <th className="text-left font-semibold">Role</th>
                <th className="text-right font-semibold">Missed</th>
                <th className="text-right font-semibold">Total</th>
                <th className="text-right font-semibold">Miss Rate</th>
              </tr></thead>
              <tbody>
                {providerIssues.map(p => (
                  <tr key={p.staffId} className="border-b border-gray-100">
                    <td className="py-1.5 font-medium">{p.staffName}</td>
                    <td className="text-gray-600">{p.role ?? "—"}</td>
                    <td className="text-right tabular-nums">{p.missedCount}</td>
                    <td className="text-right tabular-nums text-gray-500">{p.totalSessions}</td>
                    <td className="text-right tabular-nums font-medium text-red-700">{p.missedPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty reason="no providers exceed the 15% missed-session threshold (min 5 sessions)" />}
        </Section>

        {/* §4 Shortfall trends */}
        <Section title="4. Shortfall Trends (last 6 months)">
          {shortfallTrend.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr className="text-[10px] uppercase text-gray-500 border-b border-gray-200">
                <th className="text-left font-semibold py-1.5">Month</th>
                <th className="text-right font-semibold">Required (min)</th>
                <th className="text-right font-semibold">Delivered (min)</th>
                <th className="text-right font-semibold">Shortfall</th>
                <th className="text-right font-semibold">Compliance</th>
              </tr></thead>
              <tbody>
                {shortfallTrend.map(p => (
                  <tr key={p.month} className="border-b border-gray-100">
                    <td className="py-1.5">{p.month}</td>
                    <td className="text-right tabular-nums text-gray-600">{fmtMinutes(p.required)}</td>
                    <td className="text-right tabular-nums">{fmtMinutes(p.delivered)}</td>
                    <td className="text-right tabular-nums font-medium text-red-700">{p.shortfall > 0 ? fmtMinutes(p.shortfall) : "—"}</td>
                    <td className="text-right tabular-nums">{p.compliance === null ? <span className="text-gray-400">—</span> : `${p.compliance}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty reason="trend endpoint returned no months" />}
          {data.trends?.dataQuality && data.trends.dataQuality !== "ok" && (
            <p className="text-[10px] text-amber-700 mt-2">
              {data.trends.dataQuality === "empty" ? "No session activity in this window." : "Sparse data — interpret swings cautiously."}
            </p>
          )}
        </Section>

        {/* §5 Compensatory risk summary */}
        <Section title="5. Compensatory Risk Summary">
          {data.comp ? (
            data.comp.studentsAffected === 0 ? <Empty reason="no open compensatory obligations" /> : (
              <>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <Kpi label="Minutes Owed" value={fmtMinutes(data.comp.totalMinutesOwed - data.comp.totalMinutesDelivered)}
                       emphasis={(data.comp.totalMinutesOwed - data.comp.totalMinutesDelivered) > 0 ? "warn" : "ok"} />
                  <Kpi label="Dollars at Risk" value={fmtDollars(data.comp.totalDollarsOwed)}
                       emphasis={data.comp.totalDollarsOwed > 0 ? "warn" : "ok"} />
                  <Kpi label="Students Affected" value={data.comp.studentsAffected.toString()} />
                  <Kpi label="Pending / In-Progress"
                       value={`${data.comp.pendingCount} / ${data.comp.inProgressCount}`} />
                </div>
                {data.comp.bySchool.length > 0 && (
                  <>
                    <div className="text-[10px] uppercase text-gray-500 font-semibold mt-3 mb-1">Top schools by exposure</div>
                    <table className="w-full text-xs">
                      <thead><tr className="text-[10px] uppercase text-gray-500 border-b border-gray-200">
                        <th className="text-left font-semibold py-1.5">School</th>
                        <th className="text-right font-semibold">Obligations</th>
                        <th className="text-right font-semibold">Minutes Owed</th>
                        <th className="text-right font-semibold">Dollars</th>
                      </tr></thead>
                      <tbody>
                        {data.comp.bySchool.slice(0, 5).map(s => (
                          <tr key={s.name} className="border-b border-gray-100">
                            <td className="py-1.5">{s.name}</td>
                            <td className="text-right tabular-nums text-gray-600">{s.count}</td>
                            <td className="text-right tabular-nums">{fmtMinutes(s.minutesOwed)}</td>
                            <td className="text-right tabular-nums font-medium">{fmtDollars(s.dollarsOwed)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )
          ) : <Empty reason="compensatory finance unavailable" />}
        </Section>

        {/* §6 Notable incidents (only if any) */}
        {notableIncidents.length > 0 && (
          <Section title="6. Notable Incidents (last 14 days)">
            <table className="w-full text-xs">
              <thead><tr className="text-[10px] uppercase text-gray-500 border-b border-gray-200">
                <th className="text-left font-semibold py-1.5">Date</th>
                <th className="text-left font-semibold">Student</th>
                <th className="text-left font-semibold">Type</th>
                <th className="text-left font-semibold">Flags</th>
                <th className="text-left font-semibold">Status</th>
              </tr></thead>
              <tbody>
                {notableIncidents.map(i => {
                  const flags: string[] = [];
                  if (i.studentInjury) flags.push("Student injury");
                  if (i.staffInjury) flags.push("Staff injury");
                  if (!i.parentNotified) flags.push("Parent not notified");
                  return (
                    <tr key={i.id} className="border-b border-gray-100">
                      <td className="py-1.5 whitespace-nowrap">{fmtDate(i.incidentDate)}</td>
                      <td>{i.studentFirstName} {i.studentLastName}</td>
                      <td className="capitalize">{i.incidentType.replace(/_/g, " ")}</td>
                      <td className="text-red-700">{flags.join(", ") || "—"}</td>
                      <td className="capitalize text-gray-600">{i.status.replace(/_/g, " ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
        )}

        <footer className="mt-6 pt-3 border-t border-gray-200 text-[10px] text-gray-500 leading-relaxed">
          Generated from live data at {new Date().toLocaleString()}. Compliance %, at-risk counts, and shortfall figures
          are recomputed on read; if service requirements were edited after the fact, historical numbers may shift.
          Soft-deleted sessions are excluded.
        </footer>
      </div>
    </div>
  );
}

// ---- Small primitives ------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-gray-900 border-b border-gray-300 pb-1 mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, emphasis }: { label: string; value: string; emphasis?: "ok" | "warn" }) {
  return (
    <div className="kpi border border-gray-300 rounded px-2.5 py-1.5">
      <div className="kpi-label text-[9px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`kpi-value text-base font-semibold tabular-nums mt-0.5 ${emphasis === "warn" ? "text-red-700" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}

function Empty({ reason }: { reason: string }) {
  return <p className="text-[11px] text-gray-400 italic">— {reason}</p>;
}

// ---- Self-contained HTML export -------------------------------------------
// Builds inline-styled HTML (no Tailwind dependency) so it renders in any
// browser, email client, or saved file. Mirrors the on-screen sections.

const esc = (v: unknown): string => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

type ProviderIssue = {
  staffId: number; staffName: string; role: string | null;
  missedCount: number; missedPercent: number; totalSessions: number;
};
type ShortfallRow = { month: string; required: number; delivered: number; shortfall: number; compliance: number | null };

function buildExportHtml(
  data: PacketData,
  providerIssues: ProviderIssue[],
  shortfallTrend: ShortfallRow[],
  notableIncidents: IncidentRow[],
): string {
  const generatedOn = new Date().toLocaleDateString("en-US",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const sec = (title: string, body: string): string =>
    `<section><h2>${esc(title)}</h2>${body}</section>`;

  const empty = (msg: string): string =>
    `<p class="empty">— ${esc(msg)}</p>`;

  const kpiRow = (kpis: Array<{ label: string; value: string; warn?: boolean }>): string =>
    `<div class="kpi-grid">${kpis.map(k =>
      `<div class="kpi"><div class="kpi-label">${esc(k.label)}</div>` +
      `<div class="kpi-value${k.warn ? " warn" : ""}">${esc(k.value)}</div></div>`).join("")}</div>`;

  // §1 Snapshot
  const s1 = data.executive ? (() => {
    const e = data.executive!;
    const buckets = (["onTrack", "slightlyBehind", "atRisk", "outOfCompliance"] as const).map(k => {
      const n = e.riskCounts[k];
      const pct = e.totalStudents > 0 ? Math.round((n / e.totalStudents) * 100) : 0;
      const label = k === "onTrack" ? "On track" : k === "slightlyBehind" ? "Slightly behind"
        : k === "atRisk" ? "At risk" : "Out of compliance";
      return `<tr><td>${label}</td><td class="r">${n}</td><td class="r muted">${pct}%</td></tr>`;
    }).join("");
    return kpiRow([
      { label: "Compliance Score", value: `${e.complianceScore}%`, warn: e.complianceScore < 80 },
      { label: "Active Students", value: e.totalStudents.toLocaleString() },
      { label: "Critical Alerts", value: String(e.criticalAlerts), warn: e.criticalAlerts > 0 },
      { label: "Open Alerts", value: String(e.openAlerts) },
    ]) + `<table><thead><tr><th>Bucket</th><th class="r">Students</th><th class="r">% of Active</th></tr></thead><tbody>${buckets}</tbody></table>` +
    `<p class="note">IEP / triennial deadlines: <strong>${e.deadlineCounts.within30}</strong> within 30 days · ` +
    `<strong>${e.deadlineCounts.within60}</strong> within 60 days · ` +
    `<strong>${e.deadlineCounts.within90}</strong> within 90 days.</p>`;
  })() : empty("executive dashboard unavailable");

  // §2 High-risk students
  const s2 = data.executive && data.executive.topAtRiskStudents.length > 0 ? (() => {
    const rows = data.executive!.topAtRiskStudents.map(s => {
      const badgeClass = s.riskStatus === "out_of_compliance" ? "badge badge-red" : "badge badge-amber";
      return `<tr><td><strong>${esc(s.studentName)}</strong></td>` +
        `<td><span class="${badgeClass}">${esc(riskLabel(s.riskStatus))}</span></td>` +
        `<td class="r"><strong>${s.percentComplete}%</strong></td></tr>`;
    }).join("");
    return `<table><thead><tr><th>Student</th><th>Status</th><th class="r">% Delivered</th></tr></thead><tbody>${rows}</tbody></table>`;
  })() : empty("no students currently flagged");

  // §3 Provider issues
  const s3Header = data.pilot ? (() => {
    const p = data.pilot!;
    const sl = p.sessionLogging.percent < (p.sessionLogging.target ?? 80);
    const it = p.incidentTimeliness.percent < 100;
    return `<p class="note">Logging timeliness: ` +
      `<strong${sl ? ' style="color:#b91c1c"' : ""}>${p.sessionLogging.percent}%</strong> ` +
      `(${p.sessionLogging.onTime} / ${p.sessionLogging.total} on time, target ${p.sessionLogging.target ?? 80}%). ` +
      `Incident timeliness: <strong${it ? ' style="color:#b45309"' : ""}>${p.incidentTimeliness.percent}%</strong> ` +
      `(${p.incidentTimeliness.onTime} / ${p.incidentTimeliness.total} within 24h).</p>`;
  })() : "";
  const s3 = s3Header + (providerIssues.length > 0 ? (() => {
    const rows = providerIssues.map(p =>
      `<tr><td><strong>${esc(p.staffName)}</strong></td><td class="muted">${esc(p.role ?? "—")}</td>` +
      `<td class="r">${p.missedCount}</td><td class="r muted">${p.totalSessions}</td>` +
      `<td class="r" style="color:#b91c1c;font-weight:600">${p.missedPercent}%</td></tr>`).join("");
    return `<table><thead><tr><th>Provider</th><th>Role</th><th class="r">Missed</th><th class="r">Total</th><th class="r">Miss Rate</th></tr></thead><tbody>${rows}</tbody></table>`;
  })() : empty("no providers exceed the 15% missed-session threshold (min 5 sessions)"));

  // §4 Shortfall trend
  const s4 = shortfallTrend.length > 0 ? (() => {
    const rows = shortfallTrend.map(p =>
      `<tr><td>${esc(p.month)}</td>` +
      `<td class="r muted">${fmtMinutes(p.required)}</td>` +
      `<td class="r">${fmtMinutes(p.delivered)}</td>` +
      `<td class="r" style="color:#b91c1c;font-weight:500">${p.shortfall > 0 ? fmtMinutes(p.shortfall) : "—"}</td>` +
      `<td class="r">${p.compliance === null ? '<span class="muted">—</span>' : `${p.compliance}%`}</td></tr>`).join("");
    const dq = data.trends?.dataQuality;
    const note = dq && dq !== "ok" ? `<p class="note" style="color:#b45309">${dq === "empty" ? "No session activity in this window." : "Sparse data — interpret swings cautiously."}</p>` : "";
    return `<table><thead><tr><th>Month</th><th class="r">Required (min)</th><th class="r">Delivered (min)</th><th class="r">Shortfall</th><th class="r">Compliance</th></tr></thead><tbody>${rows}</tbody></table>${note}`;
  })() : empty("trend endpoint returned no months");

  // §5 Comp risk
  const s5 = data.comp ? (data.comp.studentsAffected === 0 ? empty("no open compensatory obligations") : (() => {
    const c = data.comp!;
    const minutesOutstanding = c.totalMinutesOwed - c.totalMinutesDelivered;
    const kpis = kpiRow([
      { label: "Minutes Owed", value: fmtMinutes(minutesOutstanding), warn: minutesOutstanding > 0 },
      { label: "Dollars at Risk", value: fmtDollars(c.totalDollarsOwed), warn: c.totalDollarsOwed > 0 },
      { label: "Students Affected", value: String(c.studentsAffected) },
      { label: "Pending / In-Progress", value: `${c.pendingCount} / ${c.inProgressCount}` },
    ]);
    const schoolsTbl = c.bySchool.length > 0 ? (() => {
      const rows = c.bySchool.slice(0, 5).map(s =>
        `<tr><td>${esc(s.name)}</td><td class="r muted">${s.count}</td>` +
        `<td class="r">${fmtMinutes(s.minutesOwed)}</td>` +
        `<td class="r"><strong>${fmtDollars(s.dollarsOwed)}</strong></td></tr>`).join("");
      return `<div class="subhead">Top schools by exposure</div>` +
        `<table><thead><tr><th>School</th><th class="r">Obligations</th><th class="r">Minutes Owed</th><th class="r">Dollars</th></tr></thead><tbody>${rows}</tbody></table>`;
    })() : "";
    return kpis + schoolsTbl;
  })()) : empty("compensatory finance unavailable");

  // §6 Incidents (omit if none)
  const s6 = notableIncidents.length > 0 ? (() => {
    const rows = notableIncidents.map(i => {
      const flags: string[] = [];
      if (i.studentInjury) flags.push("Student injury");
      if (i.staffInjury) flags.push("Staff injury");
      if (!i.parentNotified) flags.push("Parent not notified");
      return `<tr><td>${esc(fmtDate(i.incidentDate))}</td>` +
        `<td>${esc(`${i.studentFirstName ?? ""} ${i.studentLastName ?? ""}`.trim())}</td>` +
        `<td style="text-transform:capitalize">${esc(i.incidentType.replace(/_/g, " "))}</td>` +
        `<td style="color:#b91c1c">${esc(flags.join(", ") || "—")}</td>` +
        `<td class="muted" style="text-transform:capitalize">${esc(i.status.replace(/_/g, " "))}</td></tr>`;
    }).join("");
    return `<table><thead><tr><th>Date</th><th>Student</th><th>Type</th><th>Flags</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  })() : "";

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Leadership Meeting Packet — ${esc(generatedOn)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #111; padding: 40px; max-width: 900px; margin: 0 auto; line-height: 1.4; }
  h1 { font-size: 18pt; margin: 0 0 4px; font-weight: 600; letter-spacing: -0.01em; }
  h2 { font-size: 12pt; margin: 22px 0 8px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; font-weight: 600; }
  header { border-bottom: 1px solid #d1d5db; padding-bottom: 10px; margin-bottom: 18px; }
  header p { margin: 4px 0 0; font-size: 10pt; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 4px; }
  th, td { padding: 5px 8px; text-align: left; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { background: #f9fafb; font-weight: 600; font-size: 8.5pt; text-transform: uppercase; color: #6b7280; letter-spacing: 0.04em; border-bottom: 1px solid #d1d5db; }
  td.r, th.r { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #6b7280; }
  .note { font-size: 10pt; color: #4b5563; margin: 6px 0 0; }
  .empty { font-size: 10pt; color: #9ca3af; font-style: italic; }
  .subhead { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; font-weight: 600; margin: 14px 0 4px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0 10px; }
  .kpi { border: 1px solid #d1d5db; padding: 8px 10px; border-radius: 4px; }
  .kpi-label { font-size: 8.5pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
  .kpi-value { font-size: 14pt; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .kpi-value.warn { color: #b91c1c; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9pt; font-weight: 500; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 9pt; color: #6b7280; line-height: 1.5; }
  @page { margin: 0.75in; size: letter; }
  @media print { body { padding: 0; } }
</style></head><body>
<header>
  <h1>Leadership Meeting Packet</h1>
  <p>Generated ${esc(generatedOn)} · District-wide unless otherwise scoped</p>
</header>
${sec("1. District Compliance Snapshot", s1)}
${sec("2. High-Risk Students", s2)}
${sec("3. Provider Issues", s3)}
${sec("4. Shortfall Trends (last 6 months)", s4)}
${sec("5. Compensatory Risk Summary", s5)}
${notableIncidents.length > 0 ? sec("6. Notable Incidents (last 14 days)", s6) : ""}
<footer>
  Generated from live data at ${esc(new Date().toLocaleString())}.
  Compliance %, at-risk counts, and shortfall figures are recomputed on read; if service requirements were edited
  after the fact, historical numbers may shift. Soft-deleted sessions are excluded.
</footer>
</body></html>`;
}
