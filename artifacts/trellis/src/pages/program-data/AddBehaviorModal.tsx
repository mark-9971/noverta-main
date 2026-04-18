import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Save, Info } from "lucide-react";
import { toast } from "sonner";
import { createBehaviorTarget } from "@workspace/api-client-react";
import { INTERVAL_MODE_CONFIG, type IntervalMode } from "./constants";

interface Props {
  studentId: number;
  onClose: () => void;
  onSaved: () => void;
}

const INTERVAL_MODES: IntervalMode[] = ["partial_interval", "whole_interval", "momentary_time_sampling"];

export default function AddBehaviorModal({ studentId, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [measurementType, setMeasurementType] = useState("frequency");
  const [targetDirection, setTargetDirection] = useState("decrease");
  const [baselineValue, setBaselineValue] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [description, setDescription] = useState("");
  const [enableHourly, setEnableHourly] = useState(false);
  const [intervalLen, setIntervalLen] = useState("10");
  const [intervalMode, setIntervalMode] = useState<IntervalMode>("partial_interval");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Please enter a target name"); return; }
    if (measurementType === "interval" && !intervalLen) {
      toast.error("Please enter an interval length for interval recording"); return;
    }
    setSaving(true);
    try {
      await createBehaviorTarget(studentId, {
        name: name.trim(), description: description || null, measurementType, targetDirection,
        baselineValue: baselineValue ? parseFloat(baselineValue) : null,
        goalValue: goalValue ? parseFloat(goalValue) : null,
        enableHourlyTracking: enableHourly,
        intervalLengthSeconds: measurementType === "interval" && intervalLen ? parseInt(intervalLen) : null,
        intervalMode: measurementType === "interval" ? intervalMode : null,
      } as any);
      toast.success("Behavior target added"); onSaved();
    } catch { toast.error("Failed to save behavior target"); }
    setSaving(false);
  }

  const modeConfig = INTERVAL_MODE_CONFIG[intervalMode];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-gray-800">Add Behavior Target</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-medium text-gray-500">Behavior Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Elopement, Aggression, On-task"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Operational Definition</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Precise observable description"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Measurement Method</label>
              <select value={measurementType} onChange={e => setMeasurementType(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                <option value="frequency">Frequency (count)</option>
                <option value="interval">Interval recording (%)</option>
                <option value="duration">Duration (sec)</option>
                <option value="latency">Latency (sec)</option>
                <option value="percentage">Percentage</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Target Direction</label>
              <select value={targetDirection} onChange={e => setTargetDirection(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                <option value="decrease">Decrease</option>
                <option value="increase">Increase</option>
              </select>
            </div>
          </div>

          {measurementType === "interval" && (
            <div className="space-y-3 border border-gray-100 rounded-xl p-3 bg-gray-50">
              <p className="text-[12px] font-semibold text-gray-700">Interval Recording Configuration</p>

              <div>
                <label className="text-[12px] font-medium text-gray-500 mb-1.5 block">Interval Type *</label>
                <div className="space-y-2">
                  {INTERVAL_MODES.map(mode => {
                    const cfg = INTERVAL_MODE_CONFIG[mode];
                    const selected = intervalMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setIntervalMode(mode)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border-2 transition-all ${
                          selected ? `${cfg.color} border-current` : "bg-white border-gray-200 hover:border-gray-300 text-gray-600"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${selected ? cfg.color : "bg-gray-100 text-gray-500"}`}>
                            {cfg.abbrev}
                          </span>
                          <span className="text-[12px] font-semibold">{cfg.label}</span>
                        </div>
                        <p className="text-[11px] mt-0.5 ml-7 opacity-75">{cfg.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {modeConfig && (
                <div className={`rounded-lg p-2.5 border ${modeConfig.color} flex gap-2 items-start`}>
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px]">{modeConfig.tendency}</p>
                </div>
              )}

              <div>
                <label className="text-[12px] font-medium text-gray-500">Interval Length (seconds) *</label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="number" min={5} max={300} value={intervalLen} onChange={e => setIntervalLen(e.target.value)}
                    className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  <span className="text-[11px] text-gray-400">sec</span>
                  <div className="flex gap-1 ml-auto">
                    {[10, 15, 20, 30].map(s => (
                      <button key={s} type="button" onClick={() => setIntervalLen(String(s))}
                        className={`text-[10px] px-2 py-1 rounded border transition-all ${intervalLen === String(s) ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                        {s}s
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Common: 10s or 15s for brief behaviors, 30s for slower rates</p>
              </div>

              {intervalMode === "momentary_time_sampling" && (
                <div className="bg-violet-50 rounded-lg p-2.5 border border-violet-200">
                  <p className="text-[11px] text-violet-700 font-medium">MTS Collection Prompt</p>
                  <p className="text-[11px] text-violet-600 mt-0.5">At the end of each {intervalLen}s interval you'll be asked: <em>"Is the behavior occurring right now?"</em></p>
                </div>
              )}
              {intervalMode === "whole_interval" && (
                <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-200">
                  <p className="text-[11px] text-blue-700 font-medium">WI Collection Prompt</p>
                  <p className="text-[11px] text-blue-600 mt-0.5">You must observe the student for the full {intervalLen}s. Score + only if the behavior was continuous throughout.</p>
                </div>
              )}
            </div>
          )}

          {measurementType === "latency" && (
            <div className="bg-blue-50 rounded-lg p-2.5">
              <p className="text-[11px] text-blue-700 font-medium">Latency Recording</p>
              <p className="text-[11px] text-blue-600 mt-0.5">Record time in seconds from SD presentation to student response. Enter baseline and goal in seconds (e.g., baseline: 45, goal: 5).</p>
            </div>
          )}
          {measurementType === "duration" && (
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-[11px] text-gray-600">Duration is recorded in seconds using a timer in the data collection screen.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Baseline Value</label>
              <input type="number" value={baselineValue} onChange={e => setBaselineValue(e.target.value)} placeholder="e.g. 12"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Goal Value</label>
              <input type="number" value={goalValue} onChange={e => setGoalValue(e.target.value)} placeholder="e.g. 2"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={enableHourly} onChange={e => setEnableHourly(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
            <span className="text-[12px] text-gray-600">Enable hourly tracking breakdown</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-9 md:h-8">Cancel</Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-9 md:h-8" disabled={!name.trim() || saving} onClick={save}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Target"}
          </Button>
        </div>
      </div>
    </div>
  );
}
