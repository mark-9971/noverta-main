import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { createIepGoal, listGoalBank } from "@workspace/api-client-react";
import type { IepGoal } from "./IepGoalForm";

export interface GoalBankEntry {
  id: number; domain: string; goalArea: string; goalText: string;
  benchmarkText: string | null; gradeRange: string | null;
}

export function GoalBankModal({ studentId, existingGoals, onClose, onGoalAdded }: {
  studentId: number; existingGoals: IepGoal[]; onClose: () => void; onGoalAdded: () => void;
}) {
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [allGoals, setAllGoals] = useState<GoalBankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<number | null>(null);

  useEffect(() => {
    listGoalBank().then(d => {
      setAllGoals(Array.isArray(d) ? d as any : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const domains = [...new Set(allGoals.map(g => g.domain))].sort();
  const existingGoalTexts = new Set(existingGoals.map(g => g.annualGoal));
  const goals = allGoals.filter(g => {
    if (domainFilter && g.domain !== domainFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return g.goalText.toLowerCase().includes(q) || g.domain.toLowerCase().includes(q) || g.goalArea.toLowerCase().includes(q);
    }
    return true;
  });

  async function addGoalToStudent(g: GoalBankEntry) {
    setAdding(g.id);
    try {
      await createIepGoal(studentId, {
        goalArea: g.goalArea,
        annualGoal: g.goalText,
        benchmarks: g.benchmarkText || null,
        status: "active",
      });
      onGoalAdded();
      toast.success("Goal added from goal bank");
    } catch { toast.error("Failed to add goal"); }
    setAdding(null);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-10 md:pt-20 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h3 className="text-base font-bold text-gray-800">Goal Bank</h3>
            <p className="text-[11px] text-gray-400">Pre-written IEP goals — click to add to student</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-3 border-b border-gray-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search goals..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
            <option value="">All Domains</option>
            {domains.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-700 mx-auto" /></div>}
          {!loading && goals.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">No matching goals found</p>
          )}
          {goals.map(g => (
            <div key={g.id} className={`border rounded-lg p-3 transition-colors ${existingGoalTexts.has(g.goalText) ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 hover:border-emerald-200"}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">{g.domain}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{g.goalArea}</span>
                    {g.gradeRange && <span className="text-[10px] text-gray-400">Grades {g.gradeRange}</span>}
                    {existingGoalTexts.has(g.goalText) && <span className="text-[10px] text-emerald-600 font-medium">Already added</span>}
                  </div>
                  <p className="text-[12px] text-gray-700 leading-relaxed">{g.goalText}</p>
                  {g.benchmarkText && (
                    <details className="mt-1">
                      <summary className="text-[11px] text-emerald-700 cursor-pointer hover:text-emerald-900">View benchmarks</summary>
                      <p className="text-[11px] text-gray-500 mt-1 whitespace-pre-line pl-2 border-l-2 border-emerald-100">{g.benchmarkText}</p>
                    </details>
                  )}
                </div>
                <Button size="sm" variant="outline" className="text-[11px] h-7 px-2 flex-shrink-0"
                  disabled={adding === g.id || existingGoalTexts.has(g.goalText)} onClick={() => addGoalToStudent(g)}>
                  {adding === g.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-0.5" />}
                  Add
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
