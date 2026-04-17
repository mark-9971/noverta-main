import { useGetMissedSessionsReport } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Link } from "wouter";
import { Download } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { useRole } from "@/lib/role-context";
import { downloadCsv } from "./utils";

export function MissedSessionsTab() {
  const { user } = useRole();
  const { data: missedSessions, isLoading: loadingMissed, isError: errMissed, refetch: refetchMissed } = useGetMissedSessionsReport();
  const missedList = Array.isArray(missedSessions) ? missedSessions : [];

  function exportMissed() {
    downloadCsv("missed_sessions.csv",
      ["Student", "Service", "Date", "Reason", "Staff"],
      missedList.map(r => [r.studentName ?? "", r.serviceTypeName ?? "", r.sessionDate ?? "", (r as any).missedReason ?? "—", r.staffName ?? "—"]),
      { generatedAt: new Date().toISOString(), preparedBy: user.name }
    );
  }

  return (
    <Card>
      {errMissed ? <ErrorBanner message="Failed to load missed sessions." onRetry={() => refetchMissed()} /> : <>
      <div className="flex items-center justify-end px-5 pt-3">
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportMissed} disabled={missedList.length === 0}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Provider</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Duration</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Makeup</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingMissed ? [...Array(10)].map((_, i) => (
              <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
            )) : missedList.slice(0, 200).map((s, i) => (
              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-3 text-[13px] text-gray-600 whitespace-nowrap">{formatDate(s.sessionDate)}</td>
                <td className="px-5 py-3">
                  <Link href={`/students/${s.studentId}`} className="text-[13px] font-medium text-gray-800 hover:text-emerald-700">
                    {s.studentName ?? `Student ${s.studentId}`}
                  </Link>
                </td>
                <td className="px-5 py-3 text-[13px] text-gray-500 max-w-[140px] truncate">{s.serviceTypeName ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-gray-500">{s.staffName ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-gray-600">{s.durationMinutes ?? "—"} min</td>
                <td className="px-5 py-3">
                  {s.isMakeup
                    ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Made Up</span>
                    : <span className="text-[11px] font-medium text-red-500">Needed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>}
    </Card>
  );
}
