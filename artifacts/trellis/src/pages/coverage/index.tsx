import { useState } from "react";
import { Redirect } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSchoolContext } from "@/lib/school-context";
import { UserX, AlertTriangle, BarChart2, History, FileText, ArrowLeftRight, Printer } from "lucide-react";
import { UncoveredTab } from "./UncoveredTab";
import { AbsencesTab } from "./AbsencesTab";
import { WorkloadTab } from "./WorkloadTab";
import { HistoryTab } from "./HistoryTab";
import { ReportTab } from "./ReportTab";
import { DailySummary } from "./DailySummary";
import { ChangeRequestsTab } from "./ChangeRequestsTab";
import type { CoverageTab } from "./utils";
import { today } from "./utils";
import { authFetch } from "@/lib/auth-fetch";
import { buildDailyCoverageReportHtml, openPrintWindow } from "@/lib/print-document";
import { toast } from "sonner";

const COVERAGE_ROLES = ["admin", "coordinator", "case_manager"];

export default function CoveragePage({ embedded = false }: { embedded?: boolean } = {}) {
  const { role } = useRole();
  const [tab, setTab] = useState<CoverageTab>("uncovered");
  const [printing, setPrinting] = useState(false);
  const { typedFilter } = useSchoolContext();
  const schoolId = (typedFilter as any)?.schoolId ? Number((typedFilter as any).schoolId) : null;

  if (!COVERAGE_ROLES.includes(role)) return <Redirect to="/" />;

  async function handlePrintDailyReport() {
    setPrinting(true);
    try {
      const date = today();
      const params = new URLSearchParams({ date });
      if (schoolId) params.set("schoolId", String(schoolId));

      const uncoveredParams = new URLSearchParams({ startDate: date, endDate: date });
      if (schoolId) uncoveredParams.set("schoolId", String(schoolId));

      const historyParams = new URLSearchParams({ startDate: date, endDate: date });
      if (schoolId) historyParams.set("schoolId", String(schoolId));

      const [summaryRes, uncoveredRes, historyRes] = await Promise.all([
        authFetch(`/api/coverage/summary?${params}`),
        authFetch(`/api/schedule-blocks/uncovered?${uncoveredParams}`),
        authFetch(`/api/coverage/history?${historyParams}`),
      ]);

      const [summary, uncoveredSessions, coveredSessions] = await Promise.all([
        summaryRes.json(),
        uncoveredRes.json(),
        historyRes.json(),
      ]);

      const allSessions = [
        ...(Array.isArray(uncoveredSessions) ? uncoveredSessions.map((s: any) => ({
          absenceDate: s.absenceDate ?? null,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          studentName: s.studentName ?? null,
          serviceTypeName: s.serviceTypeName ?? null,
          originalStaffName: s.originalStaffName ?? null,
          substituteStaffName: s.substituteStaffName ?? null,
          isCovered: false,
          location: s.location ?? null,
        })) : []),
        ...(Array.isArray(coveredSessions) ? coveredSessions.map((s: any) => ({
          absenceDate: s.absenceDate ?? null,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          studentName: s.studentName ?? null,
          serviceTypeName: s.serviceTypeName ?? null,
          originalStaffName: s.originalStaffName ?? null,
          substituteStaffName: s.substituteStaffName ?? null,
          isCovered: true,
          location: s.location ?? null,
        })) : []),
      ];

      const html = buildDailyCoverageReportHtml({
        date,
        summary,
        sessions: allSessions,
      });

      openPrintWindow(html);
    } catch {
      toast.error("Failed to generate coverage report");
    } finally {
      setPrinting(false);
    }
  }

  const tabs: { key: CoverageTab; label: string; icon: React.ElementType }[] = [
    { key: "uncovered", label: "Uncovered Sessions", icon: AlertTriangle },
    { key: "absences", label: "Staff Absences", icon: UserX },
    { key: "history", label: "Coverage Log", icon: History },
    { key: "report", label: "Usage Report", icon: FileText },
    { key: "workload", label: "Workload", icon: BarChart2 },
    { key: "change_requests", label: "Change Requests", icon: ArrowLeftRight },
  ];

  return (
    <div className={embedded ? "space-y-4 md:space-y-6" : "p-4 md:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-4 md:space-y-6"}>
      {!embedded && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[18px] font-semibold text-gray-900">Coverage & Substitutes</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Track absences, assign substitutes, and monitor coverage patterns.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 shrink-0"
            onClick={handlePrintDailyReport}
            disabled={printing}
          >
            <Printer className="h-3.5 w-3.5" />
            {printing ? "Preparing…" : "Print Daily Report"}
          </Button>
        </div>
      )}

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
          {tab === "change_requests" && <ChangeRequestsTab schoolId={schoolId} />}
        </CardContent>
      </Card>
    </div>
  );
}
