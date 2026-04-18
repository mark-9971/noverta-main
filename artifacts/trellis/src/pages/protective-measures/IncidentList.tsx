import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Shield, Plus, AlertTriangle, Clock, Search,
  ChevronRight, Bell, Download, PenLine, Send, Zap,
  Phone,
} from "lucide-react";
import { listProtectiveIncidents, getProtectiveSummary } from "@workspace/api-client-react";
import { useRole } from "@/lib/role-context";
import { EmptyState, EmptyStateStep, EmptyStateHeading, EmptyStateDetail } from "@/components/ui/empty-state";
import { DemoEmptyState } from "@/components/DemoEmptyState";
import { StudentQuickView } from "@/components/student-quick-view";
import { TrendsPanel } from "@/pages/protective-measures/TrendsPanel";
import {
  Incident, Summary,
  TYPE_LABELS, TYPE_COLORS, STATUS_LABELS, STATUS_COLORS,
  formatDate, formatTime, hoursUntilDeadline,
} from "@/pages/protective-measures/constants";

export function IncidentList({ filterType, setFilterType, filterStatus, setFilterStatus, searchTerm, setSearchTerm, onNew, onQuick, onDetail }: {
  filterType: string; setFilterType: (v: string) => void;
  filterStatus: string; setFilterStatus: (v: string) => void;
  searchTerm: string; setSearchTerm: (v: string) => void;
  onNew: () => void;
  onQuick: () => void;
  onDetail: (id: number) => void;
}) {
  const { role } = useRole();
  const showTrends = role === "admin" || role === "coordinator";
  const showDeseExports = role === "admin" || role === "coordinator";
  const [exportYear, setExportYear] = useState(() => {
    const now = new Date();
    const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-${y + 1}`;
  });
  const [exportMonth, setExportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ["protective-incidents", filterType, filterStatus],
    queryFn: ({ signal }) => listProtectiveIncidents({
      ...(filterType !== "all" ? { incidentType: filterType } : {}),
      ...(filterStatus !== "all" ? { status: filterStatus } : {}),
    }, { signal }) as Promise<Incident[]>,
  });

  const { data: _summaryData } = useQuery({
    queryKey: ["protective-summary"],
    queryFn: ({ signal }) => getProtectiveSummary(undefined, { signal }),
  });
  const summary = _summaryData as Summary | undefined;

  const filtered = useMemo(() => {
    if (!searchTerm) return incidents;
    const lower = searchTerm.toLowerCase();
    return incidents.filter(i =>
      `${i.studentFirstName} ${i.studentLastName}`.toLowerCase().includes(lower) ||
      i.behaviorDescription.toLowerCase().includes(lower)
    );
  }, [incidents, searchTerm]);

  const handleDeseExport = () => {
    window.open(`/api/protective-measures/dese-export?schoolYear=${exportYear}`, "_blank");
  };

  const handleMonthlyDeseExport = () => {
    window.open(`/api/protective-measures/incidents/dese-export-bulk?month=${exportMonth}`, "_blank");
  };

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6" data-tour-id="showcase-protective-measures">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-700" />
            Protective Measures
          </h1>
          <p className="text-sm text-gray-500 mt-1">Restraint & seclusion tracking · 603 CMR 46.00</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {showDeseExports && (
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
              <input
                type="month"
                value={exportMonth}
                onChange={e => setExportMonth(e.target.value)}
                className="text-xs bg-transparent border-none focus:outline-none text-gray-600"
              />
              <button onClick={handleMonthlyDeseExport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 transition-colors"
                title="Download 30-day DESE incident log for selected month (603 CMR 46.03(3))">
                <Download className="w-3.5 h-3.5" /> Monthly DESE Log
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
            <select value={exportYear} onChange={e => setExportYear(e.target.value)}
              className="text-xs bg-transparent border-none focus:outline-none text-gray-600">
              {(() => {
                const now = new Date();
                const cy = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
                return [0, 1, 2].map(i => {
                  const y = cy - i;
                  return <option key={y} value={`${y}-${y + 1}`}>SY {y}-{String(y + 1).slice(2)}</option>;
                });
              })()}
            </select>
            <button onClick={handleDeseExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 transition-colors">
              <Download className="w-3.5 h-3.5" /> DESE Export
            </button>
          </div>
          <button onClick={onQuick} className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors shadow-sm">
            <Zap className="w-4 h-4" /> Quick Report
          </button>
          <button onClick={onNew} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Report Incident
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard
            label="Total Incidents"
            value={summary.totalIncidents}
            icon={<Shield className="w-4 h-4 text-gray-400" />}
            detail={[
              summary.byType.physical_restraint > 0 ? `${summary.byType.physical_restraint} restraint${summary.byType.physical_restraint !== 1 ? "s" : ""}` : null,
              summary.byType.seclusion > 0 ? `${summary.byType.seclusion} seclusion${summary.byType.seclusion !== 1 ? "s" : ""}` : null,
              summary.byType.time_out > 0 ? `${summary.byType.time_out} time-out${summary.byType.time_out !== 1 ? "s" : ""}` : null,
            ].filter(Boolean).join(" · ") || undefined}
          />
          <SummaryCard
            label="Needs Review"
            value={summary.pendingReview}
            icon={<Clock className="w-4 h-4 text-amber-400" />}
            color={summary.pendingReview > 0 ? "text-amber-600" : "text-gray-600"}
          />
          <SummaryCard
            label="Pending Signatures"
            value={summary.pendingSignatures || 0}
            icon={<PenLine className="w-4 h-4 text-amber-400" />}
            color={(summary.pendingSignatures || 0) > 0 ? "text-amber-600" : "text-gray-600"}
          />
          <SummaryCard
            label="Action Items Due"
            value={summary.parentNotificationsPending + summary.writtenReportsPending}
            icon={<Bell className="w-4 h-4 text-red-400" />}
            color={summary.parentNotificationsPending + summary.writtenReportsPending > 0 ? "text-red-600" : "text-gray-600"}
            detail={`${summary.parentNotificationsPending} notices · ${summary.writtenReportsPending} reports`}
          />
          <SummaryCard
            label="DESE Reports Due"
            value={summary.deseReportsPending}
            icon={<Send className="w-4 h-4 text-amber-400" />}
            color={summary.deseReportsPending > 0 ? "text-amber-600" : "text-gray-600"}
          />
        </div>
      )}

      {summary && summary.studentsWithMultipleIncidents.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold mb-1">
            <AlertTriangle className="w-4 h-4" />
            Weekly Review Required: Students with 3+ incidents
          </div>
          <p className="text-xs text-amber-700">
            {summary.studentsWithMultipleIncidents.length} student{summary.studentsWithMultipleIncidents.length > 1 ? "s" : ""} require review team assessment per 603 CMR 46.06(5).
          </p>
        </div>
      )}

      {showTrends && <TrendsPanel />}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search by student name or description..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
        </div>
        <div className="flex gap-2">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
            <option value="all">All Types</option>
            <option value="physical_restraint">Physical Restraint</option>
            <option value="seclusion">Seclusion</option>
            <option value="time_out">Time-Out</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="under_review">Under Review</option>
            <option value="resolved">Resolved</option>
            <option value="dese_reported">DESE Reported</option>
            <option value="notification_pending">Notifications Pending</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading incidents...</div>
        ) : filtered.length === 0 ? (
          <DemoEmptyState setupHint="Restraint and seclusion incidents are reported by school staff as they happen, then routed for parent notification and DESE compliance. The sample dataset has none — and that is intentional.">
            <EmptyState
              icon={Shield}
              title="No Restraint or Seclusion Incidents"
              compact
            >
              <EmptyStateDetail>
                Massachusetts regulation 603 CMR 46.00 requires districts to document every restraint, seclusion, and time-out event involving a student. This page tracks those incidents for compliance and reporting.
              </EmptyStateDetail>
              <EmptyStateHeading>When to record an incident:</EmptyStateHeading>
              <EmptyStateStep number={1}><strong>Physical restraint</strong> — any bodily force used to limit a student's movement.</EmptyStateStep>
              <EmptyStateStep number={2}><strong>Seclusion</strong> — involuntary confinement in a room the student cannot leave.</EmptyStateStep>
              <EmptyStateStep number={3}><strong>Time-out</strong> — removal from the classroom to a separate area.</EmptyStateStep>
              <EmptyStateDetail>
                Trellis tracks parent notification deadlines, DESE reporting requirements, and helps ensure your district meets the 24-hour verbal and 5-day written notice timelines.
              </EmptyStateDetail>
            </EmptyState>
          </DemoEmptyState>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(inc => (
              <button key={inc.id} onClick={() => onDetail(inc.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors text-left">
                <div className="flex-shrink-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${inc.incidentType === "physical_restraint" ? "bg-red-100" : inc.incidentType === "seclusion" ? "bg-amber-100" : "bg-amber-50"}`}>
                    <Shield className={`w-5 h-5 ${inc.incidentType === "physical_restraint" ? "text-red-600" : inc.incidentType === "seclusion" ? "text-amber-700" : "text-amber-600"}`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-800">{inc.studentFirstName} {inc.studentLastName}</span>
                    <StudentQuickView
                      studentId={inc.studentId}
                      studentName={`${inc.studentFirstName} ${inc.studentLastName}`}
                      grade={null}
                      trigger={
                        <span className="p-1 rounded hover:bg-gray-100 flex-shrink-0 transition-colors" title="Quick view: emergency contacts &amp; alerts">
                          <Phone className="w-3 h-3 text-gray-400 hover:text-emerald-600" />
                        </span>
                      }
                    />
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[inc.incidentType] || "bg-gray-100 text-gray-600"}`}>
                      {TYPE_LABELS[inc.incidentType] || inc.incidentType}
                    </span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[inc.status] || "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[inc.status] || inc.status}
                    </span>
                    {inc.deseReportRequired && !inc.deseReportSentAt && (
                      <span className="text-[10px] font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">DESE DUE</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">{inc.behaviorDescription}</p>
                </div>
                <div className="flex-shrink-0 text-right space-y-1">
                  <p className="text-xs font-medium text-gray-700">{formatDate(inc.incidentDate)}</p>
                  <p className="text-[11px] text-gray-400">{formatTime(inc.incidentTime)}{inc.durationMinutes ? ` · ${inc.durationMinutes} min` : ""}</p>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  {inc.studentInjury && <span className="w-2 h-2 rounded-full bg-red-500" title="Student injury" />}
                  {inc.staffInjury && <span className="w-2 h-2 rounded-full bg-amber-500" title="Staff injury" />}
                  {!inc.parentVerbalNotification && (
                    <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                      {hoursUntilDeadline(inc.incidentDate, inc.incidentTime) > 0
                        ? `${hoursUntilDeadline(inc.incidentDate, inc.incidentTime)}h left`
                        : "OVERDUE"}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SummaryCard({ label, value, icon, color, detail }: { label: string; value: string | number; icon: React.ReactNode; color?: string; detail?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/80 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1.5">{icon}<span className="text-[11px] text-gray-500 font-medium">{label}</span></div>
      <p className={`text-2xl font-bold ${color || "text-gray-800"}`}>{value}</p>
      {detail && <p className="text-[11px] text-gray-400 mt-1">{detail}</p>}
    </div>
  );
}

export function ChecklistField({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt]);
  };
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${selected.includes(opt) ? "bg-emerald-100 border-emerald-300 text-emerald-800 font-medium" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
