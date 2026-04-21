import type { Dispatch, SetStateAction } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { IoaSummary } from "@/components/aba-graph";
import SupportIntensityCard from "@/components/support-intensity/SupportIntensityCard";
import PreferenceAssessmentCard from "@/components/preference-assessment/PreferenceAssessmentCard";
import ReinforcerInventoryPanel from "@/components/preference-assessment/ReinforcerInventoryPanel";
import StudentBehaviorSection from "../StudentBehaviorSection";
import StudentComplianceSection from "../StudentComplianceSection";

interface Props {
  studentId: number;
  hasNonIepData: boolean;
  dataLoading: boolean;
  nonIepBehaviorTargets: any[];
  nonIepProgramTargets: any[];
  behaviorTrends: any[];
  programTrends: any[];
  behaviorPhaseLines: Record<number, { id: string; date: string; label: string; color?: string }[]>;
  setBehaviorPhaseLines: Dispatch<SetStateAction<Record<number, { id: string; date: string; label: string; color?: string }[]>>>;
  programPhaseLines: Record<number, { id: string; date: string; label: string; color?: string }[]>;
  setProgramPhaseLines: Dispatch<SetStateAction<Record<number, { id: string; date: string; label: string; color?: string }[]>>>;
  phaseChangesByTarget: Record<number, any[]>;
  goalAbaView: Record<string | number, boolean>;
  setGoalAbaView: Dispatch<SetStateAction<Record<string | number, boolean>>>;
  loadPhaseChanges: () => void;
  getBehaviorTrendData: (targetId: number) => any[];
  getProgramTrendData: (targetId: number) => any[];
  getTrendDirection: (data: { value: number }[]) => string;
  behaviorTargets: any[];
  protectiveData: any;
  formatDate: (d: string) => string;
}

export default function TabBehavior(props: Props) {
  const {
    studentId, hasNonIepData, dataLoading, nonIepBehaviorTargets,
    nonIepProgramTargets, behaviorTrends, programTrends,
    behaviorPhaseLines, setBehaviorPhaseLines, programPhaseLines,
    setProgramPhaseLines, phaseChangesByTarget, goalAbaView, setGoalAbaView,
    loadPhaseChanges, getBehaviorTrendData, getProgramTrendData,
    getTrendDirection, behaviorTargets, protectiveData, formatDate,
  } = props;

  return (
    <div className="space-y-5">
      <SupportIntensityCard studentId={studentId} />
      <StudentBehaviorSection
        hasNonIepData={hasNonIepData}
        dataLoading={dataLoading}
        nonIepBehaviorTargets={nonIepBehaviorTargets}
        nonIepProgramTargets={nonIepProgramTargets}
        behaviorTrends={behaviorTrends}
        programTrends={programTrends}
        behaviorPhaseLines={behaviorPhaseLines}
        setBehaviorPhaseLines={setBehaviorPhaseLines}
        programPhaseLines={programPhaseLines}
        setProgramPhaseLines={setProgramPhaseLines}
        phaseChangesByTarget={phaseChangesByTarget}
        goalAbaView={goalAbaView}
        setGoalAbaView={setGoalAbaView}
        loadPhaseChanges={loadPhaseChanges}
        getBehaviorTrendData={getBehaviorTrendData}
        getProgramTrendData={getProgramTrendData}
        getTrendDirection={getTrendDirection}
      />
      {behaviorTargets.length > 0 && !dataLoading && (
        <Card className="border-gray-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-400" />
              Inter-Observer Agreement (IOA)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <IoaSummary studentId={studentId} />
          </CardContent>
        </Card>
      )}
      <PreferenceAssessmentCard studentId={studentId} />
      <ReinforcerInventoryPanel studentId={studentId} />
      <StudentComplianceSection
        section="protective"
        studentId={studentId}
        protectiveData={protectiveData}
        formatDate={formatDate}
      />
    </div>
  );
}
