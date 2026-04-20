import { Fragment } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState, EmptyStateStep, EmptyStateHeading, EmptyStateDetail } from "@/components/ui/empty-state";
import { StudentQuickView } from "@/components/student-quick-view";
import { CheckCircle, XCircle, RotateCcw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Target, Phone, Calendar } from "lucide-react";
import { formatDate } from "./utils";
import { SessionExpandedDetail } from "./SessionExpandedDetail";

type Props = {
  sessions: any[];
  filtered: any[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  expandedId: number | null;
  expandedData: any;
  expandLoading: boolean;
  onToggleExpand: (session: any) => void;
  onEdit: (session: any) => void;
  onMarkMissed: (session: any) => void;
  onLogMakeup: (session: any) => void;
  onDelete: (id: number) => void;
  onAddSession: () => void;
};

export function SessionList(props: Props) {
  const {
    sessions, filtered, isLoading, isError, onRetry,
    page, pageSize, onPageChange,
    expandedId, expandedData, expandLoading,
    onToggleExpand, onEdit, onMarkMissed, onLogMakeup, onDelete, onAddSession,
  } = props;

  const expandedDetailProps = {
    detail: expandedData, loading: expandLoading,
    onEdit, onMarkMissed, onLogMakeup, onDelete,
  };

  return (
    <>
      {/* Mobile list */}
      <div className="md:hidden space-y-2">
        {isError ? (
          <ErrorBanner message="Failed to load sessions." onRetry={onRetry} />
        ) : isLoading ? (
          [...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : filtered.map((session, sIdx) => (
          <Card
            key={session.id}
            className="overflow-hidden"
            {...(sIdx === 0 ? { "data-demo-highlight": "session" } : {})}
          >
            <button className="w-full p-3.5 text-left" onClick={() => onToggleExpand(session)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-gray-800 truncate">{session.studentName ?? `Student ${session.studentId}`}</p>
                    <StudentQuickView
                      studentId={session.studentId}
                      studentName={session.studentName ?? `Student ${session.studentId}`}
                      grade={null}
                      trigger={
                        <span className="p-1 rounded hover:bg-gray-100 flex-shrink-0 transition-colors" title="Quick view: emergency contacts &amp; alerts">
                          <Phone className="w-3 h-3 text-gray-400 hover:text-emerald-600" />
                        </span>
                      }
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{session.serviceTypeName ?? "—"} · {session.staffName ?? "—"}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(session.goalCount > 0) && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                      <Target className="w-2.5 h-2.5 inline mr-0.5" />{session.goalCount}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    session.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                    session.status === "missed" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                  }`}>
                    {session.status === "completed" ? <CheckCircle className="w-3 h-3" /> :
                     session.status === "missed" ? <XCircle className="w-3 h-3" /> : null}
                    {session.isMakeup ? "Makeup" : session.status}
                  </span>
                  {expandedId === session.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span>{formatDate(session.sessionDate)}</span>
                <span>{session.durationMinutes} min</span>
                {session.location && <span>{session.location}</span>}
              </div>
            </button>
            {expandedId === session.id && <SessionExpandedDetail session={session} {...expandedDetailProps} />}
          </Card>
        ))}
        {!isLoading && filtered.length === 0 && (
          <EmptyState
            icon={Calendar}
            title="No Service Sessions Logged Yet"
            compact
            action={{ label: "Log a Session", onClick: onAddSession }}
          >
            <EmptyStateDetail>
              Session logs are the core evidence of IEP service delivery. Every speech therapy session, OT visit, counseling appointment, and para support block should be recorded here to prove compliance with each student's IEP mandate.
            </EmptyStateDetail>
            <EmptyStateHeading>Why this matters:</EmptyStateHeading>
            <EmptyStateDetail>
              Massachusetts requires districts to deliver 100% of IEP-mandated services. Unlogged sessions look like undelivered services — creating compliance gaps, compensatory liability, and audit risk.
            </EmptyStateDetail>
            <EmptyStateHeading>To get started:</EmptyStateHeading>
            <EmptyStateStep number={1}>Click "Log a Session" to record a completed, missed, or cancelled service session.</EmptyStateStep>
            <EmptyStateStep number={2}>Each session links to a student, provider, and service type — Trellis matches it against IEP requirements automatically.</EmptyStateStep>
            <EmptyStateStep number={3}>Providers can also log sessions from their own dashboard for faster day-to-day entry.</EmptyStateStep>
          </EmptyState>
        )}
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-gray-400">{filtered.length} sessions</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-8 text-[11px]" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-[11px]" disabled={sessions.length < pageSize} onClick={() => onPageChange(page + 1)}>
              Next <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="w-8 px-2"></th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Provider</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Duration</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Goals</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}>{[...Array(8)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                ))
              ) : filtered.map(session => (
                <Fragment key={session.id}>
                  <tr className={`hover:bg-gray-50/50 transition-colors cursor-pointer ${expandedId === session.id ? "bg-gray-50/50" : ""}`}
                    onClick={() => onToggleExpand(session)}>
                    <td className="px-2 py-3 text-center">
                      {expandedId === session.id ? <ChevronUp className="w-4 h-4 text-gray-400 mx-auto" /> : <ChevronDown className="w-4 h-4 text-gray-300 mx-auto" />}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-600 whitespace-nowrap">{formatDate(session.sessionDate)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[13px] font-medium text-gray-800">{session.studentName ?? `Student ${session.studentId}`}</p>
                        <StudentQuickView
                          studentId={session.studentId}
                          studentName={session.studentName ?? `Student ${session.studentId}`}
                          grade={null}
                          trigger={
                            <span className="p-1 rounded hover:bg-gray-100 flex-shrink-0 transition-colors" title="Quick view: emergency contacts &amp; alerts">
                              <Phone className="w-3 h-3 text-gray-400 hover:text-emerald-600" />
                            </span>
                          }
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-500 max-w-[160px] truncate">{session.serviceTypeName ?? "—"}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-500">{session.staffName ?? "—"}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-600">{session.durationMinutes} min</td>
                    <td className="px-4 py-3">
                      {session.goalCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                          <Target className="w-3 h-3" /> {session.goalCount}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        session.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                        session.status === "missed" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                      }`}>
                        {session.status === "completed" ? <CheckCircle className="w-3 h-3" /> :
                         session.status === "missed" ? <XCircle className="w-3 h-3" /> : null}
                        {session.isMakeup ? <><RotateCcw className="w-3 h-3" /> Makeup</> : session.status}
                      </span>
                    </td>
                  </tr>
                  {expandedId === session.id && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <SessionExpandedDetail session={session} {...expandedDetailProps} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={Calendar}
                      title="No sessions found"
                      description="Log a service session to start tracking minutes and progress."
                      action={{ label: "Log Session", onClick: onAddSession }}
                      compact
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <p className="text-[12px] text-gray-400">Showing {filtered.length} sessions</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Prev
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={sessions.length < pageSize} onClick={() => onPageChange(page + 1)}>
              Next <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
