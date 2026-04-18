import {
  AlertTriangle, Shield, Clipboard, ArrowRight, FileBarChart, DollarSign,
  BarChart2, Briefcase, CalendarClock, AlertCircle,
} from "lucide-react";
import { Link } from "wouter";
import { Users, Clock, Bell, CheckCircle } from "lucide-react";
import type { RiskOverview, AlertsSummary, ComplianceByService, Alert } from "@workspace/api-client-react";
import type { DashboardSummaryExtended, ProviderCaseloadSummary } from "./types";
import { MetricCard } from "./MetricCard";
import { ComplianceRingCard, SessionTrendCard, ComplianceByServiceCard, RecentAlertsCard } from "./ChartsSection";
import {
  AccommodationComplianceCard, EvalsTransitionsSection, MeetingsSection,
  ContractRenewalsCard, DeadlinesSection, IepExpirationCard,
} from "./SecondarySections";
import CostRiskPanel from "@/components/dashboard/CostRiskPanel";
import SystemStatusBanner from "@/components/dashboard/SystemStatusBanner";
import MakeupSessionsCard from "@/components/dashboard/MakeupSessionsCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Lightly-typed shape for data fetched from non-OpenAPI endpoints */
interface EvalDashboard {
  overdueEvaluations: number;
  overdueReEvaluations: number;
  openReferrals: number;
  upcomingReEvaluations: number;
}

interface TransitionDashboard {
  missingPlan: number;
  incompletePlans: number;
  approachingTransitionAge: number;
  overdueFollowups: number;
}

interface MeetingDashboard {
  overdueCount: number;
  thisWeekCount: number;
  pendingConsentCount: number;
}

interface AccommodationComplianceData {
  totalStudents: number;
  overallComplianceRate: number;
  students: { overdueCount: number }[];
}

interface TrendPoint {
  weekLabel?: string;
  completedCount?: number;
  missedCount?: number;
}

interface RiskPiePoint {
  name: string;
  value: number;
}

interface DeadlineItem {
  studentName: string;
  eventType: string;
  daysUntilDue?: number;
  daysRemaining?: number;
}

export interface DashboardTabsProps {
  isAdmin: boolean;
  myCaseload: ProviderCaseloadSummary | null;
  hasTrackedData: boolean;
  onTrackPct: number;
  complianceSubtitle: string;
  s: DashboardSummaryExtended | null;
  ro: RiskOverview | null;
  alerts: AlertsSummary | null;
  recent: Alert[];
  riskPieData: RiskPiePoint[];
  trendData: TrendPoint[];
  serviceData: ComplianceByService[];
  evalDash: EvalDashboard | null;
  transitionDash: TransitionDashboard | null;
  meetingDash: MeetingDashboard | null;
  accommodationCompliance: AccommodationComplianceData | null;
  deadlines: DeadlineItem[];
}

