import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DollarSign, Users, AlertTriangle, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, Info, ArrowRight, ShieldAlert, FileText,
  type LucideIcon,
} from "lucide-react";

// Types mirror /api/compensatory-finance/overview response shape.
// See artifacts/api-server/src/routes/compensatoryFinance/overview.ts
interface CompFinanceOverview {
  totalMinutesOwed: number;
  totalMinutesDelivered: number;
  totalDollarsOwed: number;
  totalDollarsDelivered: number;
  studentsAffected: number;
  obligationCount: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  byServiceType: { serviceTypeId: number; name: string; minutesOwed: number; dollarsOwed: number; count: number }[];
  bySchool: { schoolId: number; name: string; minutesOwed: number; dollarsOwed: number; count: number }[];
  byProvider: { providerId: number; name: string; minutesOwed: number; dollarsOwed: number; count: number }[];
}

interface BurndownPoint {
  month: string;
  accruedMinutes: number;
  deliveredMinutes: number;
  accruedDollars: number;
  deliveredDollars: number;
  cumulativeOwed: number;
  cumulativeOwedDollars: number;
}

interface AlertRow {
  id: number;
  type: string;
  severity: string;
  studentId: number | null;
  resolved: boolean;
  snoozedUntil: string | null;
  createdAt: string;
}

