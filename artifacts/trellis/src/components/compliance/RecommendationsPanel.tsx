/**
 * RecommendationsPanel — deterministic, rules-based action items for the
 * compliance dashboard. NOT AI. Every rule is a pure function of real data
 * pulled from existing endpoints. See RECOMMENDATION_RULES below for the
 * complete rule set, trigger conditions, severity, and links.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "wouter";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2,
  ClipboardList, DollarSign, FileWarning, Lightbulb, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authFetch } from "@/lib/auth-fetch";

type Severity = "critical" | "high" | "medium";

interface Recommendation {
  ruleId: string;
  severity: Severity;
  icon: typeof AlertTriangle;
  title: string;
  detail?: string;
  actionLabel: string;
  actionHref: string;
}

interface ProviderSummary {
  providerName: string;
  studentsServed: number;
  totalDelivered: number;
  totalRequired: number;
  totalShortfall: number;
  complianceRate: number;
}

interface NeedsAttentionRow {
  studentId: number;
  studentName: string;
  service: string;
  shortfallMinutes: number;
  percentComplete: number;
  riskStatus: string;
  estimatedExposure: number;
  providerName: string;
}

interface RiskReportSummary {
  totalStudents: number;
  studentsOutOfCompliance: number;
  studentsAtRisk: number;
  totalShortfallMinutes: number;
  totalCurrentExposure: number;
  existingCompensatoryExposure: number | null;
  existingCompensatoryUnpricedMinutes?: number;
  combinedExposure: number;
}

interface RiskReport {
  summary: RiskReportSummary;
  needsAttention: NeedsAttentionRow[];
  providerSummary: ProviderSummary[];
}

interface ComplianceByServiceRow {
  serviceTypeName: string;
  onTrack: number;
  slightlyBehind: number;
  atRisk: number;
  outOfCompliance: number;
}

interface WeeklySummary {
  meta: { weekStart: string };
  providersWithMissedThisWeek: {
    providerName: string;
    role: string;
    completedSessions: number;
    missedSessions: number;
  }[];
}

interface DashboardSummary {
  uncoveredBlocksToday?: number;
}

interface Props {
  riskReport: RiskReport | undefined;
  riskReportError?: boolean;
  progressList: any[];
  complianceByService: ComplianceByServiceRow[];
  schoolId?: number | string;
}

function fmtDollars(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

const SEVERITY_STYLE: Record<Severity, { dot: string; pill: string; ring: string; chip: string }> = {
  critical: { dot: "bg-red-500",   pill: "bg-red-50 text-red-700",   ring: "ring-red-100",   chip: "Critical" },
  high:     { dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700", ring: "ring-amber-100", chip: "High" },
  medium:   { dot: "bg-blue-500",  pill: "bg-blue-50 text-blue-700",  ring: "ring-blue-100",  chip: "Medium" },
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2 };

export default function RecommendationsPanel({
  riskReport, riskReportError, progressList, complianceByService, schoolId,
}: Props) {
  const params = schoolId ? `?schoolId=${schoolId}` : "";

  const { data: weekly, isError: weeklyError, isLoading: weeklyLoading } = useQuery<WeeklySummary>({
    queryKey: ["recommendations/weekly-summary", schoolId ?? null],
    queryFn: async () => {
      const r = await authFetch(`/api/reports/weekly-compliance-summary${params}`);
      if (!r.ok) throw new Error("weekly-compliance-summary failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: dashSummary, isError: dashError } = useQuery<DashboardSummary>({
    queryKey: ["recommendations/dashboard-summary", schoolId ?? null],
    queryFn: async () => {
      const r = await authFetch(`/api/dashboard/summary${params}`);
      if (!r.ok) throw new Error("dashboard/summary failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  // Track which data sources are unavailable so we never render a false
  // "all clear" when rules simply couldn't be evaluated.
  const dataIssues: string[] = [];
  if (riskReportError || (!riskReport && !weeklyLoading)) {
    dataIssues.push("Compliance risk report is unavailable — student/provider rules cannot be evaluated.");
  }
  if (weeklyError) {
    dataIssues.push("This week's session data couldn't be loaded — missed-session rules cannot be evaluated.");
  }
  if (dashError) {
    dataIssues.push("Today's schedule summary couldn't be loaded — coverage-gap rules cannot be evaluated.");
  }

  const recommendations = useMemo<Recommendation[]>(() => {
    return buildRecommendations({
      riskReport,
      progressList,
      complianceByService,
      weekly,
      dashSummary,
    });
  }, [riskReport, progressList, complianceByService, weekly, dashSummary]);

  const sorted = useMemo(
    () => [...recommendations].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]),
    [recommendations],
  );

  // Don't render anything if we have no risk report AND we're still loading the
  // weekly summary — the parent already shows a loading skeleton.
  if (!riskReport && weeklyLoading) return null;

  return (
    <Card className="border-emerald-200/60" data-testid="card-recommendations">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-emerald-600" />
            Recommended actions
            {sorted.length > 0 && (
              <span className="text-xs font-medium text-gray-400 tabular-nums">({sorted.length})</span>
            )}
          </CardTitle>
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Rules-based</span>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {dataIssues.length > 0 && (
          <div className="mx-4 mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2" data-testid="recommendations-data-warning">
            <div className="flex items-start gap-2">
              <FileWarning className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-medium">Recommendations may be incomplete</p>
                {dataIssues.map((msg, i) => <p key={i}>{msg}</p>)}
              </div>
            </div>
          </div>
        )}
        {sorted.length === 0 && dataIssues.length > 0 ? (
          <div className="px-4 py-6 text-center" data-testid="recommendations-incomplete">
            <FileWarning className="w-6 h-6 text-amber-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">Recommendations couldn't be evaluated.</p>
            <p className="text-xs text-gray-400 mt-1">
              One or more required data sources failed to load. Refresh the page or check the warnings above.
            </p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-4 py-6 text-center" data-testid="recommendations-empty">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">No action items right now.</p>
            <p className="text-xs text-gray-400 mt-1">
              Service delivery is on track based on current data. New recommendations will appear if compliance slips.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {sorted.map((rec) => {
              const style = SEVERITY_STYLE[rec.severity];
              const Icon = rec.icon;
              return (
                <li key={rec.ruleId} className="px-4 py-3 hover:bg-gray-50/60" data-testid={`recommendation-${rec.ruleId}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} aria-label={style.chip} />
                    <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-medium text-gray-900">{rec.title}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${style.pill}`}>
                          {style.chip}
                        </span>
                      </div>
                      {rec.detail && (
                        <p className="text-[12px] text-gray-500 mt-0.5">{rec.detail}</p>
                      )}
                    </div>
                    <Link href={rec.actionHref} className="flex-shrink-0">
                      <span className="text-[12px] text-emerald-700 hover:text-emerald-800 font-medium inline-flex items-center gap-0.5 whitespace-nowrap" data-testid={`recommendation-action-${rec.ruleId}`}>
                        {rec.actionLabel} <ArrowRight className="w-3 h-3" />
                      </span>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Recommendation rules (deterministic)
 * ------------------------------------------------------------------------ */

