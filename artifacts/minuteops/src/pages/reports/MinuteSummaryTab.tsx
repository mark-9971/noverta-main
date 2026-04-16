import { useGetStudentMinuteSummaryReport } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Link } from "wouter";
import { Download } from "lucide-react";
import { RISK_CONFIG } from "@/lib/constants";
import { useRole } from "@/lib/role-context";
import { downloadCsv } from "./utils";

export function MinuteSummaryTab() {
  const { user } = useRole();
  const { data: minuteSummary, isLoading: loadingMinutes, isError: errMinutes, refetch: refetchMinutes } = useGetStudentMinuteSummaryReport();
  const minuteList = Array.isArray(minuteSummary) ? minuteSummary : [];

  function exportMinutes() {
    downloadCsv("minute_summary.csv",
      ["Student", "Service", "Delivered (min)", "Required (min)", "% Complete", "Status"],
      minuteList.map(r => [r.studentName, r.serviceTypeName, String(r.deliveredMinutes), String(r.requiredMinutes), String(Math.round(r.percentComplete ?? 0)), r.riskStatus]),
      { generatedAt: new Date().toISOString(), preparedBy: user.name }
    );
  }

  return (
    <Card>
      {errMinutes ? <ErrorBanner message="Failed to load minute summary." onRetry={() => refetchMinutes()} /> : <>
      <div className="flex items-center justify-end px-5 pt-3">
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportMinutes} disabled={minuteList.length === 0}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Delivered</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Required</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Progress</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingMinutes ? [...Array(10)].map((_, i) => (
              <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
            )) : minuteList.slice(0, 200).map((row, i) => {
              const cfg = RISK_CONFIG[row.riskStatus] ?? RISK_CONFIG.on_track;
              const pct = Math.min(100, row.percentComplete ?? 0);
              return (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/students/${row.studentId}`} className="text-[13px] font-medium text-gray-800 hover:text-emerald-700">
                      {row.studentName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-gray-500 max-w-[160px] truncate">{row.serviceTypeName}</td>
                  <td className="px-5 py-3 text-[13px] text-gray-600 font-mono">{row.deliveredMinutes}</td>
                  <td className="px-5 py-3 text-[13px] text-gray-600 font-mono">{row.requiredMinutes}</td>
                  <td className="px-5 py-3 w-28">
                    <div className="flex items-center gap-2">
                      <MiniProgressRing value={pct} size={24} strokeWidth={2.5} color={cfg.ringColor} />
                      <span className="text-[12px] font-bold text-gray-700">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>}
    </Card>
  );
}
