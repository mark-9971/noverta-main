import type { Dispatch, SetStateAction } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { CheckCircle, XCircle, TrendingUp, AlertTriangle, Clock, Bell } from "lucide-react";
import StudentSnapshot from "@/components/student-snapshot";
import StudentGoalSection from "../StudentGoalSection";
import StudentMedicaidField from "../StudentMedicaidField";
import RecommendedNextStepCard from "@/components/recommended-next-step-card";
import { deriveStudentTopSignal } from "@/lib/student-top-signal";

interface Props {
  studentId: number;
  s: any;
  reEvalStatus: any;
  atRiskServices: any[];
  worstRisk: string;
  goalProgress: any[];
  dataLoading: boolean;
  behaviorTargets: any[];
  behaviorTrends: any[];
  programTrends: any[];
  phaseChangesByTarget: Record<number, any[]>;
  goalAbaView: Record<string | number, boolean>;
  setGoalAbaView: Dispatch<SetStateAction<Record<string | number, boolean>>>;
  loadPhaseChanges: () => void;
  annotationsByGoal: Record<number, any[]>;
  onAddAnnotation: (goalId: number, date: string, label: string) => Promise<void>;
  onRemoveAnnotation: (id: number) => Promise<void>;
  overallPct: number;
  riskCfg: any;
  totalDelivered: number;
  totalRequired: number;
  completedSessions: number;
  missedSessions: number;
  caps: any;
  refetchStudent: () => void;
  /** Phase 1C — passed through so the Recommended Next Step card can
   *  derive a top operational signal without refetching anything. */
  currentUserRole?: string;
  currentUserKey: string;
  onLogSessionForRecommendation?: () => void;
}