interface RuleInputs {
  riskReport: RiskReport | undefined;
  progressList: any[];
  complianceByService: ComplianceByServiceRow[];
  weekly: WeeklySummary | undefined;
  dashSummary: DashboardSummary | undefined;
}

export function buildRecommendations(inputs: RuleInputs): Recommendation[] {
  const out: Recommendation[] = [];
  const { riskReport, complianceByService, weekly, dashSummary } = inputs;
  const s = riskReport?.summary;

  // Rule 1: Out-of-compliance students need make-up sessions
  if (s && s.studentsOutOfCompliance > 0) {
    const n = s.studentsOutOfCompliance;
    out.push({
      ruleId: "out-of-compliance-makeup",
      severity: "critical",
      icon: AlertTriangle,
      title: `Schedule make-up sessions for ${n} student${n === 1 ? "" : "s"} who ${n === 1 ? "is" : "are"} out of compliance`,
      detail: s.totalCurrentExposure > 0
        ? `Estimated current exposure: ${fmtDollars(s.totalCurrentExposure)}. Add make-up sessions or document compensatory obligations.`
        : "Add make-up sessions or document compensatory obligations.",
      actionLabel: "Open risk report",
      actionHref: "/compliance-risk-report",
    });
  }

  // Rule 2: At-risk students need increased coverage this week
  if (s && s.studentsAtRisk > 0) {
    const n = s.studentsAtRisk;
    out.push({
      ruleId: "at-risk-increase-coverage",
      severity: "high",
      icon: Users,
      title: `${n} student${n === 1 ? "" : "s"} at risk — increase service coverage this week to prevent shortfall`,
      actionLabel: "Open risk report",
      actionHref: "/compliance-risk-report",
    });
  }

  // Rule 3: Providers below 75% delivery rate
  if (riskReport?.providerSummary?.length) {
    const underperforming = riskReport.providerSummary.filter(
      p => p.totalRequired > 0 && p.complianceRate < 75,
    );
    if (underperforming.length > 0) {
      const worst = [...underperforming].sort((a, b) => a.complianceRate - b.complianceRate)[0];
      const n = underperforming.length;
      out.push({
        ruleId: "providers-under-75",
        severity: "high",
        icon: Users,
        title: `${n} provider${n === 1 ? "" : "s"} below 75% delivery — review caseload and scheduling`,
        detail: `Lowest: ${worst.providerName} at ${worst.complianceRate.toFixed(0)}%`,
        actionLabel: "View providers",
        actionHref: "/staff",
      });
    }
  }

  // Rule 4: Missed sessions logged this week
  if (weekly?.providersWithMissedThisWeek?.length) {
    const providers = weekly.providersWithMissedThisWeek;
    const totalMissed = providers.reduce((sum, p) => sum + p.missedSessions, 0);
    if (totalMissed > 0) {
      out.push({
        ruleId: "missed-sessions-this-week",
        severity: totalMissed >= 5 ? "high" : "medium",
        icon: CalendarClock,
        title: `${providers.length} provider${providers.length === 1 ? " has" : "s have"} incomplete logs — ${totalMissed} missed session${totalMissed === 1 ? "" : "s"} this week`,
        detail: "Follow up on cancellations, document make-up plans, or reschedule.",
        actionLabel: "Open weekly summary",
        actionHref: "/weekly-compliance-summary",
      });
    }
  }

  // Rule 5: Individual high-exposure cases
  if (riskReport?.needsAttention?.length) {
    const HIGH_EXPOSURE = 1000;
    const CRITICAL_EXPOSURE = 5000;
    const highCases = riskReport.needsAttention.filter(r => r.estimatedExposure >= HIGH_EXPOSURE);
    if (highCases.length > 0) {
      const totalExposure = highCases.reduce((sum, r) => sum + r.estimatedExposure, 0);
      const anyCritical = highCases.some(r => r.estimatedExposure >= CRITICAL_EXPOSURE);
      out.push({
        ruleId: "high-exposure-cases",
        severity: anyCritical ? "critical" : "high",
        icon: DollarSign,
        title: `Review ${highCases.length} high-exposure case${highCases.length === 1 ? "" : "s"} totaling ${fmtDollars(totalExposure)}`,
        detail: anyCritical
          ? "At least one case exceeds $5,000 in estimated compensatory cost."
          : "Each case exceeds $1,000 in estimated compensatory cost.",
        actionLabel: "Review cases",
        actionHref: "/compliance-risk-report",
      });
    }
  }

  // Rule 6: Outstanding compensatory obligations from prior periods.
  // Triggers on either a real dollar exposure OR unpriced minutes — we
  // surface the make-up obligation regardless of whether rates are configured,
  // and switch the title between dollars and a minutes/rate-not-configured
  // message so we never fabricate a $0 figure.
  if (
    s &&
    ((s.existingCompensatoryExposure != null && s.existingCompensatoryExposure > 0) ||
     (s.existingCompensatoryUnpricedMinutes != null && s.existingCompensatoryUnpricedMinutes > 0))
  ) {
    const dollars = s.existingCompensatoryExposure;
    const unpricedMin = s.existingCompensatoryUnpricedMinutes ?? 0;
    const title = dollars != null && dollars > 0
      ? `Outstanding compensatory obligations: ${fmtDollars(dollars)} — schedule make-up services`
      : `Outstanding compensatory obligations: ${unpricedMin.toLocaleString()} min owed (rate not configured) — schedule make-up services`;
    out.push({
      ruleId: "outstanding-compensatory",
      severity: "high",
      icon: ClipboardList,
      title,
      detail: "Prior compensatory minutes have not been delivered. Build a make-up plan.",
      actionLabel: "Open compensatory services",
      actionHref: "/compensatory-services",
    });
  }

  // Rule 7: Service types where the majority of students are behind
  if (complianceByService?.length) {
    const struggling = complianceByService.filter(svc => {
      const behind = (svc.atRisk ?? 0) + (svc.outOfCompliance ?? 0);
      return behind > 0 && behind > (svc.onTrack ?? 0);
    });
    if (struggling.length > 0) {
      const worst = [...struggling].sort((a, b) =>
        ((b.atRisk + b.outOfCompliance) - (a.atRisk + a.outOfCompliance)),
      )[0];
      const behindCount = (worst.atRisk ?? 0) + (worst.outOfCompliance ?? 0);
      out.push({
        ruleId: "service-type-behind",
        severity: "medium",
        icon: AlertTriangle,
        title: `${worst.serviceTypeName}: more students behind than on track (${behindCount} flagged) — assess staffing or scheduling`,
        detail: struggling.length > 1
          ? `${struggling.length} service types currently show this pattern.`
          : undefined,
        actionLabel: "Open risk report",
        actionHref: "/compliance-risk-report",
      });
    }
  }

  // Rule 8: Uncovered scheduled session blocks today
  if (dashSummary?.uncoveredBlocksToday && dashSummary.uncoveredBlocksToday > 0) {
    const n = dashSummary.uncoveredBlocksToday;
    out.push({
      ruleId: "uncovered-blocks-today",
      severity: "high",
      icon: CalendarClock,
      title: `${n} scheduled session block${n === 1 ? " has" : "s have"} no provider assigned today`,
      detail: "Cover or reassign before service time to avoid missed sessions.",
      actionLabel: "Open schedule",
      actionHref: "/schedule",
    });
  }

  // Rule 9: Large unresolved attention queue
  if (riskReport?.needsAttention && riskReport.needsAttention.length >= 10) {
    out.push({
      ruleId: "large-attention-queue",
      severity: "medium",
      icon: ClipboardList,
      title: `Triage all ${riskReport.needsAttention.length} flagged service requirements in the full risk report`,
      detail: "The Needs Attention table below shows the top 10 only.",
      actionLabel: "Open full report",
      actionHref: "/compliance-risk-report",
    });
  }

  return out;
}

