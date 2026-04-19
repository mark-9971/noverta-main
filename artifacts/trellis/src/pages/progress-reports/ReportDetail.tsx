import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Edit3, ArrowLeft, Loader2, ChevronDown, ChevronUp, Printer, AlertTriangle,
} from "lucide-react";
import { ProgressReport, RATING_CONFIG, STATUS_CONFIG, formatDate } from "./types";
import { TrendIcon } from "./TrendIcon";

interface Props {
  report: ProgressReport;
  onBack: () => void;
  onEdit: () => void;
  onStatusChange: (s: string) => void;
  /** Opens print-ready HTML in a new window and triggers the browser
   *  print dialog. Users save as PDF via the OS dialog — this is NOT
   *  a true PDF download. */
  onPrint: () => void;
  saving: boolean;
}

export function ReportDetail({ report, onBack, onEdit, onStatusChange, onPrint, saving }: Props) {
  const goals = report.goalProgress || [];
  const services = report.serviceBreakdown || [];
  const [expandedGoals, setExpandedGoals] = useState<Set<number>>(new Set(goals.map((_, i) => i)));

  const toggleGoal = (idx: number) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const statusConf = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusConf.icon;

  const nextStatuses: { value: string; label: string }[] = [];
  if (report.status === "draft") nextStatuses.push({ value: "review", label: "Submit for Review" });
  if (report.status === "draft" || report.status === "review") nextStatuses.push({ value: "final", label: "Finalize" });
  if (report.status === "final") nextStatuses.push({ value: "sent", label: "Mark as Sent to Parent" });
  if (report.status !== "draft") nextStatuses.push({ value: "draft", label: "Revert to Draft" });

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1000px] mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onEdit}><Edit3 className="w-4 h-4 mr-1.5" /> Edit</Button>
        <Button variant="outline" size="sm" onClick={onPrint}><Printer className="w-4 h-4 mr-1.5" /> Print / Save as PDF</Button>
        {nextStatuses.map(ns => (
          <Button key={ns.value} size="sm" disabled={saving}
            className={ns.value === "final" ? "bg-emerald-600 hover:bg-emerald-700" : ns.value === "sent" ? "bg-purple-600 hover:bg-purple-700" : ""}
            variant={ns.value === "draft" ? "outline" : "default"}
            onClick={() => onStatusChange(ns.value)}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} {ns.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{report.studentName || `${report.studentFirstName || ""} ${report.studentLastName || ""}`}</CardTitle>
              <p className="text-sm text-gray-500 mt-1">{report.reportingPeriod} — {formatDate(report.periodStart)} to {formatDate(report.periodEnd)}</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusConf.bg} ${statusConf.color}`}>
              <StatusIcon className="w-4 h-4" /> {statusConf.label}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">DOB:</span> {report.studentDob || "N/A"}</div>
            <div><span className="text-gray-500">Grade:</span> {report.studentGrade || "N/A"}</div>
            <div><span className="text-gray-500">School:</span> {report.schoolName || "N/A"}</div>
            <div><span className="text-gray-500">District:</span> {report.districtName || "N/A"}</div>
            <div><span className="text-gray-500">IEP Period:</span> {report.iepStartDate || "N/A"} — {report.iepEndDate || "N/A"}</div>
            <div><span className="text-gray-500">Prepared By:</span> {report.preparedByName || "N/A"}</div>
            <div><span className="text-gray-500">Next Report:</span> {formatDate(report.nextReportDate)}</div>
            {report.parentNotificationDate && <div><span className="text-gray-500">Sent:</span> {formatDate(report.parentNotificationDate)}</div>}
          </div>
        </CardContent>
      </Card>

      {report.overallSummary && (
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Overall Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{report.overallSummary}</p>
          </CardContent>
        </Card>
      )}

      {goals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Goal Progress ({goals.length} goals)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {goals.map((g, idx) => {
              const rc = RATING_CONFIG[g.progressRating] || RATING_CONFIG.not_addressed;
              const expanded = expandedGoals.has(idx);
              const isBehavior = !!g.behaviorTargetName;
              const highVariability =
                isBehavior &&
                g.behaviorVariability !== null &&
                g.behaviorVariability !== undefined &&
                g.behaviorValue !== null &&
                g.behaviorValue !== undefined &&
                g.behaviorValue > 0 &&
                g.behaviorVariability > g.behaviorValue * 0.5;
              const mtLabel: Record<string, string> = {
                frequency: "Frequency",
                duration: "Duration",
                latency: "Latency",
                interval: "Interval",
                rate: "Rate",
              };
              return (
                <div key={idx} className={`border rounded-lg overflow-hidden ${rc.bg}`}>
                  <button type="button" className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => toggleGoal(idx)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{g.goalArea} — Goal #{g.goalNumber}</span>
                        <span className={`text-xs font-medium ${rc.color}`}>{g.progressCode}</span>
                        <TrendIcon direction={g.trendDirection} />
                        {isBehavior && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700">Behavior</span>
                        )}
                        {highVariability && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                            <AlertTriangle className="w-3 h-3" /> Variable
                          </span>
                        )}
                      </div>
                      {!expanded && <p className="text-xs text-gray-500 mt-0.5 truncate">{g.currentPerformance}</p>}
                    </div>
                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  {expanded && (
                    <div className="px-4 pb-3 space-y-2 text-sm border-t border-white/50">
                      <div><span className="text-gray-600 font-medium">Annual Goal:</span> {g.annualGoal}</div>
                      {g.baseline && <div><span className="text-gray-600 font-medium">Baseline:</span> {g.baseline}</div>}
                      {g.targetCriterion && <div><span className="text-gray-600 font-medium">Target:</span> {g.targetCriterion}</div>}
                      {isBehavior && (
                        <div className="flex flex-wrap gap-3 text-xs">
                          <span className="bg-violet-50 text-violet-700 px-2 py-0.5 rounded">
                            <span className="font-medium">Target:</span> {g.behaviorTargetName}
                          </span>
                          {g.behaviorMeasurementType && (
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                              {mtLabel[g.behaviorMeasurementType] ?? g.behaviorMeasurementType}
                            </span>
                          )}
                          {g.behaviorTargetDirection && (
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize">
                              Goal: {g.behaviorTargetDirection}
                            </span>
                          )}
                          {g.behaviorSessionCount !== null && g.behaviorSessionCount !== undefined && (
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                              {g.behaviorSessionCount} session{g.behaviorSessionCount === 1 ? "" : "s"} w/ data
                            </span>
                          )}
                        </div>
                      )}
                      <div><span className="text-gray-600 font-medium">Current Performance:</span> {g.currentPerformance}</div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <span><span className="text-gray-600 font-medium">Data Points:</span> {g.dataPoints}</span>
                        <span className="flex items-center gap-1"><span className="text-gray-600 font-medium">Trend:</span> <TrendIcon direction={g.trendDirection} /> {g.trendDirection}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${rc.color}`}>{rc.label}</span>
                      </div>
                      {highVariability && (
                        <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>Notable session-to-session variability observed (SD ≈ {g.behaviorVariability}). Data should be interpreted with caution and reviewed at team level.</span>
                        </div>
                      )}
                      <div className="bg-white/70 rounded p-2.5 text-gray-700 italic">{g.narrative}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {services.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Service Delivery</CardTitle></CardHeader>
          <CardContent>
            {report.serviceDeliverySummary && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 border-l-4 border-l-blue-500 rounded-lg text-sm text-blue-900 whitespace-pre-line leading-relaxed">
                {report.serviceDeliverySummary}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-semibold text-gray-600">Service</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Required</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Delivered</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Compliance</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Sessions</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Missed</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 px-3 font-medium">{s.serviceType}</td>
                      <td className="py-2 px-3 text-right">{s.requiredMinutes} min</td>
                      <td className="py-2 px-3 text-right">{s.deliveredMinutes} min</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{
                              width: `${s.compliancePercent}%`,
                              backgroundColor: s.compliancePercent >= 90 ? "#059669" : s.compliancePercent >= 70 ? "#f59e0b" : "#dc2626"
                            }} />
                          </div>
                          <span className={s.compliancePercent >= 90 ? "text-emerald-600" : s.compliancePercent >= 70 ? "text-amber-600" : "text-red-600"}>
                            {s.compliancePercent}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right">{s.completedSessions}</td>
                      <td className="py-2 px-3 text-right text-red-500">{s.missedSessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {report.recommendations && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recommendations</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-700 whitespace-pre-line">{report.recommendations}</p></CardContent>
        </Card>
      )}

      {report.parentNotes && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Notes to Parent/Guardian</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-700 whitespace-pre-line">{report.parentNotes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
