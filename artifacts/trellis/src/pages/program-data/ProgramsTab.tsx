import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Plus, ArrowUp, ArrowDown, Wand2, FileUp } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  ProgramTarget, TrendPoint, Student, COLORS, PROMPT_LABELS, PHASE_CONFIG, ProgramPhase,
} from "./constants";

interface Props {
  student: Student | undefined;
  programTargets: ProgramTarget[];
  programTrends: TrendPoint[];
  onQuickAdd: () => void;
  onOpenBuilder: () => void;
  onEditProgram: (pt: ProgramTarget) => void;
  onEditBuilder: (pt: ProgramTarget) => void;
  onSaveAsTemplate: (pt: ProgramTarget) => void;
}

export default function ProgramsTab({
  student, programTargets, programTrends,
  onQuickAdd, onOpenBuilder, onEditProgram, onEditBuilder, onSaveAsTemplate,
}: Props) {
  const programChartData = (() => {
    const byDate: Record<string, any> = {};
    for (const p of programTrends) {
      if (!byDate[p.sessionDate]) byDate[p.sessionDate] = { date: p.sessionDate };
      byDate[p.sessionDate][p.targetName!] = parseFloat(p.percentCorrect!);
    }
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));
  })();

  const uniqueProgramNames = [...new Set(programTrends.map(t => t.targetName!))];

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="hidden md:block">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-gray-600">
            <TrendingUp className="w-4 h-4 inline mr-1.5 text-emerald-500" />
            Skill Acquisition Trends — {student?.firstName} {student?.lastName}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {programChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={programChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip labelFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  formatter={(v: any) => [`${v}%`, undefined]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={80} stroke="#10b981" strokeDasharray="5 5" strokeOpacity={0.5} label={{ value: "Mastery", position: "right", fontSize: 10, fill: "#10b981" }} />
                {uniqueProgramNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-12 text-center text-gray-400 text-sm">No program data yet.</div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-600">Active Skill Programs</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-[12px] h-8" onClick={onQuickAdd}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Quick Add
          </Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={onOpenBuilder}>
            <Wand2 className="w-3.5 h-3.5 mr-1" /> Program Builder
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {programTargets.map((pt) => {
          const data = programTrends.filter(t => t.programTargetId === pt.id);
          const lastPct = data.length > 0 ? parseFloat(data[data.length - 1].percentCorrect!) : null;
          const last3 = data.slice(-3);
          const avgLast3 = last3.length > 0 ? Math.round(last3.reduce((s, d) => s + parseFloat(d.percentCorrect!), 0) / last3.length) : null;
          const phase = (pt.phase ?? "training") as ProgramPhase;
          const phaseInfo = PHASE_CONFIG[phase];
          const PhaseIcon = phaseInfo.icon;
          const promptInfo = PROMPT_LABELS[pt.currentPromptLevel ?? "verbal"];
          const totalTrials = last3.reduce((s, d) => s + (d.trialsTotal ?? 0), 0);
          const promptedTrials = last3.reduce((s, d) => s + (d.prompted ?? 0), 0);
          const indPct = totalTrials > 0 ? Math.round(((totalTrials - promptedTrials) / totalTrials) * 100) : null;

          return (
            <Card key={pt.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3.5 md:p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="min-w-0 cursor-pointer" onClick={() => onEditProgram(pt)}>
                    <p className="text-[14px] font-semibold text-gray-700 truncate">{pt.name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {pt.programType === "discrete_trial" ? "DTT" : pt.programType === "task_analysis" ? "Task Analysis" : pt.programType === "natural_environment" ? "NET" : pt.programType === "fluency" ? "Fluency" : pt.programType} · {pt.domain || "General"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {promptInfo && phase === "training" && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${promptInfo.color}`}>
                        {promptInfo.short}
                      </span>
                    )}
                    <span
                      className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${phaseInfo.color}`}
                      title={phaseInfo.description}
                    >
                      <PhaseIcon className="w-3 h-3" />
                      {phaseInfo.short}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 mt-3" onClick={() => onEditProgram(pt)}>
                  <div className="bg-gray-50 rounded-lg p-2 text-center cursor-pointer">
                    <p className="text-[10px] text-gray-400">Last</p>
                    <p className="text-[14px] font-bold text-emerald-700">{lastPct != null ? `${lastPct}%` : "—"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center cursor-pointer">
                    <p className="text-[10px] text-gray-400">Avg 3</p>
                    <p className={`text-[14px] font-bold ${(avgLast3 ?? 0) >= (pt.masteryCriterionPercent ?? 80) ? "text-emerald-600" : "text-gray-600"}`}>
                      {avgLast3 != null ? `${avgLast3}%` : "—"}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center cursor-pointer">
                    <p className="text-[10px] text-gray-400">Mastery</p>
                    <p className="text-[14px] font-bold text-gray-600">{pt.masteryCriterionPercent ?? 80}%</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center cursor-pointer" title="Independence % = trials without a prompt (last 3 sessions)">
                    <p className="text-[10px] text-gray-400">Ind%</p>
                    <p className={`text-[14px] font-bold ${indPct !== null && indPct >= 80 ? "text-emerald-600" : indPct !== null && indPct >= 50 ? "text-amber-600" : "text-gray-600"}`}>
                      {indPct !== null ? `${indPct}%` : "—"}
                    </p>
                  </div>
                </div>
                {pt.autoProgressEnabled && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <ArrowUp className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] text-gray-400">Auto-progress at {pt.masteryCriterionPercent ?? 80}% x{pt.masteryCriterionSessions ?? 3}</span>
                    <ArrowDown className="w-3 h-3 text-red-400 ml-2" />
                    <span className="text-[10px] text-gray-400">Regress &lt;{pt.regressionThreshold ?? 50}% x{pt.regressionSessions ?? 2}</span>
                  </div>
                )}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                  <p className="text-[11px] text-gray-400">{data.length} data points</p>
                  <div className="flex gap-1">
                    <button onClick={() => onEditBuilder(pt)}
                      className="text-[10px] text-emerald-700 hover:text-emerald-900 font-medium px-1.5 py-0.5 rounded hover:bg-emerald-50">
                      <Wand2 className="w-3 h-3 inline mr-0.5" /> Builder
                    </button>
                    <button onClick={() => onSaveAsTemplate(pt)}
                      className="text-[10px] text-gray-500 hover:text-gray-700 font-medium px-1.5 py-0.5 rounded hover:bg-gray-100">
                      <FileUp className="w-3 h-3 inline mr-0.5" /> Save Template
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {programTargets.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-400 text-sm">No skill programs. Add one or use a template from the Library tab.</div>
        )}
      </div>
    </div>
  );
}