/* ---------------------------------------------------------------------------
 * RECOMMENDATION_RULES — documentation of every rule above. Keep this in sync
 * with buildRecommendations(). The runtime logic is the source of truth; this
 * block exists so admins, support, and future engineers can audit what each
 * recommendation means without reading the React code.
 * ------------------------------------------------------------------------ */
export const RECOMMENDATION_RULES = [
  {
    id: "out-of-compliance-makeup",
    severity: "critical",
    trigger: "complianceRiskReport.summary.studentsOutOfCompliance > 0",
    message: "Schedule make-up sessions for N students who are out of compliance",
    link: "/compliance-risk-report",
    source: "/api/reports/compliance-risk-report",
  },
  {
    id: "at-risk-increase-coverage",
    severity: "high",
    trigger: "complianceRiskReport.summary.studentsAtRisk > 0",
    message: "N students at risk — increase service coverage this week to prevent shortfall",
    link: "/compliance-risk-report",
    source: "/api/reports/compliance-risk-report",
  },
  {
    id: "providers-under-75",
    severity: "high",
    trigger: "Any providerSummary entry with totalRequired > 0 AND complianceRate < 75%",
    message: "N providers below 75% delivery — review caseload and scheduling (lowest provider named in detail)",
    link: "/staff",
    source: "/api/reports/compliance-risk-report (providerSummary[])",
  },
  {
    id: "missed-sessions-this-week",
    severity: "high if total missed >= 5, otherwise medium",
    trigger: "weeklySummary.providersWithMissedThisWeek has any provider with missedSessions > 0",
    message: "X providers have incomplete logs — Y missed sessions this week",
    link: "/weekly-compliance-summary",
    source: "/api/reports/weekly-compliance-summary",
  },
  {
    id: "high-exposure-cases",
    severity: "critical if any single case exposure >= $5,000, otherwise high",
    trigger: "needsAttention rows with estimatedExposure >= $1,000",
    message: "Review N high-exposure cases totaling $X",
    link: "/compliance-risk-report",
    source: "/api/reports/compliance-risk-report (needsAttention[])",
  },
  {
    id: "outstanding-compensatory",
    severity: "high",
    trigger: "complianceRiskReport.summary.existingCompensatoryExposure > 0",
    message: "Outstanding compensatory obligations: $X — schedule make-up services",
    link: "/compensatory-services",
    source: "/api/reports/compliance-risk-report",
  },
  {
    id: "service-type-behind",
    severity: "medium",
    trigger: "complianceByService entry where (atRisk + outOfCompliance) > onTrack",
    message: "{Service Type}: more students behind than on track (N flagged) — assess staffing or scheduling",
    link: "/compliance-risk-report",
    source: "/api/dashboard/compliance-by-service",
  },
  {
    id: "uncovered-blocks-today",
    severity: "high",
    trigger: "dashboardSummary.uncoveredBlocksToday > 0",
    message: "N scheduled session blocks have no provider assigned today",
    link: "/schedule",
    source: "/api/dashboard/summary",
  },
  {
    id: "large-attention-queue",
    severity: "medium",
    trigger: "complianceRiskReport.needsAttention.length >= 10",
    message: "Triage all N flagged service requirements in the full risk report",
    link: "/compliance-risk-report",
    source: "/api/reports/compliance-risk-report",
  },
] as const;