export default function TabSummary(props: Props) {
  const {
    studentId, s, reEvalStatus, atRiskServices, worstRisk, goalProgress,
    dataLoading, behaviorTargets, behaviorTrends, programTrends,
    phaseChangesByTarget, goalAbaView, setGoalAbaView, loadPhaseChanges,
    annotationsByGoal, onAddAnnotation, onRemoveAnnotation,
    overallPct, riskCfg, totalDelivered, totalRequired,
    completedSessions, missedSessions, caps, refetchStudent,
    currentUserRole, currentUserKey, onLogSessionForRecommendation,
  } = props;

  // Phase 1C — Recommended Next Step. Reuses the centralized
  // recommendation engine; returns null when nothing material is
  // wrong so the card simply doesn't render.
  const top = deriveStudentTopSignal(studentId, {
    atRiskServices,
    missedSessions,
    reEvalStatus,
  });

  return (
    <div className="space-y-5">
      {top && (
        <RecommendedNextStepCard
          studentId={studentId}
          signal={top.signal}
          itemId={top.itemId}
          whySummary={top.whySummary}
          additionalIssueCount={top.additionalIssueCount}
          currentUserRole={currentUserRole}
          userKey={currentUserKey}
          onLogSession={onLogSessionForRecommendation}
        />
      )}

      {reEvalStatus?.hasEligibility && reEvalStatus.reEvalStatus && (reEvalStatus.reEvalStatus.urgency === "overdue" || reEvalStatus.reEvalStatus.urgency === "upcoming") && (
        <Card className={reEvalStatus.reEvalStatus.urgency === "overdue" ? "border-red-200 bg-red-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardContent className="py-3 px-5 flex items-center gap-3">
            {reEvalStatus.reEvalStatus.urgency === "overdue" ? <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" /> : <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold ${reEvalStatus.reEvalStatus.urgency === "overdue" ? "text-red-700" : "text-amber-700"}`}>
                {reEvalStatus.reEvalStatus.urgency === "overdue" ? "Re-Evaluation Overdue" : "Re-Evaluation Coming Up"}
              </p>
              <p className="text-[11px] text-gray-500">
                {reEvalStatus.reEvalStatus.primaryDisability ? `${reEvalStatus.reEvalStatus.primaryDisability} · ` : ""}
                Next re-eval due: {reEvalStatus.reEvalStatus.nextReEvalDate ?? "—"}
                {reEvalStatus.reEvalStatus.daysUntilReEval !== null && (
                  reEvalStatus.reEvalStatus.daysUntilReEval < 0
                    ? ` (${Math.abs(reEvalStatus.reEvalStatus.daysUntilReEval)} days overdue)`
                    : ` (${reEvalStatus.reEvalStatus.daysUntilReEval} days remaining)`
                )}
                {` · ${reEvalStatus.reEvalStatus.reEvalCycleMonths}-month cycle`}
              </p>
            </div>
            <Link href="/evaluations" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
              View Evaluations →
            </Link>
          </CardContent>
        </Card>
      )}

      {atRiskServices.length > 0 && (
        <Card className={worstRisk === "out_of_compliance" ? "border-red-200 bg-red-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardContent className="py-3 px-5">
            <div className="flex items-center gap-3 mb-2">
              <Bell className={`w-5 h-5 flex-shrink-0 ${worstRisk === "out_of_compliance" ? "text-red-500" : "text-amber-500"}`} />
              <p className={`text-[13px] font-semibold ${worstRisk === "out_of_compliance" ? "text-red-700" : "text-amber-700"}`}>
                {worstRisk === "out_of_compliance" ? "Service Minutes — Compliance Alert" : "Service Minutes — Approaching Shortfall"}
              </p>
            </div>
            <div className="space-y-1 ml-8">
              {atRiskServices.map((p: any) => {
                const pct = p.requiredMinutes > 0 ? Math.round((p.deliveredMinutes / p.requiredMinutes) * 100) : 0;
                const deficit = (p.requiredMinutes ?? 0) - (p.deliveredMinutes ?? 0);
                const statusLabel = p.riskStatus === "out_of_compliance" ? "Out of Compliance" : p.riskStatus === "at_risk" ? "At Risk" : "Slightly Behind";
                const statusColor = p.riskStatus === "out_of_compliance" ? "text-red-600" : p.riskStatus === "at_risk" ? "text-amber-600" : "text-yellow-600";
                return (
                  <div key={p.serviceRequirementId} className="flex items-center gap-2 text-[11px]">
                    <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-600">{p.serviceTypeName}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500">{p.deliveredMinutes}/{p.requiredMinutes} min ({pct}%)</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500">{deficit} min remaining</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <StudentSnapshot studentId={studentId} />

      <StudentGoalSection
        goalProgress={goalProgress}
        dataLoading={dataLoading}
        behaviorTargets={behaviorTargets}
        behaviorTrends={behaviorTrends}
        programTrends={programTrends}
        phaseChangesByTarget={phaseChangesByTarget}
        goalAbaView={goalAbaView}
        setGoalAbaView={setGoalAbaView}
        loadPhaseChanges={loadPhaseChanges}
        student={s}
        annotationsByGoal={annotationsByGoal}
        onAddAnnotation={onAddAnnotation}
        onRemoveAnnotation={onRemoveAnnotation}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardContent className="p-3.5 md:p-5 flex items-center gap-3 md:gap-4">
            <ProgressRing value={overallPct} size={56} strokeWidth={6} color={riskCfg.ringColor} />
            <div>
              <p className="text-2xl font-bold text-gray-800">{overallPct}%</p>
              <p className="text-[11px] text-gray-400">Overall Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center" aria-hidden="true">
              <TrendingUp className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{totalDelivered}<span className="text-sm text-gray-400 font-normal"> / {totalRequired}</span></p>
              <p className="text-[11px] text-gray-400">Minutes Delivered</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center" aria-hidden="true">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{completedSessions}</p>
              <p className="text-[11px] text-gray-400">Completed Sessions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center" aria-hidden="true">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{missedSessions}</p>
              <p className="text-[11px] text-gray-400">Missed Sessions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {caps.editMedicaidId && s && (
        <StudentMedicaidField student={s} onSave={() => refetchStudent()} />
      )}
    </div>
  );
}
