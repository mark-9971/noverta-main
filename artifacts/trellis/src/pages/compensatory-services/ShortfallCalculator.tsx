import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calculator, X } from "lucide-react";
import type { Shortfall } from "./types";

export function ShortfallCalculator({ onClose, onCalculate, shortfalls, loading, onGenerate }: {
  onClose: () => void;
  onCalculate: (start: string, end: string) => void;
  shortfalls: Shortfall[];
  loading: boolean;
  onGenerate: (selected: Shortfall[]) => void;
}) {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthStart = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthEnd = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-${String(lastMonth.getDate()).padStart(2, "0")}`;

  const [periodStart, setPeriodStart] = useState(lastMonthStart);
  const [periodEnd, setPeriodEnd] = useState(lastMonthEnd);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  function toggleSelection(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === shortfalls.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(shortfalls.map((_, i) => i)));
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-600" />
            Calculate Shortfalls
          </CardTitle>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Period Start</label>
            <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="text-sm w-40" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Period End</label>
            <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="text-sm w-40" />
          </div>
          <Button size="sm" disabled={loading} onClick={() => onCalculate(periodStart, periodEnd)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? "Calculating..." : "Calculate"}
          </Button>
        </div>

        {shortfalls.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500">{shortfalls.length} shortfall(s) found</p>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-emerald-600 hover:text-emerald-700">
                  {selectedIds.size === shortfalls.length ? "Deselect All" : "Select All"}
                </button>
                {selectedIds.size > 0 && (
                  <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                    const selected = shortfalls.filter((_, i) => selectedIds.has(i));
                    onGenerate(selected);
                  }}>
                    Generate {selectedIds.size} Obligation(s)
                  </Button>
                )}
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {shortfalls.map((sf, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    selectedIds.has(idx) ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-100 hover:bg-gray-50"
                  }`}
                  onClick={() => toggleSelection(idx)}
                >
                  <input type="checkbox" checked={selectedIds.has(idx)} readOnly className="accent-emerald-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700">{sf.studentName}</p>
                    <p className="text-[10px] text-gray-400">{sf.serviceTypeName}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-red-600">{sf.deficitMinutes} min deficit</p>
                    <p className="text-[10px] text-gray-400">{sf.deliveredMinutes}/{sf.requiredMinutes} delivered</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
