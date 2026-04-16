import { useState, useEffect, useCallback } from "react";
import { listStudents } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Printer, TrendingUp, AlertTriangle, Heart, CheckCircle2, Clock, TrendingDown, Minus } from "lucide-react";

interface ParentSummaryData {
  student: { id: number; firstName: string; lastName: string; grade: string | null; schoolName: string | null };
  providers: Array<{ name: string; role: string; email: string | null }>;
  reportingPeriod: { label: string; start: string; end: string; status: string } | null;
  overallSummary: string | null;
  parentNotes: string | null;
  recommendations: string | null;
  goalSummaries: Array<{
    area: string; goalNumber: number; progressRating: string;
    statusLabel: string; statusColor: string; trendDirection: string;
    parentFriendlyNarrative: string; dataPoints: number;
    currentPerformance: string; targetCriterion: string | null;
  }>;
  servicesSummary: Array<{
    serviceType: string; requiredMinutes: number; deliveredMinutes: number;
    compliancePercent: number; sessionsSummary: string; parentFriendly: string;
  }>;
  availableReports: Array<{ id: number; reportingPeriod: string; periodStart: string; periodEnd: string; status: string; createdAt: string }>;
}

function StatusBadge({ color, label }: { color: string; label: string }) {
  const styles: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
  };
  const icons: Record<string, any> = {
    emerald: CheckCircle2, blue: TrendingUp, amber: Clock, red: AlertTriangle, gray: Minus,
  };
  const Icon = icons[color] || Minus;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${styles[color] ?? styles.gray}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function TrendIcon({ direction }: { direction: string }) {
  if (direction === "improving") return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (direction === "declining") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-gray-400" />;
}

