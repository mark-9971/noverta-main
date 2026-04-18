import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Save, Activity, GraduationCap } from "lucide-react";
import { createDataSession } from "@workspace/api-client-react";
import { BehaviorTarget, ProgramTarget, PROMPT_LABELS, measureLabel } from "./constants";

interface Props {
  studentId: number;
  behaviorTargets: BehaviorTarget[];
  programTargets: ProgramTarget[];
  onClose: () => void;
  onSaved: () => void;
}

export default function LogDataSessionModal({ studentId, behaviorTargets, programTargets, onClose, onSaved }: Props) {
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [behaviorValues, setBehaviorValues] = useState<Record<number, string>>({});
  const [programValues, setProgramValues] = useState<Record<number, { correct: string; total: string; prompted: string; promptLevel: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const bv: Record<number, string> = {};
    behaviorTargets.forEach(bt => { bv[bt.id] = ""; });
    setBehaviorValues(bv);
    const pv: Record<number, { correct: string; total: string; prompted: string; promptLevel: string }> = {};
    programTargets.forEach(pt => {
      pv[pt.id] = { correct: "", total: pt.programType === "discrete_trial" ? "10" : "8", prompted: "", promptLevel: pt.currentPromptLevel ?? "verbal" };
    });
    setProgramValues(pv);
  }, [behaviorTargets, programTargets]);

  async function save() {
    setSaving(true);
    const behaviorData = behaviorTargets
      .filter(bt => behaviorValues[bt.id] && behaviorValues[bt.id] !== "")
      .map(bt => ({
        behaviorTargetId: bt.id,
        value: parseFloat(behaviorValues[bt.id]),
        intervalCount: bt.measurementType === "interval" ? 20 : undefined,
        intervalsWith: bt.measurementType === "interval" ? Math.round(parseFloat(behaviorValues[bt.id]) * 20 / 100) : undefined,
      }));

    const programData = programTargets
      .filter(pt => programValues[pt.id]?.correct !== "")
      .map(pt => ({
        programTargetId: pt.id,
        trialsCorrect: parseInt(programValues[pt.id].correct) || 0,
        trialsTotal: parseInt(programValues[pt.id].total) || 10,
        prompted: parseInt(programValues[pt.id].prompted) || 0,
        promptLevelUsed: programValues[pt.id].promptLevel,
        stepNumber: pt.currentStep ?? null,
      }));

    await createDataSession(studentId, { sessionDate, startTime, endTime, notes: notes || null, behaviorData, programData });
    onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-lg shadow-xl my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-gray-800">Log Data Session</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Date *</label>
              <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Start</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">End</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>

          {behaviorTargets.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-red-500" /> Behavior Data
              </p>
              <div className="space-y-2">
                {behaviorTargets.map(bt => (
                  <div key={bt.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-700 truncate">{bt.name}</p>
                      <p className="text-[10px] text-gray-400">{measureLabel(bt.measurementType)}</p>
                    </div>
                    <input
                      type="number" min="0" placeholder="Value"
                      value={behaviorValues[bt.id] ?? ""}
                      onChange={e => setBehaviorValues({ ...behaviorValues, [bt.id]: e.target.value })}
                      className="w-20 border border-gray-200 rounded-lg px-2 py-2 md:py-1.5 text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {programTargets.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-emerald-600" /> Program Data
              </p>
              <div className="space-y-2">
                {programTargets.map(pt => (
                  <div key={pt.id} className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-[13px] font-medium text-gray-700">{pt.name}</p>
                    <p className="text-[10px] text-gray-400 mb-1.5">
                      {pt.programType === "discrete_trial" ? "DTT" : "Task Analysis"} · {PROMPT_LABELS[programValues[pt.id]?.promptLevel ?? "verbal"]?.label ?? "Verbal"}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-400">Correct</label>
                        <input type="number" min="0" placeholder="0"
                          value={programValues[pt.id]?.correct ?? ""}
                          onChange={e => setProgramValues({ ...programValues, [pt.id]: { ...programValues[pt.id], correct: e.target.value } })}
                          className="w-full border border-gray-200 rounded px-2 py-2 md:py-1 text-[12px] text-center focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                      </div>
                      <span className="text-gray-400 text-[12px] mt-3">/</span>
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-400">Total</label>
                        <input type="number" min="1" placeholder="10"
                          value={programValues[pt.id]?.total ?? ""}
                          onChange={e => setProgramValues({ ...programValues, [pt.id]: { ...programValues[pt.id], total: e.target.value } })}
                          className="w-full border border-gray-200 rounded px-2 py-2 md:py-1 text-[12px] text-center focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-400">Prompted</label>
                        <input type="number" min="0" placeholder="0"
                          value={programValues[pt.id]?.prompted ?? ""}
                          onChange={e => setProgramValues({ ...programValues, [pt.id]: { ...programValues[pt.id], prompted: e.target.value } })}
                          className="w-full border border-gray-200 rounded px-2 py-2 md:py-1 text-[12px] text-center focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-gray-500">Session Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..."
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-9 md:h-8">Cancel</Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-9 md:h-8" disabled={saving} onClick={save}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Session"}
          </Button>
        </div>
      </div>
    </div>
  );
}
