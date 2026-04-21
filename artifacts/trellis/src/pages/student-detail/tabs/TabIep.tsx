import type { Dispatch, SetStateAction } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gift } from "lucide-react";
import StudentGoalSection from "../StudentGoalSection";
import StudentServiceSection from "../StudentServiceSection";
import StudentComplianceSection from "../StudentComplianceSection";

interface Props {
  studentId: number;
  s: any;
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
  chartData: any[];
  minutesExpanded: boolean;
  setMinutesExpanded: Dispatch<SetStateAction<boolean>>;
  minutesTrend: any[];
  minutesPhaseLines: { id: string; date: string; label: string; color?: string }[];
  setMinutesPhaseLines: Dispatch<SetStateAction<{ id: string; date: string; label: string; color?: string }[]>>;
  progressList: any[];
  isEditable: boolean;
  services: any;
  assignments: any;
  compSummary: any;
  compFinancial: { exposure: number; totalOwed: number } | null;
  transitionData: any;
}

export default function TabIep(props: Props) {
  const {
    studentId, s, goalProgress, dataLoading, behaviorTargets, behaviorTrends,
    programTrends, phaseChangesByTarget, goalAbaView, setGoalAbaView,
    loadPhaseChanges, annotationsByGoal, onAddAnnotation, onRemoveAnnotation,
    chartData, minutesExpanded, setMinutesExpanded, minutesTrend,
    minutesPhaseLines, setMinutesPhaseLines, progressList, isEditable,
    services, assignments, compSummary, compFinancial, transitionData,
  } = props;

  return (
    <div className="space-y-5">
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
      <StudentServiceSection
        chartData={chartData}
        minutesExpanded={minutesExpanded}
        setMinutesExpanded={setMinutesExpanded}
        minutesTrend={minutesTrend}
        minutesPhaseLines={minutesPhaseLines}
        setMinutesPhaseLines={setMinutesPhaseLines}
        progressList={progressList}
        isEditable={isEditable}
        student={s}
        openAddSvc={services.openAddSvc}
        openEditSvc={services.openEditSvc}
        setDeletingSvc={services.setDeletingSvc}
        openAssignDialog={assignments.openAssignDialog}
        handleRemoveAssignment={assignments.handleRemoveAssignment}
      />
      {compSummary && compSummary.counts?.total > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-600" />
                Compensatory Services
              </CardTitle>
              <div className="flex items-center gap-2">
                <Link href="/compensatory?view=finance" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                  Financial View
                </Link>
                <Link href={`/compensatory?studentId=${studentId}`} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                  View All →
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {compSummary.totalRemaining > 0 && (
              <div className="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-amber-800">Financial Exposure</p>
                  {compFinancial ? (
                    <p className="text-sm font-bold text-amber-900">
                      ${compFinancial.exposure.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  ) : (
                    <p className="text-xs font-semibold text-amber-900">Rate not configured</p>
                  )}
                </div>
                <p className="text-[10px] text-amber-600 mt-0.5">
                  {compFinancial ? (
                    "Based on configured district rates"
                  ) : (
                    <>
                      {compSummary.totalRemaining} min owed.{" "}
                      <Link href="/compensatory?view=finance&tab=rates" className="underline font-medium">
                        Set hourly rates
                      </Link>{" "}
                      to compute dollar exposure.
                    </>
                  )}
                </p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-gray-800">{compSummary.totalRemaining}</p>
                <p className="text-[10px] text-gray-400">Min Remaining</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-emerald-700">{compSummary.totalDelivered}</p>
                <p className="text-[10px] text-gray-400">Min Delivered</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-gray-800">{compSummary.counts.pending + compSummary.counts.inProgress}</p>
                <p className="text-[10px] text-gray-400">Active</p>
              </div>
            </div>
            {compSummary.obligations?.length > 0 && (
              <div className="space-y-1.5">
                {compSummary.obligations.slice(0, 5).map((ob: any) => {
                  const pct = ob.minutesOwed > 0 ? Math.round((ob.minutesDelivered / ob.minutesOwed) * 100) : 0;
                  return (
                    <div key={ob.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700">{ob.serviceTypeName || "Service"}</p>
                        <p className="text-[10px] text-gray-400">
                          {ob.minutesRemaining} min remaining · {ob.status.replace(/_/g, " ")}
                        </p>
                      </div>
                      <div className="w-16">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <p className="text-[9px] text-gray-400 text-right mt-0.5">{pct}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <StudentComplianceSection
        section="transition"
        studentId={studentId}
        transitionData={transitionData}
      />
    </div>
  );
}