export function ParentSummaryTab() {
  const [students, setStudents] = useState<Array<{ id: number; firstName: string; lastName: string }>>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [summary, setSummary] = useState<ParentSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  useEffect(() => {
    listStudents().then(s => {
      setStudents(s as any[]);
      if ((s as any[]).length > 0 && !selectedStudentId) setSelectedStudentId((s as any[])[0].id);
    }).catch(() => {});
  }, []);

  const fetchSummary = useCallback(async (studentId: number) => {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const data = await authFetch(`/api/reports/parent-summary/${studentId}`);
      setSummary(data as ParentSummaryData);
      setSelectedReportId(null);
    } catch { setError("Failed to load parent summary. Make sure this student has a progress report."); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedStudentId) fetchSummary(selectedStudentId);
  }, [selectedStudentId, fetchSummary]);

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <div>
          <label className="text-[12px] font-medium text-gray-500 block mb-1">Student</label>
          <select
            value={selectedStudentId ?? ""}
            onChange={e => setSelectedStudentId(parseInt(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 min-w-[200px]"
          >
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
            ))}
          </select>
        </div>
        {summary && summary.availableReports.length > 1 && (
          <div>
            <label className="text-[12px] font-medium text-gray-500 block mb-1">Reporting Period</label>
            <select
              value={selectedReportId ?? ""}
              onChange={async e => {
                const rid = parseInt(e.target.value);
                setSelectedReportId(rid);
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              {summary.availableReports.map(r => (
                <option key={r.id} value={r.id}>{r.reportingPeriod} · {r.status === "final" ? "Final" : "Draft"}</option>
              ))}
            </select>
          </div>
        )}
        {summary && (
          <div className="ml-auto">
            <Button size="sm" variant="outline" className="text-[12px] h-9 gap-1.5" onClick={handlePrint}>
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </Button>
          </div>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">{error}</p>
            <p className="text-xs text-gray-400 mt-2">Generate a progress report from the student's IEP page first.</p>
            <Link href="/student-iep">
              <Button size="sm" className="mt-4 bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]">
                Go to Student IEP
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {summary && !loading && (
        <div className="space-y-6 print:space-y-4">
          <div className="print:block">
            <div className="border-b border-gray-100 pb-4 mb-6 print:mb-4">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 print:text-xl">
                    {summary.student.firstName} {summary.student.lastName}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {summary.student.grade ? `Grade ${summary.student.grade}` : ""}
                    {summary.student.grade && summary.student.schoolName ? " · " : ""}
                    {summary.student.schoolName ?? ""}
                  </p>
                  {summary.reportingPeriod && (
                    <p className="text-xs text-gray-400 mt-1">
                      {summary.reportingPeriod.label}
                      {summary.reportingPeriod.start && summary.reportingPeriod.end
                        ? ` · ${summary.reportingPeriod.start} through ${summary.reportingPeriod.end}`
                        : ""}
                      {summary.reportingPeriod.status === "draft" && (
                        <span className="ml-2 px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[10px] rounded font-semibold">DRAFT</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="text-right text-[11px] text-gray-400 print:text-xs">
                  <p className="font-semibold text-gray-600 text-xs">Prepared for Families</p>
                  <p>Generated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
                </div>
              </div>
            </div>

            {!summary.reportingPeriod && (
              <Card className="border-amber-200 bg-amber-50/50 mb-4">
                <CardContent className="py-4 px-5">
                  <p className="text-sm font-semibold text-amber-800">No progress report found for this student.</p>
                  <p className="text-xs text-amber-700 mt-1">Go to the student's IEP page and generate a progress report to enable this summary.</p>
                </CardContent>
              </Card>
            )}

            {summary.overallSummary && (
              <Card className="bg-emerald-50/40 border-emerald-100 mb-4">
                <CardContent className="py-4 px-5">
                  <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">Overall Progress</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{summary.overallSummary}</p>
                </CardContent>
              </Card>
            )}

            {summary.goalSummaries.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-base font-bold text-gray-800">Progress at a Glance</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 print:grid-cols-3">
                  {summary.goalSummaries.map((g, i) => (
                    <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm print:shadow-none print:border-gray-200">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide truncate">{g.area}</p>
                      <div className="mt-2 flex justify-center">
                        <StatusBadge color={g.statusColor} label={g.statusLabel} />
                      </div>
                      {g.dataPoints > 0 && (
                        <p className="text-[10px] text-gray-400 mt-1.5">{g.dataPoints} data points</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.goalSummaries.length > 0 && (
              <div className="space-y-3 mt-6">
                <h3 className="text-base font-bold text-gray-800">Goal-by-Goal Summary</h3>
                {summary.goalSummaries.map((g, i) => (
                  <Card key={i} className="print:shadow-none print:border-gray-200">
                    <CardContent className="py-4 px-5">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Goal {g.goalNumber} · {g.area}</span>
                        <StatusBadge color={g.statusColor} label={g.statusLabel} />
                        <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                          <TrendIcon direction={g.trendDirection} />
                          {g.trendDirection === "improving" ? "Improving trend" : g.trendDirection === "declining" ? "Declining trend" : "Stable"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{g.parentFriendlyNarrative}</p>
                      {(g.currentPerformance || g.targetCriterion) && (
                        <div className="flex gap-4 mt-3">
                          {g.currentPerformance && (
                            <div>
                              <p className="text-[10px] text-gray-400">Current</p>
                              <p className="text-[13px] font-semibold text-gray-700">{g.currentPerformance}</p>
                            </div>
                          )}
                          {g.targetCriterion && (
                            <div>
                              <p className="text-[10px] text-gray-400">Goal Target</p>
                              <p className="text-[13px] font-semibold text-gray-700">{g.targetCriterion}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {summary.servicesSummary.length > 0 && (
              <div className="space-y-3 mt-6">
                <h3 className="text-base font-bold text-gray-800">Services Received</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print:grid-cols-2">
                  {summary.servicesSummary.map((s, i) => (
                    <Card key={i} className="print:shadow-none print:border-gray-200">
                      <CardContent className="py-4 px-5">
                        <p className="text-[13px] font-semibold text-gray-700">{s.serviceType}</p>
                        <p className="text-sm text-gray-600 mt-1">{s.parentFriendly}</p>
                        <div className="flex items-center gap-3 mt-3">
                          <div>
                            <p className="text-[10px] text-gray-400">Minutes Delivered</p>
                            <p className="text-[13px] font-bold text-gray-700">{s.deliveredMinutes}<span className="text-gray-400 font-normal"> / {s.requiredMinutes}</span></p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">Attendance</p>
                            <p className={`text-[13px] font-bold ${s.compliancePercent >= 90 ? "text-emerald-600" : s.compliancePercent >= 75 ? "text-amber-600" : "text-red-500"}`}>
                              {Math.round(s.compliancePercent)}%
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {summary.recommendations && (
              <Card className="mt-6 bg-blue-50/40 border-blue-100 print:shadow-none">
                <CardContent className="py-4 px-5">
                  <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide mb-1">Recommendations &amp; Next Steps</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{summary.recommendations}</p>
                </CardContent>
              </Card>
            )}

            {summary.parentNotes && (
              <Card className="mt-4 print:shadow-none">
                <CardContent className="py-4 px-5">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Note to Family</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{summary.parentNotes}</p>
                </CardContent>
              </Card>
            )}

            {summary.providers.length > 0 && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Your Child's Team</p>
                <div className="flex flex-wrap gap-4">
                  {summary.providers.map((p, i) => (
                    <div key={i} className="text-sm">
                      <p className="font-semibold text-gray-700">{p.name}</p>
                      <p className="text-gray-400 text-[11px] capitalize">{p.role.replace(/_/g, " ")}</p>
                      {p.email && <p className="text-gray-400 text-[11px]">{p.email}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.goalSummaries.length === 0 && summary.servicesSummary.length === 0 && summary.reportingPeriod && (
              <Card>
                <CardContent className="py-10 text-center">
                  <Heart className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 font-medium">Progress report exists but has no goal or service data yet.</p>
                  <p className="text-xs text-gray-400 mt-1">Generate a new report from the student's IEP page to populate this summary.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
