import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth-fetch";
import { formatDate } from "@/lib/formatters";
import {
  FileSearch, ClipboardList, Calendar, AlertTriangle,
  Clock, Timer,
} from "lucide-react";
import { statusBadge, deadlineBadge, MetricCard, TimelineStep } from "./shared";
import type { DashboardData } from "./types";

export function EvalDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/evaluations/dashboard")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d as DashboardData); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>;
  if (!data) return <p className="text-sm text-gray-400 py-8 text-center">Failed to load dashboard.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Open Referrals" value={data.openReferrals} icon={FileSearch} color="blue" />
        <MetricCard label="Pending Consent" value={data.pendingConsent} icon={Clock} color="amber" />
        <MetricCard label="Active Evaluations" value={data.activeEvaluations} icon={ClipboardList} color="blue" />
        <MetricCard label="Overdue Evaluations" value={data.overdueEvaluations} icon={AlertTriangle} color={data.overdueEvaluations > 0 ? "red" : "emerald"} />
        <MetricCard label="Re-Evals Due (90d)" value={data.upcomingReEvaluations} icon={Calendar} color="amber" />
        <MetricCard label="Overdue Re-Evals" value={data.overdueReEvaluations} icon={Timer} color={data.overdueReEvaluations > 0 ? "red" : "emerald"} />
      </div>

      {data.overdueReferralDeadlines.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Overdue Evaluation Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.overdueReferralDeadlines.map(r => (
              <div key={r.id} className="flex items-center justify-between text-[12px] py-1.5 border-b border-gray-50 last:border-0">
                <span className="font-medium text-gray-700">{r.studentName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">Deadline: {r.deadline}</span>
                  {statusBadge(`${r.daysOverdue}d overdue`, "red")}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.upcomingReEvalList.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-amber-700 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Upcoming Re-Evaluations (within 90 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.upcomingReEvalList.map(r => (
              <div key={r.id} className="flex items-center justify-between text-[12px] py-1.5 border-b border-amber-100 last:border-0">
                <div>
                  <span className="font-medium text-gray-700">{r.studentName}</span>
                  {r.primaryDisability && <span className="text-gray-400 ml-2">{r.primaryDisability}</span>}
                </div>
                <div className="flex items-center gap-3">
                  {r.nextReEvalDate && <span className="text-gray-400">Due: {formatDate(r.nextReEvalDate)}</span>}
                  {deadlineBadge(r.daysUntilReEval)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-emerald-50/30 border-emerald-100">
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
              Active Timeline Rule: {data.timelineRule.label}
            </p>
            <span className="text-[10px] text-gray-400">{data.timelineRule.schoolDays} school days from consent</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
            <TimelineStep step="1" label="Referral Received" desc="Parent/teacher/team submits referral" />
            <TimelineStep step="2" label="Consent Obtained" desc="Written parental consent for evaluation" />
            <TimelineStep step="3" label={`Evaluation (${data.timelineRule.schoolDays} school days)`} desc="Assessments completed within deadline" />
            <TimelineStep step="4" label="Eligibility Meeting" desc="Team determines eligibility & disability" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
