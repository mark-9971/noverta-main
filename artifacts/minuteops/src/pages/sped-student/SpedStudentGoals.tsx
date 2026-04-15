import { useEffect, useState } from "react";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Brain, TrendingUp, CheckCircle, Target, Calendar } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

interface Goal {
  id: number;
  goalArea: string;
  goalNumber: number;
  annualGoal: string;
  baseline: string | null;
  targetCriterion: string | null;
  measurementMethod: string | null;
  serviceArea: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  benchmarks: string | null;
  recentSessionCount: number;
  latestNote: string | null;
  latestSessionDate: string | null;
}

function areaColor(area: string) {
  const n = (area || "").toLowerCase();
  if (n.includes("speech") || n.includes("language") || n.includes("communication")) return { bg: "bg-blue-500", light: "bg-blue-50 text-blue-700 border-blue-100", ring: "stroke-blue-500" };
  if (n.includes("behavior") || n.includes("social") || n.includes("aba")) return { bg: "bg-emerald-500", light: "bg-emerald-50 text-emerald-700 border-emerald-100", ring: "stroke-emerald-500" };
  if (n.includes("motor") || n.includes("occupational") || n.includes("ot")) return { bg: "bg-amber-500", light: "bg-amber-50 text-amber-700 border-amber-100", ring: "stroke-amber-500" };
  if (n.includes("academic") || n.includes("reading") || n.includes("math") || n.includes("writing")) return { bg: "bg-violet-500", light: "bg-violet-50 text-violet-700 border-violet-100", ring: "stroke-violet-500" };
  if (n.includes("counsel") || n.includes("emotional")) return { bg: "bg-rose-400", light: "bg-rose-50 text-rose-700 border-rose-100", ring: "stroke-rose-400" };
  if (n.includes("physical") || n.includes("pt")) return { bg: "bg-teal-500", light: "bg-teal-50 text-teal-700 border-teal-100", ring: "stroke-teal-500" };
  return { bg: "bg-emerald-500", light: "bg-emerald-50 text-emerald-700 border-emerald-100", ring: "stroke-emerald-500" };
}

function ProgressRing({ percent, colorClass, size = 56 }: { percent: number; colorClass: string; size?: number }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90 flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className={colorClass}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-gray-700 font-bold"
        fontSize={size > 48 ? 13 : 10}
        transform={`rotate(90, ${size / 2}, ${size / 2})`}
      >
        {percent}%
      </text>
    </svg>
  );
}

function estimateProgress(goal: Goal): number {
  if (goal.recentSessionCount === 0) return 5;
  const sessionScore = Math.min(goal.recentSessionCount * 8, 60);
  const hasNotes = goal.latestNote ? 15 : 0;
  return Math.min(95, sessionScore + hasNotes + 10);
}

export default function SpedStudentGoals() {
  const { studentId } = useRole();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    customFetch<Goal[]>(`/api/student-portal/goals?studentId=${studentId}`)
      .then(d => { setGoals(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [studentId]);

  if (!studentId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="p-8 text-center text-gray-400 bg-white rounded-xl border">
          <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No student selected</p>
          <p className="text-sm mt-1">Go to the dashboard and pick a student first</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">{[1,2,3].map(i=><div key={i} className="h-40 bg-gray-200 rounded-xl animate-pulse"/>)}</div>;
  }

  const areas = [...new Set(goals.map(g => g.goalArea || g.serviceArea || "General"))];
  const avgProgress = goals.length > 0 ? Math.round(goals.reduce((sum, g) => sum + estimateProgress(g), 0) / goals.length) : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Star className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
          My IEP Goals
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {goals.length} active {goals.length === 1 ? "goal" : "goals"} across {areas.length} {areas.length === 1 ? "area" : "areas"}
        </p>
      </div>

      {goals.length > 0 && (
        <div className="flex items-center gap-4 p-4 bg-white rounded-xl border">
          <ProgressRing percent={avgProgress} colorClass="stroke-emerald-500" size={64} />
          <div>
            <p className="text-sm font-semibold text-gray-700">Overall Progress</p>
            <p className="text-xs text-gray-400 mt-0.5">Based on recent session activity across all your goals</p>
          </div>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No active goals found</p>
          <p className="text-sm mt-1">Your IEP team will add goals here when they are ready</p>
        </div>
      ) : (
        <div className="space-y-4">
          {areas.map(area => {
            const areaGoals = goals.filter(g => (g.goalArea || g.serviceArea || "General") === area);
            const colors = areaColor(area);
            return (
              <Card key={area} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${colors.bg}`} />
                      <CardTitle className="text-sm sm:text-[15px]">{area}</CardTitle>
                    </div>
                    <Badge className={`text-[10px] ${colors.light} border`} variant="outline">
                      {areaGoals.length} {areaGoals.length === 1 ? "goal" : "goals"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {areaGoals.map(goal => {
                    const pct = estimateProgress(goal);
                    return (
                      <div key={goal.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                        <div className="flex items-start gap-3">
                          <ProgressRing percent={pct} colorClass={colors.ring} size={48} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-gray-700 leading-relaxed">{goal.annualGoal}</p>
                            {goal.targetCriterion && (
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <Target className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                <p className="text-[11px] text-gray-400 truncate">Target: {goal.targetCriterion}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-400">
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {goal.recentSessionCount} sessions (30 days)
                          </span>
                          {goal.latestSessionDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Last: {new Date(goal.latestSessionDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          {goal.measurementMethod && (
                            <span className="flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              {goal.measurementMethod}
                            </span>
                          )}
                        </div>

                        {goal.latestNote && (
                          <div className="p-2 bg-white rounded-lg border border-gray-100">
                            <p className="text-[11px] text-gray-500 font-medium mb-0.5">Latest session note</p>
                            <p className="text-[12px] text-gray-600 line-clamp-2">{goal.latestNote}</p>
                          </div>
                        )}

                        {goal.benchmarks && (
                          <div className="text-[11px] text-gray-400">
                            <span className="font-medium">Benchmarks:</span> {goal.benchmarks}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-emerald-50 border-emerald-100">
        <CardContent className="p-4 flex items-start gap-3">
          <Brain className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-800">Progress updates every quarter</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Your IEP team tracks data during sessions and reviews your goals each reporting period.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
