import { useGetComplianceRiskReport } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Link } from "wouter";
import { Download, FileBarChart } from "lucide-react";
import { RISK_CONFIG } from "@/lib/constants";
import { useRole } from "@/lib/role-context";
import { downloadCsv } from "./utils";

export function RiskTab() {
  const { user } = useRole();
  const { data: complianceRisk, isLoading: loadingRisk, isError: errRisk, refetch: refetchRisk } = useGetComplianceRiskReport();
  const riskList = Array.isArray(complianceRisk) ? complianceRisk : [];

  function exportRisk() {
    downloadCsv("at_risk_students.csv",
      ["Student", "Service", "Risk Status", "Delivered", "Required", "% Complete"],
      riskList.map(r => [r.studentName, r.serviceTypeName, r.riskStatus, String(r.deliveredMinutes), String(r.requiredMinutes), String(Math.round(r.percentComplete ?? 0))]),
      { generatedAt: new Date().toISOString(), preparedBy: user.name }
    );
  }

  return (
    <Card>
      {errRisk ? <ErrorBanner message="Failed to load compliance risk data." onRetry={() => refetchRisk()} /> : <>
      <div className="flex items-center justify-between px-5 py-2.5 bg-amber-50 border-b border-amber-100">
        <div className="flex items-center gap-2 text-xs text-amber-800">
          <FileBarChart className="w-3.5 h-3.5 flex-shrink-0" />
          <span>This is the exportable summary table. For the full narrative risk report with provider breakdown and exposure analysis, see{" "}
            <Link href="/compliance?tab=risk-report" className="font-semibold underline underline-offset-2 hover:text-amber-900">Compliance → Risk Report</Link>.
          </span>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px] flex-shrink-0" onClick={exportRisk} disabled={riskList.length === 0}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Risk Level</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Delivered</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Progress</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Behind</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingRisk ? [...Array(10)].map((_, i) => (
              <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
            )) : riskList.slice(0, 200).map((r, i) => {
              const cfg = RISK_CONFIG[r.riskStatus] ?? RISK_CONFIG.on_track;
              const pct = Math.min(100, r.percentComplete ?? 0);
              return (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/students/${r.studentId}`} className="text-[13px] font-medium text-gray-800 hover:text-emerald-700">
                      {r.studentName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-gray-500 max-w-[140px] truncate">{r.serviceTypeName}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-gray-600 font-mono">{r.deliveredMinutes} / {r.requiredMinutes}</td>
                  <td className="px-5 py-3 w-28">
                    <div className="flex items-center gap-2">
                      <MiniProgressRing value={pct} size={24} strokeWidth={2.5} color={cfg.ringColor} />
                      <span className="text-[12px] font-bold text-gray-700">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[12px] font-medium text-red-600">{r.remainingMinutes} min</span>
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
