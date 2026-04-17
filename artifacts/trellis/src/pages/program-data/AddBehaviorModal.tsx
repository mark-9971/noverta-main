import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Save } from "lucide-react";
import { toast } from "sonner";
import { createBehaviorTarget } from "@workspace/api-client-react";

interface Props {
  studentId: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddBehaviorModal({ studentId, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [measurementType, setMeasurementType] = useState("frequency");
  const [targetDirection, setTargetDirection] = useState("decrease");
  const [baselineValue, setBaselineValue] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [description, setDescription] = useState("");
  const [enableHourly, setEnableHourly] = useState(false);
  const [intervalLen, setIntervalLen] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Please enter a target name"); return; }
    setSaving(true);
    try {
      await createBehaviorTarget(studentId, {
          name: name.trim(), description: description || null, measurementType, targetDirection,
          baselineValue: baselineValue ? parseFloat(baselineValue) : null,
          goalValue: goalValue ? parseFloat(goalValue) : null,
          enableHourlyTracking: enableHourly,
          intervalLengthSeconds: intervalLen ? parseInt(intervalLen) : null,
        });
      toast.success("Behavior target added"); onSaved();
    } catch { toast.error("Failed to save behavior target"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-gray-800">Add Behavior Target</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-medium text-gray-500">Behavior Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Elopement, Aggression"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Operational definition"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Measurement</label>
              <select value={measurementType} onChange={e => setMeasurementType(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                <option value="frequency">Frequency (count)</option>
                <option value="interval">Interval (%)</option>
                <option value="percentage">Percentage</option>
                <option value="duration">Duration (sec)</option>
                <option value="latency">Latency (sec)</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Direction</label>
              <select value={targetDirection} onChange={e => setTargetDirection(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                <option value="decrease">Decrease</option>
                <option value="increase">Increase</option>
              </select>
            </div>
          </div>
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
          {measurementType === "interval" && (
            <div>
              <label className="text-[12px] font-medium text-gray-500">Interval Length (seconds)</label>
              <input type="number" value={intervalLen} onChange={e => setIntervalLen(e.target.value)} placeholder="e.g. 30"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
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
              <p className="text-[11px] text-gray-600">Duration is recorded in seconds. Use the behavior count field during a session to enter total duration in seconds.</p>
            </div>
          )}
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
