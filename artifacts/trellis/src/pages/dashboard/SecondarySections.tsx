import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Shield, ArrowRight, CalendarDays, FileSearch, Sprout, CalendarDays as MeetingIcon, BadgeCheck, CheckCircle2, Clock, FileText, TrendingUp, TrendingDown, Minus, SlidersHorizontal } from "lucide-react";
import { Link } from "wouter";
import { CollapsibleSection } from "./CollapsibleSection";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";
import { useState, useMemo } from "react";

/**
 * Inline week-over-week delta indicator for secondary dashboard metric cards.
 * Mirrors the look of the trend arrows on the hero compliance card so the
 * "is this getting better or worse?" signal is consistent across the page.
 *
 * `positiveIsGood` flips the color polarity so e.g. "overdue evaluations going
 * down" renders green even though the numeric delta is negative.
 */
function TrendDelta({
  delta,
  positiveIsGood,
  suffix = "",
  decimals = 0,
}: {
  delta: number | null | undefined;
  positiveIsGood: boolean;
  suffix?: string;
  decimals?: number;
}) {
  if (delta === null || delta === undefined) return null;
  const isZero = decimals > 0 ? Math.abs(delta) < Math.pow(10, -decimals) / 2 : delta === 0;
  const isUp = !isZero && delta > 0;
  const isGood = isZero ? false : positiveIsGood ? isUp : !isUp;
  const isBad = isZero ? false : positiveIsGood ? !isUp : isUp;
  const colorCls = isGood ? "text-emerald-600" : isBad ? "text-red-600" : "text-gray-400";
  const Icon = isZero ? Minus : isUp ? TrendingUp : TrendingDown;
  const sign = isZero ? "" : delta > 0 ? "+" : "";
  const display = decimals > 0 ? delta.toFixed(decimals) : Math.round(delta).toString();
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${colorCls}`} title="vs. last week">
      <Icon className="w-3 h-3" />
      <span className="tabular-nums">{sign}{display}{suffix}</span>
    </span>
  );
}

export function AccommodationComplianceCard({
  accommodationCompliance,
  rateDelta,
}: {
  accommodationCompliance: any;
  rateDelta?: number | null;
}) {
  if (!accommodationCompliance) return null;
  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-0 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-gray-600">Accommodation Verification Status</CardTitle>
        <Link href="/accommodation-lookup" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
          View details <ArrowRight className="w-3 h-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Shield className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <div className="text-2xl font-bold text-gray-900">{accommodationCompliance.overallComplianceRate}%</div>
                <TrendDelta delta={rateDelta} positiveIsGood suffix="%" />
              </div>
              <div className="text-[11px] text-gray-400">verified in 30 days</div>
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] text-gray-500">{accommodationCompliance.totalStudents} students with accommodations</span>
              <span className="text-[11px] font-medium text-gray-600">
                {accommodationCompliance.students.filter((s: any) => s.overdueCount === 0).length} fully verified
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full transition-all duration-500"
                style={{
                  width: `${accommodationCompliance.overallComplianceRate}%`,
                  backgroundColor: accommodationCompliance.overallComplianceRate >= 80 ? "#10b981" : accommodationCompliance.overallComplianceRate >= 50 ? "#f59e0b" : "#ef4444",
                }}
              />
            </div>
          </div>
          {accommodationCompliance.students.filter((s: any) => s.overdueCount > 0).length > 0 && (
            <div className="text-center px-3 py-1.5 rounded-lg bg-amber-50">
              <div className="text-lg font-bold text-amber-700">{accommodationCompliance.students.filter((s: any) => s.overdueCount > 0).length}</div>
              <div className="text-[10px] text-amber-600">need attention</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface EvaluationTimelineStudent {
  referralId: number;
  studentId: number | null;
  studentName: string;
  consentDate: string;
  daysElapsed: number;
  daysRemaining: number;
  isOverdue: boolean;
}

export function EvaluationTimelineRiskCard({ students, deadlineDays = 60 }: { students: EvaluationTimelineStudent[]; deadlineDays?: number }) {
  const overdue = students.filter(s => s.isOverdue);
  const atRisk = students.filter(s => !s.isOverdue);
  const hasRisk = students.length > 0;

  return (
    <Card className={hasRisk ? (overdue.length > 0 ? "border-red-200" : "border-amber-200") : "border-emerald-200"}>
      <CardHeader className="pb-0 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          Evaluation Timeline Risk ({deadlineDays}-Day Clock)
        </CardTitle>
        <Link href="/evaluations" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
          View evaluations <ArrowRight className="w-3 h-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-4">
        {!hasRisk ? (
          <div className="flex items-center gap-3 py-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <span className="text-sm text-emerald-700 font-medium">All evaluations on track</span>
          </div>
        ) : (
          <div className="space-y-2">
            {overdue.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600">
                  Overdue — past {deadlineDays} days ({overdue.length})
                </p>
                {overdue.map(s => (
                  <Link key={s.referralId} href={s.studentId ? `/students/${s.studentId}?tab=evaluations` : "/evaluations"}>
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-semibold text-gray-900 truncate block">{s.studentName}</span>
                        <span className="text-[11px] text-gray-500">Consent: {s.consentDate}</span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-[12px] font-bold text-red-700">{s.daysElapsed}d elapsed</span>
                        <span className="text-[11px] text-red-500 block">{Math.abs(s.daysRemaining)}d overdue</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {atRisk.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                  Approaching deadline — within 10 days ({atRisk.length})
                </p>
                {atRisk.map(s => (
                  <Link key={s.referralId} href={s.studentId ? `/students/${s.studentId}?tab=evaluations` : "/evaluations"}>
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-semibold text-gray-900 truncate block">{s.studentName}</span>
                        <span className="text-[11px] text-gray-500">Consent: {s.consentDate}</span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-[12px] font-bold text-amber-700">{s.daysElapsed}d elapsed</span>
                        <span className="text-[11px] text-amber-500 block">{s.daysRemaining}d remaining</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TransitionsSection({ transitionDash }: { transitionDash: any }) {
  const hasIssues = transitionDash && (transitionDash.missingPlan > 0 || transitionDash.approachingTransitionAge > 0 || transitionDash.overdueFollowups > 0);
  return (
    <CollapsibleSection title="Transition Planning" icon={Sprout}>
      {hasIssues ? (
        <Card className={transitionDash.missingPlan > 0 ? "border-amber-200 bg-amber-50/20" : "border-gray-200/60"}>
          <CardContent className="py-3 px-5 flex items-center gap-4 flex-wrap">
            <Sprout className={`w-5 h-5 flex-shrink-0 ${transitionDash.missingPlan > 0 ? "text-amber-500" : "text-emerald-500"}`} />
            <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap text-[12px]">
              {transitionDash.missingPlan > 0 && <span className="text-amber-700 font-semibold">{transitionDash.missingPlan} student{transitionDash.missingPlan !== 1 ? "s" : ""} 14+ missing transition plan</span>}
              {transitionDash.incompletePlans > 0 && <span className="text-amber-600">{transitionDash.incompletePlans} incomplete plan{transitionDash.incompletePlans !== 1 ? "s" : ""}</span>}
              {transitionDash.approachingTransitionAge > 0 && <span className="text-gray-600">{transitionDash.approachingTransitionAge} approaching transition age</span>}
              {transitionDash.overdueFollowups > 0 && <span className="text-red-700 font-semibold">{transitionDash.overdueFollowups} overdue agency follow-up{transitionDash.overdueFollowups !== 1 ? "s" : ""}</span>}
            </div>
            <Link href="/transitions" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
              Transition Planning →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-gray-400 py-4 text-center">All transition plans are on track.</p>
      )}
    </CollapsibleSection>
  );
}

export function EvalsTransitionsSection({
  evalDash,
  transitionDash,
  evalsDeltas,
  transitionsDeltas,
}: {
  evalDash: any;
  transitionDash: any;
  evalsDeltas?: { overdueEvaluations?: number | null; overdueReEvaluations?: number | null };
  transitionsDeltas?: { missingPlan?: number | null; overdueFollowups?: number | null };
}) {
  return (
    <CollapsibleSection title="Evaluations & Transitions" icon={FileSearch}>
      {evalDash && (evalDash.overdueEvaluations > 0 || evalDash.overdueReEvaluations > 0 || evalDash.openReferrals > 0) && (
        <Card className={evalDash.overdueEvaluations > 0 || evalDash.overdueReEvaluations > 0 ? "border-red-200 bg-red-50/20" : "border-amber-200 bg-amber-50/20"}>
          <CardContent className="py-3 px-5 flex items-center gap-4 flex-wrap">
            <FileSearch className={`w-5 h-5 flex-shrink-0 ${evalDash.overdueEvaluations > 0 ? "text-red-500" : "text-amber-500"}`} />
            <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap text-[12px]">
              {evalDash.openReferrals > 0 && <span className="text-gray-600"><b className="text-gray-800">{evalDash.openReferrals}</b> open referral{evalDash.openReferrals !== 1 ? "s" : ""}</span>}
              {evalDash.overdueEvaluations > 0 && (
                <span className="inline-flex items-center gap-1.5 text-red-700 font-semibold">
                  {evalDash.overdueEvaluations} overdue evaluation{evalDash.overdueEvaluations !== 1 ? "s" : ""}
                  <TrendDelta delta={evalsDeltas?.overdueEvaluations} positiveIsGood={false} />
                </span>
              )}
              {evalDash.upcomingReEvaluations > 0 && <span className="text-amber-700">{evalDash.upcomingReEvaluations} re-eval{evalDash.upcomingReEvaluations !== 1 ? "s" : ""} due within 90 days</span>}
              {evalDash.overdueReEvaluations > 0 && (
                <span className="inline-flex items-center gap-1.5 text-red-700 font-semibold">
                  {evalDash.overdueReEvaluations} overdue re-eval{evalDash.overdueReEvaluations !== 1 ? "s" : ""}
                  <TrendDelta delta={evalsDeltas?.overdueReEvaluations} positiveIsGood={false} />
                </span>
              )}
            </div>
            <Link href="/evaluations" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
              View Evaluations →
            </Link>
          </CardContent>
        </Card>
      )}

      {transitionDash && (transitionDash.missingPlan > 0 || transitionDash.approachingTransitionAge > 0 || transitionDash.overdueFollowups > 0) && (
        <Card className={transitionDash.missingPlan > 0 ? "border-amber-200 bg-amber-50/20" : "border-gray-200/60"}>
          <CardContent className="py-3 px-5 flex items-center gap-4 flex-wrap">
            <Sprout className={`w-5 h-5 flex-shrink-0 ${transitionDash.missingPlan > 0 ? "text-amber-500" : "text-emerald-500"}`} />
            <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap text-[12px]">
              {transitionDash.missingPlan > 0 && (
                <span className="inline-flex items-center gap-1.5 text-amber-700 font-semibold">
                  {transitionDash.missingPlan} student{transitionDash.missingPlan !== 1 ? "s" : ""} 14+ missing transition plan
                  <TrendDelta delta={transitionsDeltas?.missingPlan} positiveIsGood={false} />
                </span>
              )}
              {transitionDash.incompletePlans > 0 && <span className="text-amber-600">{transitionDash.incompletePlans} incomplete plan{transitionDash.incompletePlans !== 1 ? "s" : ""}</span>}
              {transitionDash.approachingTransitionAge > 0 && <span className="text-gray-600">{transitionDash.approachingTransitionAge} approaching transition age</span>}
              {transitionDash.overdueFollowups > 0 && (
                <span className="inline-flex items-center gap-1.5 text-red-700 font-semibold">
                  {transitionDash.overdueFollowups} overdue agency follow-up{transitionDash.overdueFollowups !== 1 ? "s" : ""}
                  <TrendDelta delta={transitionsDeltas?.overdueFollowups} positiveIsGood={false} />
                </span>
              )}
            </div>
            <Link href="/transitions" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
              Transition Planning →
            </Link>
          </CardContent>
        </Card>
      )}

      {(evalDash && !(evalDash.overdueEvaluations > 0 || evalDash.overdueReEvaluations > 0 || evalDash.openReferrals > 0))
        && (transitionDash && !(transitionDash.missingPlan > 0 || transitionDash.approachingTransitionAge > 0 || transitionDash.overdueFollowups > 0))
        && (
        <p className="text-sm text-gray-400 py-4 text-center">All evaluations and transitions are on track.</p>
      )}
    </CollapsibleSection>
  );
}

export function MeetingsSection({
  meetingDash,
  overdueDelta,
}: {
  meetingDash: any;
  overdueDelta?: number | null;
}) {
  return (
    <CollapsibleSection title="IEP Meetings" icon={MeetingIcon}>
      {meetingDash && (meetingDash.overdueCount > 0 || meetingDash.thisWeekCount > 0 || meetingDash.pendingConsentCount > 0) ? (
        <Card className={meetingDash.overdueCount > 0 ? "border-red-200 bg-red-50/20" : "border-gray-200/60"}>
          <CardContent className="py-3 px-5 flex items-center gap-4 flex-wrap">
            <MeetingIcon className={`w-5 h-5 flex-shrink-0 ${meetingDash.overdueCount > 0 ? "text-red-500" : "text-emerald-500"}`} />
            <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap text-[12px]">
              {meetingDash.overdueCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-red-700 font-semibold">
                  {meetingDash.overdueCount} overdue meeting{meetingDash.overdueCount !== 1 ? "s" : ""}
                  <TrendDelta delta={overdueDelta} positiveIsGood={false} />
                </span>
              )}
              {meetingDash.thisWeekCount > 0 && <span className="text-gray-700">{meetingDash.thisWeekCount} meeting{meetingDash.thisWeekCount !== 1 ? "s" : ""} this week</span>}
              {meetingDash.pendingConsentCount > 0 && <span className="text-amber-700">{meetingDash.pendingConsentCount} pending consent</span>}
            </div>
            <Link href="/iep-meetings" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
              IEP Meetings →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-gray-400 py-4 text-center">No upcoming meetings to report.</p>
      )}
    </CollapsibleSection>
  );
}

export function ContractRenewalsCard({ contractRenewals }: { contractRenewals: { id: number; agencyName: string; endDate: string }[] }) {
  if (!contractRenewals || contractRenewals.length === 0) return null;
  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-0 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-gray-600">Contract Renewals</CardTitle>
        <Link href="/contract-utilization" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View utilization</Link>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {contractRenewals.map(c => {
            const daysLeft = Math.ceil((new Date(c.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const isCritical = daysLeft <= 7;
            return (
              <div key={c.id} className={`flex items-start gap-3 p-3 rounded-lg border ${isCritical ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isCritical ? "text-red-500" : "text-amber-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-800 truncate">{c.agencyName}</p>
                  <p className={`text-[11px] font-semibold mt-0.5 ${isCritical ? "text-red-600" : "text-amber-600"}`}>
                    {daysLeft <= 0 ? "Expires today" : `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export interface CredentialExpirationItem {
  credentialId: number;
  staffId: number;
  staffName: string;
  credentialType: string;
  issuingBody: string | null;
  licenseNumber: string | null;
  expirationDate: string;
  daysUntilExpiration: number;
  urgency: "critical" | "warning";
}

export function CredentialExpirationCard({ credentials }: { credentials: CredentialExpirationItem[] }) {
  if (credentials.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardContent className="py-4 px-5 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <span className="text-sm font-medium text-emerald-700">All credentials up to date</span>
        </CardContent>
      </Card>
    );
  }

  const critical = credentials.filter(c => c.urgency === "critical");
  const warning = credentials.filter(c => c.urgency === "warning");
  const borderClass = critical.length > 0 ? "border-red-200" : "border-amber-200";

  return (
    <Card className={borderClass}>
      <CardHeader className="pb-0 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <BadgeCheck className="w-4 h-4 text-gray-400" />
          Staff Credentials Expiring Soon
          {critical.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
              {critical.length} urgent
            </span>
          )}
        </CardTitle>
        <Link href="/staff" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
          Staff directory <ArrowRight className="w-3 h-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-4 pb-4">
        <div className="space-y-2">
          {credentials.map(c => {
            const isCritical = c.urgency === "critical";
            return (
              <Link key={c.credentialId} href={`/staff/${c.staffId}`}>
                <div className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow ${isCritical ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                  <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${isCritical ? "text-red-500" : "text-amber-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 truncate">{c.staffName}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                      {c.credentialType}{c.issuingBody ? ` · ${c.issuingBody}` : ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-[12px] font-bold ${isCritical ? "text-red-700" : "text-amber-700"}`}>
                      {c.daysUntilExpiration === 0 ? "Expires today" : `${c.daysUntilExpiration}d left`}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(c.expirationDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        {critical.length > 0 && (
          <p className="text-[11px] text-red-600 mt-3 font-medium">
            {critical.length} credential{critical.length !== 1 ? "s" : ""} expiring within 14 days — action required.
          </p>
        )}
        {warning.length > 0 && (
          <p className="text-[11px] text-amber-600 mt-1">
            {warning.length} credential{warning.length !== 1 ? "s" : ""} expiring in 15–60 days.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function DeadlinesSection({ deadlines }: { deadlines: any[] }) {
  return (
    <CollapsibleSection title="Upcoming IEP Deadlines" icon={CalendarDays}>
      {deadlines.length > 0 ? (
        <Card className="border-gray-200/60">
          <CardHeader className="pb-0 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-600">Next {deadlines.length} deadlines</CardTitle>
            <Link href="/compliance?tab=timeline" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View timeline</Link>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {deadlines.map((d: any, i: number) => {
                const days = d.daysUntilDue ?? d.daysRemaining ?? 0;
                const isOverdue = days < 0;
                const isUrgent = days >= 0 && days <= 14;
                return (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${isOverdue ? "bg-red-50 border-red-200" : isUrgent ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
                    <CalendarDays className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isOverdue ? "text-red-500" : isUrgent ? "text-amber-500" : "text-gray-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-800 truncate">{d.studentName || "Student"}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {(d.eventType || "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </p>
                      <p className={`text-[11px] font-semibold mt-0.5 ${isOverdue ? "text-red-600" : isUrgent ? "text-amber-600" : "text-gray-500"}`}>
                        {isOverdue ? `${Math.abs(days)} days overdue` : `${days} days remaining`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-gray-400 py-4 text-center">No upcoming deadlines.</p>
      )}
    </CollapsibleSection>
  );
}

interface IepExpiration {
  studentId: number;
  studentName: string;
  iepEndDate: string;
  daysRemaining: number;
  schoolId: number | null;
  schoolName: string | null;
  caseManagerId: number | null;
  caseManagerName: string | null;
}

const BAND_CONFIG = [
  { label: "Expiring within 30 days", min: 0, max: 30, bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500", text: "text-red-700", badgeBg: "bg-red-100", badgeText: "text-red-700" },
  { label: "Expiring in 31–60 days",  min: 31, max: 60, bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-400", text: "text-amber-700", badgeBg: "bg-amber-100", badgeText: "text-amber-700" },
  { label: "Expiring in 61–90 days",  min: 61, max: 90, bg: "bg-yellow-50", border: "border-yellow-200", dot: "bg-yellow-400", text: "text-yellow-700", badgeBg: "bg-yellow-100", badgeText: "text-yellow-700" },
] as const;

export function IepExpirationCard({ enabled = true }: { enabled?: boolean }) {
  const { filterParams } = useSchoolContext();
  const qs = new URLSearchParams(filterParams).toString();

  const [schoolFilter, setSchoolFilter] = useState<string>("");
  const [caseManagerFilter, setCaseManagerFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"daysRemaining" | "studentName">("daysRemaining");

  const { data, isLoading } = useQuery<IepExpiration[]>({
    queryKey: ["dashboard/iep-expirations", filterParams],
    queryFn: () =>
      authFetch(`/api/dashboard/iep-expirations${qs ? `?${qs}` : ""}`).then((r) =>
        r.ok ? r.json() : []
      ),
    staleTime: 120_000,
    enabled,
  });

  const allStudents = data ?? [];

  const schools = useMemo(() => {
    const seen = new Map<number, string>();
    for (const s of allStudents) {
      if (s.schoolId && s.schoolName && !seen.has(s.schoolId)) {
        seen.set(s.schoolId, s.schoolName);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allStudents]);

  const caseManagers = useMemo(() => {
    const seen = new Map<number, string>();
    for (const s of allStudents) {
      if (s.caseManagerId && s.caseManagerName && !seen.has(s.caseManagerId)) {
        seen.set(s.caseManagerId, s.caseManagerName);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allStudents]);

  const students = useMemo(() => {
    let list = allStudents;
    if (schoolFilter) {
      list = list.filter((s) => String(s.schoolId) === schoolFilter);
    }
    if (caseManagerFilter) {
      list = list.filter((s) => String(s.caseManagerId) === caseManagerFilter);
    }
    if (sortBy === "studentName") {
      list = [...list].sort((a, b) => a.studentName.localeCompare(b.studentName));
    }
    return list;
  }, [allStudents, schoolFilter, caseManagerFilter, sortBy]);

  const total = students.length;
  const hasFilters = !!schoolFilter || !!caseManagerFilter;

  const formatDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const showFilters = allStudents.length > 0 && (schools.length > 1 || caseManagers.length > 1);

  return (
    <Card className="border-gray-200/60" data-testid="iep-expiration-card">
      <CardHeader className="pb-0 flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          <CardTitle className="text-sm font-semibold text-gray-600">IEP Renewals Due</CardTitle>
          {allStudents.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              {allStudents.length} expiring soon
            </span>
          )}
        </div>
      </CardHeader>

      {showFilters && (
        <div className="px-6 pt-3 pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            {schools.length > 1 && (
              <select
                value={schoolFilter}
                onChange={(e) => setSchoolFilter(e.target.value)}
                className="text-[12px] rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                aria-label="Filter by school"
              >
                <option value="">All schools</option>
                {schools.map((sc) => (
                  <option key={sc.id} value={String(sc.id)}>{sc.name}</option>
                ))}
              </select>
            )}
            {caseManagers.length > 1 && (
              <select
                value={caseManagerFilter}
                onChange={(e) => setCaseManagerFilter(e.target.value)}
                className="text-[12px] rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                aria-label="Filter by case manager"
              >
                <option value="">All case managers</option>
                {caseManagers.map((cm) => (
                  <option key={cm.id} value={String(cm.id)}>{cm.name}</option>
                ))}
              </select>
            )}
            <div className="ml-auto flex items-center gap-1">
              <span className="text-[11px] text-gray-400 mr-1">Sort:</span>
              <button
                onClick={() => setSortBy("daysRemaining")}
                className={`text-[11px] px-2 py-0.5 rounded ${sortBy === "daysRemaining" ? "bg-emerald-100 text-emerald-700 font-semibold" : "text-gray-500 hover:text-gray-700"}`}
              >
                Days left
              </button>
              <button
                onClick={() => setSortBy("studentName")}
                className={`text-[11px] px-2 py-0.5 rounded ${sortBy === "studentName" ? "bg-emerald-100 text-emerald-700 font-semibold" : "text-gray-500 hover:text-gray-700"}`}
              >
                Name
              </button>
            </div>
            {hasFilters && (
              <button
                onClick={() => { setSchoolFilter(""); setCaseManagerFilter(""); }}
                className="text-[11px] text-gray-400 hover:text-gray-600 underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <CardContent className="pt-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : allStudents.length === 0 ? (
          <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-emerald-50 border border-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="text-sm font-medium text-emerald-700">All IEPs current — no renewals due in the next 90 days.</span>
          </div>
        ) : total === 0 && hasFilters ? (
          <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-gray-50 border border-gray-200">
            <CheckCircle2 className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-500">No renewals match the selected filters.</span>
          </div>
        ) : (
          <div className="space-y-4">
            {sortBy === "daysRemaining" ? (
              BAND_CONFIG.map((band) => {
                const group = students.filter(
                  (s) => s.daysRemaining >= band.min && s.daysRemaining <= band.max
                );
                if (group.length === 0) return null;
                return (
                  <div key={band.label}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${band.dot}`} />
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{band.label}</span>
                      <span className={`ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${band.badgeBg} ${band.badgeText}`}>{group.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {group.map((s) => (
                        <IepRenewalRow key={s.studentId} s={s} band={band} formatDate={formatDate} />
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="space-y-1.5">
                {students.map((s) => {
                  const band = BAND_CONFIG.find((b) => s.daysRemaining >= b.min && s.daysRemaining <= b.max) ?? BAND_CONFIG[2];
                  return <IepRenewalRow key={s.studentId} s={s} band={band} formatDate={formatDate} />;
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IepRenewalRow({
  s,
  band,
  formatDate,
}: {
  s: IepExpiration;
  band: (typeof BAND_CONFIG)[number];
  formatDate: (iso: string) => string;
}) {
  return (
    <Link key={s.studentId} href={`/students/${s.studentId}/iep`}>
      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${band.bg} ${band.border} hover:brightness-95 transition-all cursor-pointer`}>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium text-gray-800 truncate block">{s.studentName}</span>
          {(s.schoolName || s.caseManagerName) && (
            <span className="text-[11px] text-gray-400 truncate block">
              {[s.schoolName, s.caseManagerName ? `CM: ${s.caseManagerName}` : null].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[12px] text-gray-500">{formatDate(s.iepEndDate)}</div>
          <div className={`text-[11px] font-semibold ${band.text}`}>
            {s.daysRemaining === 0 ? "Expires today" : `${s.daysRemaining} day${s.daysRemaining === 1 ? "" : "s"} left`}
          </div>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      </div>
    </Link>
  );
}
