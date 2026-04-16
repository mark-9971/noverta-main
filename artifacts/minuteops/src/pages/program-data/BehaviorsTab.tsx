import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingDown, TrendingUp, Plus } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  BehaviorTarget, TrendPoint, Student, COLORS, measureLabel,
} from "./constants";

interface Props {
  student: Student | undefined;
  behaviorTargets: BehaviorTarget[];
  behaviorTrends: TrendPoint[];
  onAdd: () => void;
}

export default function BehaviorsTab({ student, behaviorTargets, behaviorTrends, onAdd }: Props) {
  const behaviorChartData = (() => {
    const byDate: Record<string, any> = {};
    for (const p of behaviorTrends) {
      if (!byDate[p.sessionDate]) byDate[p.sessionDate] = { date: p.sessionDate };
      byDate[p.sessionDate][p.targetName!] = parseFloat(p.value!);
    }
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));
  })();

  const uniqueBehaviorNames = [...new Set(behaviorTrends.map(t => t.targetName!))];

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="hidden md:block">
        <CardHeader className="pb-0 flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600">
            <TrendingDown className="w-4 h-4 inline mr-1.5 text-red-500" />
            Behavior Trends — {student?.firstName} {student?.lastName}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {behaviorChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={behaviorChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip labelFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {uniqueBehaviorNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                ))}
                {behaviorTargets.map((bt, i) => bt.goalValue ? (
                  <ReferenceLine key={`goal-${bt.id}`} y={parseFloat(bt.goalValue)} stroke={COLORS[i % COLORS.length]}
                    strokeDasharray="5 5" strokeOpacity={0.5} />
                ) : null)}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-12 text-center text-gray-400 text-sm">No behavior data yet. Use Data Collection tab to start tracking.</div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600">Active Behavior Targets</h3>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {behaviorTargets.map((bt) => {
          const latest = behaviorTrends.filter(t => t.behaviorTargetId === bt.id);
          const lastVal = latest.length > 0 ? parseFloat(latest[latest.length - 1].value!) : null;
          const firstVal = latest.length > 1 ? parseFloat(latest[0].value!) : null;
          const improving = firstVal && lastVal ? (bt.targetDirection === "decrease" ? lastVal < firstVal : lastVal > firstVal) : null;

          return (
            <Card key={bt.id}>
              <CardContent className="p-3.5 md:p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-gray-700 truncate">{bt.name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {measureLabel(bt.measurementType)} · {bt.targetDirection} to {bt.goalValue ?? "—"}
                      {bt.enableHourlyTracking && " · Hourly"}
                    </p>
                  </div>
                  {improving !== null && (
                    <span className={`flex items-center gap-0.5 text-[10px] md:text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      improving ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                    }`}>
                      {improving ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {improving ? "Improving" : "Worsening"}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 md:gap-3 mt-3">
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-400">Baseline</p>
                    <p className="text-[15px] md:text-[16px] font-bold text-gray-600">{bt.baselineValue ?? "—"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-400">Current</p>
                    <p className="text-[15px] md:text-[16px] font-bold text-emerald-700">{lastVal ?? "—"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-400">Goal</p>
                    <p className="text-[15px] md:text-[16px] font-bold text-emerald-600">{bt.goalValue ?? "—"}</p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">{latest.length} data points</p>
              </CardContent>
            </Card>
          );
        })}
        {behaviorTargets.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-400 text-sm">No behavior targets. Add one to start tracking.</div>
        )}
      </div>
    </div>
  );
}
