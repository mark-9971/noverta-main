import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Shield, ArrowRight, CalendarDays, FileSearch, Sprout, CalendarDays as MeetingIcon, CheckCircle2, FileText } from "lucide-react";
import { Link } from "wouter";
import { CollapsibleSection } from "./CollapsibleSection";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";

export function AccommodationComplianceCard({ accommodationCompliance }: { accommodationCompliance: any }) {
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
              <div className="text-2xl font-bold text-gray-900">{accommodationCompliance.overallComplianceRate}%</div>
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

export function EvalsTransitionsSection({ evalDash, transitionDash }: { evalDash: any; transitionDash: any }) {
  return (
    <CollapsibleSection title="Evaluations & Transitions" icon={FileSearch}>
      {evalDash && (evalDash.overdueEvaluations > 0 || evalDash.overdueReEvaluations > 0 || evalDash.openReferrals > 0) && (
        <Card className={evalDash.overdueEvaluations > 0 || evalDash.overdueReEvaluations > 0 ? "border-red-200 bg-red-50/20" : "border-amber-200 bg-amber-50/20"}>
          <CardContent className="py-3 px-5 flex items-center gap-4 flex-wrap">
            <FileSearch className={`w-5 h-5 flex-shrink-0 ${evalDash.overdueEvaluations > 0 ? "text-red-500" : "text-amber-500"}`} />
            <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap text-[12px]">
              {evalDash.openReferrals > 0 && <span className="text-gray-600"><b className="text-gray-800">{evalDash.openReferrals}</b> open referral{evalDash.openReferrals !== 1 ? "s" : ""}</span>}
              {evalDash.overdueEvaluations > 0 && <span className="text-red-700 font-semibold">{evalDash.overdueEvaluations} overdue evaluation{evalDash.overdueEvaluations !== 1 ? "s" : ""}</span>}
              {evalDash.upcomingReEvaluations > 0 && <span className="text-amber-700">{evalDash.upcomingReEvaluations} re-eval{evalDash.upcomingReEvaluations !== 1 ? "s" : ""} due within 90 days</span>}
              {evalDash.overdueReEvaluations > 0 && <span className="text-red-700 font-semibold">{evalDash.overdueReEvaluations} overdue re-eval{evalDash.overdueReEvaluations !== 1 ? "s" : ""}</span>}
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
      )}

      {(evalDash && !(evalDash.overdueEvaluations > 0 || evalDash.overdueReEvaluations > 0 || evalDash.openReferrals > 0))
        && (transitionDash && !(transitionDash.missingPlan > 0 || transitionDash.approachingTransitionAge > 0 || transitionDash.overdueFollowups > 0))
        && (
        <p className="text-sm text-gray-400 py-4 text-center">All evaluations and transitions are on track.</p>
      )}
    </CollapsibleSection>
  );
}

export function MeetingsSection({ meetingDash }: { meetingDash: any }) {
  return (
    <CollapsibleSection title="IEP Meetings" icon={MeetingIcon}>
      {meetingDash && (meetingDash.overdueCount > 0 || meetingDash.thisWeekCount > 0 || meetingDash.pendingConsentCount > 0) ? (
        <Card className={meetingDash.overdueCount > 0 ? "border-red-200 bg-red-50/20" : "border-gray-200/60"}>
          <CardContent className="py-3 px-5 flex items-center gap-4 flex-wrap">
            <MeetingIcon className={`w-5 h-5 flex-shrink-0 ${meetingDash.overdueCount > 0 ? "text-red-500" : "text-emerald-500"}`} />
            <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap text-[12px]">
              {meetingDash.overdueCount > 0 && <span className="text-red-700 font-semibold">{meetingDash.overdueCount} overdue meeting{meetingDash.overdueCount !== 1 ? "s" : ""}</span>}
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
}

const BAND_CONFIG = [
  { label: "Expiring within 30 days", min: 0, max: 30, bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500", text: "text-red-700", badgeBg: "bg-red-100", badgeText: "text-red-700" },
  { label: "Expiring in 31–60 days",  min: 31, max: 60, bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-400", text: "text-amber-700", badgeBg: "bg-amber-100", badgeText: "text-amber-700" },
  { label: "Expiring in 61–90 days",  min: 61, max: 90, bg: "bg-yellow-50", border: "border-yellow-200", dot: "bg-yellow-400", text: "text-yellow-700", badgeBg: "bg-yellow-100", badgeText: "text-yellow-700" },
] as const;

export function IepExpirationCard({ enabled = true }: { enabled?: boolean }) {
  const { filterParams } = useSchoolContext();
  const qs = new URLSearchParams(filterParams).toString();

  const { data, isLoading } = useQuery<IepExpiration[]>({
    queryKey: ["dashboard/iep-expirations", filterParams],
    queryFn: () =>
      authFetch(`/api/dashboard/iep-expirations${qs ? `?${qs}` : ""}`).then((r) =>
        r.ok ? r.json() : []
      ),
    staleTime: 120_000,
    enabled,
  });

  const students = data ?? [];
  const total = students.length;

  const formatDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <Card className="border-gray-200/60" data-testid="iep-expiration-card">
      <CardHeader className="pb-0 flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          <CardTitle className="text-sm font-semibold text-gray-600">IEP Renewals Due</CardTitle>
          {total > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              {total} expiring soon
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : total === 0 ? (
          <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-emerald-50 border border-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="text-sm font-medium text-emerald-700">All IEPs current — no renewals due in the next 90 days.</span>
          </div>
        ) : (
          <div className="space-y-4">
            {BAND_CONFIG.map((band) => {
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
                      <Link key={s.studentId} href={`/students/${s.studentId}/iep`}>
                        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${band.bg} ${band.border} hover:brightness-95 transition-all cursor-pointer`}>
                          <div className="flex-1 min-w-0">
                            <span className="text-[13px] font-medium text-gray-800 truncate block">{s.studentName}</span>
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
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
