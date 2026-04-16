import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Target } from "lucide-react";
import type { IepGoal } from "./types";

export function GoalsSummary({
  goals, studentName, onBack,
}: {
  goals: IepGoal[];
  studentName: string;
  onBack: () => void;
}) {
  const grouped: Record<string, IepGoal[]> = {};
  for (const g of goals) {
    const area = g.serviceArea || g.goalArea || "General";
    if (!grouped[area]) grouped[area] = [];
    grouped[area].push(g);
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-gray-100 text-gray-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-[18px] font-bold text-gray-800">IEP Goals</h1>
          <p className="text-[13px] text-gray-400">{studentName}</p>
        </div>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Target className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-400 text-sm">No active goals found.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([area, areaGoals]) => (
          <div key={area}>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{area}</p>
            <div className="space-y-2">
              {areaGoals.map(g => (
                <Card key={g.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex-shrink-0">
                        Goal {g.goalNumber}
                      </span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        g.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
                      }`}>
                        {g.status}
                      </span>
                    </div>
                    <p className="text-[14px] text-gray-700 leading-relaxed">{g.annualGoal}</p>
                    {g.targetCriterion && (
                      <p className="text-[12px] text-gray-400 mt-2">
                        <span className="font-semibold">Target:</span> {g.targetCriterion}
                      </p>
                    )}
                    {g.baseline && (
                      <p className="text-[12px] text-gray-400 mt-1">
                        <span className="font-semibold">Baseline:</span> {g.baseline}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
