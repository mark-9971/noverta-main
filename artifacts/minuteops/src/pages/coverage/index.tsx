import { useState } from "react";
import { Redirect } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useSchoolContext } from "@/lib/school-context";
import { UserX, AlertTriangle, BarChart2, History, FileText } from "lucide-react";
import { UncoveredTab } from "./UncoveredTab";
import { AbsencesTab } from "./AbsencesTab";
import { WorkloadTab } from "./WorkloadTab";
import { HistoryTab } from "./HistoryTab";
import { ReportTab } from "./ReportTab";
import { DailySummary } from "./DailySummary";
import type { CoverageTab } from "./utils";

const COVERAGE_ROLES = ["admin", "coordinator", "case_manager"];

export default function CoveragePage() {
  const { role } = useRole();
  const [tab, setTab] = useState<CoverageTab>("uncovered");
  const { typedFilter } = useSchoolContext();
  const schoolId = (typedFilter as any)?.schoolId ? Number((typedFilter as any).schoolId) : null;

  if (!COVERAGE_ROLES.includes(role)) return <Redirect to="/" />;

  const tabs: { key: CoverageTab; label: string; icon: React.ElementType }[] = [
    { key: "uncovered", label: "Uncovered Sessions", icon: AlertTriangle },
    { key: "absences", label: "Staff Absences", icon: UserX },
    { key: "history", label: "Coverage Log", icon: History },
    { key: "report", label: "Usage Report", icon: FileText },
    { key: "workload", label: "Workload", icon: BarChart2 },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold text-gray-900">Coverage & Substitutes</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Track absences, assign substitutes, and monitor coverage patterns.
        </p>
      </div>

      <DailySummary schoolId={schoolId} />

      <Card>
        <CardHeader className="pb-0 pt-4 px-4">
          <div className="flex gap-1 border-b border-gray-100 pb-0 -mb-px overflow-x-auto">
            {tabs.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                    tab === t.key
                      ? "border-emerald-600 text-emerald-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {tab === "uncovered" && <UncoveredTab schoolId={schoolId} />}
          {tab === "absences" && <AbsencesTab schoolId={schoolId} />}
          {tab === "history" && <HistoryTab schoolId={schoolId} />}
          {tab === "report" && <ReportTab schoolId={schoolId} />}
          {tab === "workload" && <WorkloadTab schoolId={schoolId} />}
        </CardContent>
      </Card>
    </div>
  );
}