export function DashboardTabs({
  isAdmin, myCaseload, hasTrackedData, onTrackPct, complianceSubtitle,
  s, ro, alerts, recent, riskPieData, trendData, serviceData,
  evalDash, transitionDash, meetingDash, accommodationCompliance, deadlines,
}: DashboardTabsProps) {
  const quickActions = [
    { label: "Compliance Risk Report", icon: AlertTriangle, href: "/compliance-risk-report", color: "text-red-700 bg-red-50 hover:bg-red-100" },
    { label: "Required vs Delivered", icon: Shield, href: "/compliance", color: "text-emerald-700 bg-emerald-50 hover:bg-emerald-100" },
    { label: "High-Risk Students", icon: Users, href: "/compliance-risk-report#needs-attention", color: "text-amber-700 bg-amber-50 hover:bg-amber-100" },
    { label: "Weekly Summary", icon: FileBarChart, href: "/weekly-compliance-summary", color: "text-blue-700 bg-blue-50 hover:bg-blue-100" },
    { label: "Compensatory Exposure", icon: DollarSign, href: "/compensatory-finance", color: "text-rose-700 bg-rose-50 hover:bg-rose-100" },
    { label: "Log Session", icon: Clipboard, href: "/sessions", color: "text-gray-700 bg-gray-50 hover:bg-gray-100" },
  ];

  // Operational counters from dashboard summary
  const uncoveredToday = s?.uncoveredBlocksToday ?? 0;
  const conflictsToday = s?.scheduleConflictsToday ?? 0;
  const makeupObligations = s?.openMakeupObligations ?? 0;
  const missedThisWeek = s?.missedSessionsThisWeek ?? 0;
  const shortfallMinutes = s?.totalShortfallMinutes ?? 0;
  const outOfComplianceStudents = s?.outOfComplianceStudents ?? 0;

  return (
    <Tabs defaultValue="overview" className="w-full">
      {/* Tab bar — horizontally scrollable on mobile */}
      <div className="overflow-x-auto -mx-1 px-1">
        <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 gap-1 bg-gray-100/80 p-1 rounded-xl mb-1">
          <TabsTrigger
            value="overview"
            className="flex items-center gap-1.5 text-[13px] px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 text-gray-500 rounded-lg whitespace-nowrap"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="compliance"
            className="flex items-center gap-1.5 text-[13px] px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 text-gray-500 rounded-lg whitespace-nowrap"
          >
            <Shield className="w-3.5 h-3.5" />
            Compliance &amp; Risk
          </TabsTrigger>
          <TabsTrigger
            value="operations"
            className="flex items-center gap-1.5 text-[13px] px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 text-gray-500 rounded-lg whitespace-nowrap"
          >
            <Briefcase className="w-3.5 h-3.5" />
            Operations
          </TabsTrigger>
        </TabsList>
      </div>

      {/* ── Overview tab ─────────────────────────────────────────────────
          Contains: wedge banner, 4 metric cards, quick actions,
          today's plan vs. actual sessions count, compliance ring,
          session trend chart.
      ─────────────────────────────────────────────────────────────────── */}
      <TabsContent value="overview" className="space-y-6 md:space-y-8 mt-4">
        {/* Wedge banner — pulls admins to the compliance risk report */}
        {isAdmin && (
          <Link href="/compliance-risk-report">
            <div
              className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-white p-4 md:p-5 hover:shadow-sm transition-shadow cursor-pointer flex items-center gap-4 group"
              data-testid="banner-risk-report"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm md:text-[15px] font-semibold text-gray-900">Open the Compliance Risk Report</div>
                <div className="text-xs md:text-sm text-gray-500 mt-0.5">
                  Required vs delivered minutes, high-risk students, compensatory exposure, and the next best actions — in one place.
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-emerald-700 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
            </div>
          </Link>
        )}

        {/* 4 top-line metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <MetricCard
            title={myCaseload ? "Your Caseload" : "Compliance Rate"}
            value={myCaseload ? myCaseload.assignedStudents : (hasTrackedData ? `${onTrackPct}%` : "—")}
            icon={myCaseload ? Users : Shield}
            accent={myCaseload
              ? "emerald"
              : (!hasTrackedData ? "amber" : (onTrackPct >= 95 ? "emerald" : onTrackPct >= 85 ? "amber" : "red"))}
            subtitle={myCaseload ? "students assigned" : complianceSubtitle}
            href={myCaseload ? "/students" : "/compliance"}
          />
          <MetricCard
            title={myCaseload ? "Sessions Delivered" : "High-Risk Students"}
            value={myCaseload ? `${myCaseload.totalDeliveredMinutes} min` : (outOfComplianceStudents + (ro?.atRisk ?? 0))}
            icon={myCaseload ? Clock : AlertTriangle}
            accent={myCaseload ? "emerald" : "red"}
            subtitle={myCaseload
              ? `of ${myCaseload.totalRequiredMinutes} required`
              : `${outOfComplianceStudents} out · ${ro?.atRisk ?? 0} at risk`}
            href={myCaseload ? "/sessions" : "/compliance-risk-report"}
          />
          <MetricCard
            title={myCaseload ? "Compliance" : "Urgent Actions"}
            value={myCaseload ? `${myCaseload.utilizationPercent}%` : ((alerts?.critical ?? 0) + makeupObligations)}
            icon={myCaseload ? CheckCircle : Bell}
            accent={myCaseload ? (myCaseload.utilizationPercent >= 80 ? "emerald" : "amber") : "amber"}
            subtitle={myCaseload
              ? "of your students"
              : `${alerts?.critical ?? 0} critical · ${makeupObligations} makeups`}
            href={myCaseload ? "/compliance" : "/alerts"}
          />
          <MetricCard
            title={myCaseload ? "At Risk" : "Compensatory Exposure"}
            value={myCaseload
              ? myCaseload.studentsAtRisk
              : (shortfallMinutes > 0 ? `${shortfallMinutes.toLocaleString()} min` : "0 min")}
            icon={myCaseload ? AlertTriangle : DollarSign}
            accent="red"
            subtitle={myCaseload ? "your students" : "shortfall behind required"}
            href={myCaseload ? "/compliance" : "/compliance-risk-report"}
          />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {quickActions.map(action => (
            <Link key={action.href} href={action.href}>
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-medium cursor-pointer transition-colors ${action.color}`}>
                <action.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{action.label}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Today's plan vs. actual sessions count */}
        {s && (uncoveredToday > 0 || missedThisWeek > 0 || conflictsToday > 0) && (
          <Card className="border-gray-200/60">
            <CardContent className="py-3 px-5">
              <div className="flex items-center gap-3 flex-wrap text-[12px]">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <CalendarClock className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700">Today's Session Status</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {uncoveredToday > 0 && (
                    <Link href="/coverage">
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium cursor-pointer hover:opacity-80 transition-opacity">
                        <span className="font-bold">{uncoveredToday}</span> uncovered block{uncoveredToday !== 1 ? "s" : ""}
                      </span>
                    </Link>
                  )}
                  {conflictsToday > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-medium">
                      <span className="font-bold">{conflictsToday}</span> conflict{conflictsToday !== 1 ? "s" : ""}
                    </span>
                  )}
                  {missedThisWeek > 0 && (
                    <Link href="/sessions?filter=missed">
                      <span className="px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 font-medium cursor-pointer hover:opacity-80 transition-opacity">
                        <span className="font-bold">{missedThisWeek}</span> missed this week
                      </span>
                    </Link>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isAdmin && s && (
          <SystemStatusBanner errorsLast24h={s.errorsLast24h ?? 0} />
        )}

        {/* Charts: compliance ring + session trend */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <ComplianceRingCard ro={ro} riskPieData={riskPieData} onTrackPct={onTrackPct} />
          <SessionTrendCard trendData={trendData} />
        </div>
      </TabsContent>

      {/* ── Compliance & Risk tab ─────────────────────────────────────────
          Contains: cost/risk panel (admin), compliance by service,
          recent alerts, overdue makeup sessions tracker, accommodation
          compliance, evaluations & transitions, IEP meetings.
      ─────────────────────────────────────────────────────────────────── */}
      <TabsContent value="compliance" className="space-y-6 md:space-y-8 mt-4">
        {/* Cost & Risk Exposure panel — preserves original admin-only gating */}
        {isAdmin && <CostRiskPanel />}

        {/* Compliance by service + Recent alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ComplianceByServiceCard serviceData={serviceData} />
          <RecentAlertsCard recent={recent} />
        </div>

        {/* Overdue makeup sessions tracker */}
        <MakeupSessionsCard />

        {/* Accommodation compliance */}
        {accommodationCompliance && (
          <AccommodationComplianceCard accommodationCompliance={accommodationCompliance} />
        )}

        {/* IEP expiration countdown — renewals due within 90 days */}
        <IepExpirationCard />

        {/* Evaluations & Transitions — evaluation timeline risk */}
        <EvalsTransitionsSection evalDash={evalDash} transitionDash={transitionDash} />

        {/* IEP Meetings — includes missing-document / pending-consent tracking */}
        <MeetingsSection meetingDash={meetingDash} />
      </TabsContent>

      {/* ── Operations tab ────────────────────────────────────────────────
          Contains: uncovered sessions count, schedule conflicts,
          contract renewals, IEP deadlines timeline.
          Future widgets (staff absence, provider leaderboard, credential
          alerts, parent portal engagement, pilot health) are downstream tasks.
      ─────────────────────────────────────────────────────────────────── */}
      <TabsContent value="operations" className="space-y-6 md:space-y-8 mt-4">
        {/* Coverage & scheduling — uncovered sessions count */}
        {s && (
          <Card className="border-gray-200/60">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-gray-400" />
                Coverage &amp; Scheduling Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Link href="/coverage">
                  <div className={`p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow ${uncoveredToday > 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
                    <div className={`text-2xl font-bold ${uncoveredToday > 0 ? "text-amber-700" : "text-gray-600"}`}>{uncoveredToday}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">Uncovered sessions today</div>
                  </div>
                </Link>
                <div className={`p-3 rounded-lg border ${conflictsToday > 0 ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                  <div className={`text-2xl font-bold ${conflictsToday > 0 ? "text-red-700" : "text-gray-600"}`}>{conflictsToday}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">Schedule conflicts today</div>
                </div>
                <div className="p-3 rounded-lg border bg-gray-50 border-gray-200">
                  <div className="text-2xl font-bold text-gray-600">{missedThisWeek}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">Sessions missed this week</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contract renewals */}
        {isAdmin && s?.contractRenewals && s.contractRenewals.length > 0 && (
          <ContractRenewalsCard contractRenewals={s.contractRenewals} />
        )}

        {/* IEP deadlines timeline */}
        <DeadlinesSection deadlines={deadlines} />
      </TabsContent>
    </Tabs>
  );
}
