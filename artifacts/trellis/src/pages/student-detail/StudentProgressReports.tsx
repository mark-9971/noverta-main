import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Plus, CheckCircle2, Clock, Send, PenLine, ChevronRight, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

interface GoalProgress {
  goalId: number;
  goalDescription: string;
  progressRating: string;
}

interface ProgressReport {
  id: number;
  status: "draft" | "review" | "final" | "sent";
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  overallSummary: string | null;
  parentNotificationDate: string | null;
  goalProgress: GoalProgress[];
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string; dot: string }> = {
  draft: { label: "Draft", icon: PenLine, cls: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-400" },
  review: { label: "In Review", icon: Clock, cls: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-400" },
  final: { label: "Final", icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  sent: { label: "Sent to Parents", icon: Send, cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-600" },
};

const RATING_LABEL: Record<string, string> = {
  mastered: "Mastered",
  making_progress: "Progress",
  minimal_progress: "Minimal",
  not_introduced: "Not started",
  regression: "Regression",
};

const RATING_COLOR: Record<string, string> = {
  mastered: "text-emerald-700 bg-emerald-50",
  making_progress: "text-blue-700 bg-blue-50",
  minimal_progress: "text-amber-700 bg-amber-50",
  not_introduced: "text-gray-500 bg-gray-100",
  regression: "text-red-700 bg-red-50",
};

function formatDate(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface Props {
  studentId: number;
  enabled: boolean;
  isEditable: boolean;
}

export default function StudentProgressReports({ studentId, enabled, isEditable }: Props) {
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/students/${studentId}/progress-reports`);
      if (res.ok) {
        const data: unknown = await res.json();
        setReports(Array.isArray(data) ? (data as ProgressReport[]) : []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [studentId, enabled]);

  useEffect(() => { loadReports(); }, [loadReports]);

  if (!enabled) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Progress Reports</h2>
          <p className="text-xs text-gray-400 mt-0.5">IEP quarterly progress per 603 CMR 28.07(8)</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/progress-reports?studentId=${studentId}`}>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              View all
            </Button>
          </Link>
          {isEditable && (
            <Link href={`/progress-reports?generate=${studentId}`}>
              <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-3.5 h-3.5 mr-1" /> New Report
              </Button>
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-medium">No progress reports yet</p>
            {isEditable && (
              <p className="text-xs text-gray-400 mt-1">
                Generate the first report using the button above
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map(report => {
            const conf = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.draft;
            const StatusIcon = conf.icon;
            const goalCount = report.goalProgress?.length ?? 0;
            const masteredCount = report.goalProgress?.filter(g => g.progressRating === "mastered").length ?? 0;
            const sent = report.status === "sent";

            return (
              <Link key={report.id} href={`/progress-reports?report=${report.id}`}>
                <Card className="hover:shadow-sm transition-shadow cursor-pointer border-l-4 group"
                  style={{ borderLeftColor: sent ? "#059669" : report.status === "review" ? "#3b82f6" : "#f59e0b" }}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{report.periodLabel || "Progress Report"}</span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 ${conf.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${conf.dot}`} />
                            <StatusIcon className="w-3 h-3" />
                            {conf.label}
                          </span>
                          {!report.parentNotificationDate && report.status === "sent" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200">
                              <AlertTriangle className="w-3 h-3" /> No parent notification
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDate(report.periodStart)} – {formatDate(report.periodEnd)}
                          {report.parentNotificationDate && (
                            <span className="ml-2 text-emerald-600">· Notified {formatDate(report.parentNotificationDate)}</span>
                          )}
                        </p>
                        {report.overallSummary && (
                          <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">{report.overallSummary}</p>
                        )}
                        {goalCount > 0 && (
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {report.goalProgress.slice(0, 5).map(g => (
                              <span key={g.goalId}
                                className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${RATING_COLOR[g.progressRating] ?? "text-gray-500 bg-gray-100"}`}>
                                {RATING_LABEL[g.progressRating] ?? g.progressRating}
                              </span>
                            ))}
                            {goalCount > 5 && (
                              <span className="text-[11px] text-gray-400">+{goalCount - 5} more</span>
                            )}
                            <span className="text-[11px] text-gray-400 ml-auto">{masteredCount}/{goalCount} mastered</span>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 mt-0.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