function fmtDollars(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function fmtSignedDollars(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${fmtDollars(Math.abs(n))}`;
}

export default function CostRiskPanel() {
  const [showFormulas, setShowFormulas] = useState(false);

  const { data: overview, isLoading: overviewLoading, error: overviewError } = useQuery<CompFinanceOverview>({
    queryKey: ["compensatory-finance-overview"],
    queryFn: ({ signal }) => authFetch("/api/compensatory-finance/overview", { signal }).then(r => {
      if (!r.ok) throw new Error("Failed to load compensatory finance overview");
      return r.json();
    }),
  });

  const { data: burndown } = useQuery<BurndownPoint[]>({
    queryKey: ["compensatory-finance-burndown", 4],
    queryFn: ({ signal }) => authFetch("/api/compensatory-finance/burndown?months=4", { signal }).then(r => {
      if (!r.ok) throw new Error("Failed to load burndown");
      return r.json();
    }),
  });

  // Open cost-avoidance risk alerts (not resolved, not snoozed). Real count.
  const { data: openRiskAlerts } = useQuery<AlertRow[]>({
    queryKey: ["alerts-cost-avoidance-risk-open"],
    queryFn: ({ signal }) =>
      authFetch("/api/alerts?type=cost_avoidance_risk&resolved=false&snoozed=false", { signal })
        .then(r => (r.ok ? r.json() : [])),
  });

  // ---- Derived numbers (all explained in the formulas footer below) ----

  const exposureNet = useMemo(() => {
    if (!overview) return 0;
    return Math.max(0, overview.totalDollarsOwed - overview.totalDollarsDelivered);
  }, [overview]);

  const minutesUnresolved = useMemo(() => {
    if (!overview) return 0;
    return Math.max(0, overview.totalMinutesOwed - overview.totalMinutesDelivered);
  }, [overview]);

  // Trend = change in cumulative-owed-dollars between the most recent completed
  // month and the prior month. Positive = exposure growing, negative = burning down.
  const trend = useMemo(() => {
    if (!burndown || burndown.length < 2) return null;
    const last = burndown[burndown.length - 1];
    const prev = burndown[burndown.length - 2];
    const delta = last.cumulativeOwedDollars - prev.cumulativeOwedDollars;
    return {
      delta,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      lastMonth: last.month,
      prevMonth: prev.month,
      lastValue: last.cumulativeOwedDollars,
    } as const;
  }, [burndown]);

  // Distinct students with open cost-avoidance alerts. These are students at
  // risk of accruing compensatory exposure but who haven't yet — i.e. the gap
  // is still curable inside its compliance window.
  const studentsAtFutureRisk = useMemo(() => {
    if (!openRiskAlerts) return 0;
    const ids = new Set<number>();
    for (const a of openRiskAlerts) {
      if (a.studentId) ids.add(a.studentId);
    }
    return ids.size;
  }, [openRiskAlerts]);

  // Combined "students at risk" = students with realized exposure (open obligations)
  // OR students with open cost-avoidance alerts. Counted together but not double-
  // counted because the alert set may overlap with affected students.
  // We can only union by IDs we have; without per-student detail in overview, we
  // present them side-by-side rather than summing to avoid an inflated combined.
  const realizedAffected = overview?.studentsAffected ?? 0;

  const isError = !!overviewError;
  const loading = overviewLoading || !overview;

  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-[15px] font-bold text-gray-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              Compliance Cost &amp; Risk Exposure
            </CardTitle>
            <p className="text-[11px] text-gray-400 mt-1">
              Translates open compliance gaps into estimated dollar exposure.
              All values use real district rate config when present, with the
              fallback rate noted below.
            </p>
          </div>
          <Link href="/compensatory-finance">
            <Button size="sm" variant="outline" className="text-[11px] h-7 gap-1">
              Full breakdown <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-0">
        {isError ? (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700">
            Couldn&apos;t load compensatory finance data. Check that the
            <code className="mx-1 px-1 bg-white rounded">/api/compensatory-finance/overview</code>
            endpoint is reachable for this district.
          </div>
        ) : (
          <>
            {/* Top KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi
                icon={DollarSign}
                label="Estimated Exposure"
                value={loading ? "…" : fmtDollars(exposureNet)}
                sub={loading ? "" : `${fmtNumber(overview!.pendingCount + overview!.inProgressCount)} open obligations`}
                tone={exposureNet > 0 ? "red" : "emerald"}
              />
              <Kpi
                icon={Users}
                label="Students With Exposure"
                value={loading ? "…" : fmtNumber(realizedAffected)}
                sub={
                  loading
                    ? ""
                    : studentsAtFutureRisk > 0
                      ? `+${fmtNumber(studentsAtFutureRisk)} more flagged at risk`
                      : "no additional risk flagged"
                }
                tone={realizedAffected > 0 ? "amber" : "emerald"}
              />
              <Kpi
                icon={AlertTriangle}
                label="Unresolved Minutes"
                value={loading ? "…" : fmtNumber(minutesUnresolved)}
                sub="owed but not delivered"
                tone={minutesUnresolved > 0 ? "amber" : "emerald"}
              />
              <Kpi
                icon={trend?.direction === "up" ? TrendingUp : trend?.direction === "down" ? TrendingDown : Minus}
                label="30-Day Trend"
                value={
                  loading || !trend
                    ? "…"
                    : trend.direction === "flat"
                      ? "Flat"
                      : fmtSignedDollars(trend.delta)
                }
                sub={
                  trend
                    ? `${trend.prevMonth} → ${trend.lastMonth}`
                    : "needs ≥2 months of data"
                }
                tone={
                  !trend ? "gray"
                    : trend.direction === "up" ? "red"
                    : trend.direction === "down" ? "emerald"
                    : "gray"
                }
              />
            </div>

            {/* Avoidable / open-risk row */}
            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-gray-800">
                      Avoidable cost — open risks not yet realized
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {openRiskAlerts == null
                        ? <Skeleton className="h-3 w-32 inline-block" />
                        : openRiskAlerts.length === 0
                          ? "No open cost-avoidance alerts. Every current shortfall has either been recovered or escalated to a compensatory obligation."
                          : <><span className="font-bold text-gray-800">{fmtNumber(openRiskAlerts.length)}</span> open cost-avoidance alert{openRiskAlerts.length === 1 ? "" : "s"} flagging service shortfalls likely to accrue compensatory minutes if not corrected. These do not yet appear in the exposure number above.</>
                      }
                    </p>
                    <Link href="/alerts?type=cost_avoidance_risk">
                      <Button variant="ghost" size="sm" className="mt-1 h-6 text-[11px] text-amber-700 px-1">
                        Open the alert queue <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-gray-800">Status mix of open obligations</p>
                    {loading ? (
                      <Skeleton className="h-3 w-40 mt-1" />
                    ) : (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        <span className="font-medium text-gray-700">{fmtNumber(overview!.pendingCount)}</span> pending ·{" "}
                        <span className="font-medium text-gray-700">{fmtNumber(overview!.inProgressCount)}</span> in progress ·{" "}
                        <span className="font-medium text-gray-700">{fmtNumber(overview!.completedCount)}</span> completed
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1 italic">
                      Pending obligations are the most actionable — they can still
                      be scheduled inside their original recovery window.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Top contributors */}
            {!loading && overview && overview.byServiceType.length > 0 && (
              <div className="grid md:grid-cols-2 gap-3">
                <Contributors
                  title="Top Service Types by Exposure"
                  rows={overview.byServiceType.slice(0, 5).map(r => ({
                    label: r.name,
                    dollars: r.dollarsOwed,
                    count: r.count,
                  }))}
                  emptyMsg="No exposure by service type."
                />
                <Contributors
                  title="Top Schools by Exposure"
                  rows={overview.bySchool.slice(0, 5).map(r => ({
                    label: r.name,
                    dollars: r.dollarsOwed,
                    count: r.count,
                  }))}
                  emptyMsg="No exposure by school."
                />
              </div>
            )}

            {/* Formulas / assumptions disclosure */}
            <div className="border-t border-gray-100 pt-3">
              <button
                onClick={() => setShowFormulas(s => !s)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-700"
                type="button"
              >
                <Info className="w-3 h-3" />
                Formulas, assumptions &amp; what still needs validation
                {showFormulas ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showFormulas && (
                <div className="mt-3 space-y-3 text-[11px] text-gray-600 leading-relaxed">
                  <Section title="Formulas used (all from existing backend code, not invented in this panel)">
                    <ul className="list-disc pl-4 space-y-1">
                      <li>
                        <b>Estimated exposure</b> = sum of <code>(minutesOwed − minutesDelivered) ÷ 60 × hourlyRate</code>{" "}
                        across all compensatory obligations for the district. Source:
                        <code className="mx-1">minutesToDollars()</code> in
                        <code className="mx-1">api-server/src/routes/compensatoryFinance/shared.ts</code>.
                      </li>
                      <li>
                        <b>Hourly rate</b> resolved per service type via
                        <code className="mx-1">resolveRate()</code> cascade:
                        <ol className="list-decimal pl-5 mt-0.5">
                          <li>District-specific rate from <code>service_rate_configs</code> (in-house vs contracted)</li>
                          <li>Active <code>agency_contracts.hourly_rate</code> for the service type</li>
                          <li><code>service_types.default_billing_rate</code></li>
                          <li>Fallback constant <code>DEFAULT_HOURLY_RATE = $75/hr</code></li>
                        </ol>
                      </li>
                      <li>
                        <b>Students with exposure</b> = distinct <code>student_id</code> on
                        compensatory obligations of any status. <b>+N more flagged at risk</b> = distinct
                        student IDs on open <code>cost_avoidance_risk</code> alerts (no double-count is enforced
                        because per-student detail isn&apos;t exposed by overview — see &quot;needs validation&quot;).
                      </li>
                      <li>
                        <b>Unresolved minutes</b> = sum of <code>(minutesOwed − minutesDelivered)</code> across
                        all obligations regardless of status.
                      </li>
                      <li>
                        <b>30-day trend</b> = <code>cumulativeOwedDollars(latest month) − cumulativeOwedDollars(prior month)</code>{" "}
                        from <code>/api/compensatory-finance/burndown</code>. Positive means exposure grew, negative means
                        delivery exceeded new accruals.
                      </li>
                      <li>
                        <b>Avoidable cost — open risks</b> = count of open
                        <code className="mx-1">cost_avoidance_risk</code> alerts (not resolved, not snoozed).
                        We deliberately do <b>not</b> show a dollar value here (see &quot;needs validation&quot;).
                      </li>
                    </ul>
                  </Section>

                  <Section title="Where the assumptions live (configurable)">
                    <ul className="list-disc pl-4 space-y-1">
                      <li>
                        Per-service-type rates: <b>Settings → Compensatory Finance → Rates</b> (or
                        directly via <code>POST /api/compensatory-finance/rates</code>). Stored in
                        <code className="mx-1">service_rate_configs</code>.
                      </li>
                      <li>
                        Agency contract rates: <b>Agencies → contract detail</b>. Stored in
                        <code className="mx-1">agency_contracts.hourly_rate</code>.
                      </li>
                      <li>
                        Service-type default rate: <b>Settings → Service Types</b>. Stored in
                        <code className="mx-1">service_types.default_billing_rate</code>.
                      </li>
                      <li>
                        Fallback hourly rate (<code>$75</code>) is currently a code constant in
                        <code className="mx-1">compensatoryFinance/shared.ts</code> and
                        <code className="mx-1">costAvoidanceAlerts.ts</code>. Not configurable from the UI;
                        change requires a code edit.
                      </li>
                      <li>
                        Cost-avoidance alert thresholds (e.g. <code>weekly &lt; 50%</code>,
                        <code className="mx-1">monthly &lt; 85%</code> of expected pace) are constants in
                        <code className="mx-1">costAvoidanceAlerts.ts</code>. Not configurable from the UI.
                      </li>
                    </ul>
                  </Section>

                  <Section title="What still needs validation">
                    <ul className="list-disc pl-4 space-y-1">
                      <li>
                        <b>No exposure $ for the &quot;avoidable cost&quot; metric.</b> Cost-avoidance
                        alerts compute an <code>estimatedExposure</code> at creation time but only embed it in the
                        alert <code>message</code> string. The <code>alerts</code> table has no dedicated
                        column for it. Showing a dollar total here would require either parsing the message text
                        (fragile) or a schema migration to add a structured field. We chose not to invent a number.
                      </li>
                      <li>
                        <b>&quot;Students at risk&quot; is shown as two separate counts</b>, not a deduplicated
                        union. The overview endpoint returns aggregate counts only; computing a distinct
                        union with the alert set requires per-student detail (planned).
                      </li>
                      <li>
                        <b>Trend uses calendar months, not rolling 30 days.</b> Comparing &quot;last month&quot; vs
                        &quot;prior month&quot; is approximate; on the 1st of a month the &quot;trend&quot; reflects only
                        a single day of new data.
                      </li>
                      <li>
                        <b>Rate cascade falls back silently</b> when a service type has no configured rate.
                        The total exposure number is only as accurate as the rate config — if your district
                        hasn&apos;t set rates, every line is priced at $75/hr regardless of provider type.
                        Use <code>GET /api/compensatory-finance/rates</code> to audit.
                      </li>
                      <li>
                        <b>Compensatory delivery is identified by <code>session_logs.is_compensatory = true</code>.</b>{" "}
                        If providers forget to flag a make-up session, it won&apos;t reduce the exposure number
                        even though the minutes were delivered.
                      </li>
                    </ul>
                  </Section>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// --- Subcomponents ---

function Kpi({ icon: Icon, label, value, sub, tone }: {
  icon: LucideIcon; label: string; value: string; sub: string;
  tone: "red" | "amber" | "emerald" | "gray";
}) {
  const cfg: Record<string, { bg: string; text: string; border: string }> = {
    red:     { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200" },
    amber:   { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    gray:    { bg: "bg-gray-50",    text: "text-gray-600",    border: "border-gray-200" },
  };
  const t = cfg[tone];
  return (
    <div className={`rounded-lg border ${t.border} ${t.bg} px-3 py-2.5`}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <Icon className={`w-3.5 h-3.5 ${t.text}`} />
        {label}
      </div>
      <div className={`mt-1 text-[20px] font-bold ${t.text} leading-tight`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}

function Contributors({ title, rows, emptyMsg }: {
  title: string;
  rows: { label: string; dollars: number; count: number }[];
  emptyMsg: string;
}) {
  return (
    <Card className="bg-gray-50/40 border-gray-100 shadow-none">
      <CardHeader className="pb-1.5">
        <CardTitle className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {rows.length === 0 ? (
          <p className="text-[12px] text-gray-400 py-2">{emptyMsg}</p>
        ) : (
          rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-[12px] py-1 border-b border-gray-100 last:border-0">
              <span className="text-gray-700 truncate min-w-0 mr-2">{r.label}</span>
              <span className="flex-shrink-0 text-gray-500 text-[11px]">
                <span className="font-semibold text-gray-700">{fmtDollars(r.dollars)}</span>
                <span className="ml-2 text-gray-400">({r.count})</span>
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider mb-1">{title}</p>
      <div>{children}</div>
    </div>
  );
}
