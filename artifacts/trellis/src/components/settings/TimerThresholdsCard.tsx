import { useEffect, useState } from "react";
import { Clock, RotateCcw, Check } from "lucide-react";
import {
  useSessionTimers,
  DEFAULT_WARN_THRESHOLD_MS,
  DEFAULT_CRITICAL_THRESHOLD_MS,
} from "@/lib/session-timer-context";
import { toast } from "sonner";

const DEFAULT_WARN_MIN = Math.round(DEFAULT_WARN_THRESHOLD_MS / 60000);
const DEFAULT_CRITICAL_MIN = Math.round(DEFAULT_CRITICAL_THRESHOLD_MS / 60000);

export default function TimerThresholdsCard() {
  const { warnThresholdMs, criticalThresholdMs, setWarningThresholds } = useSessionTimers();

  const [warnMin, setWarnMin] = useState<string>(() => String(Math.round(warnThresholdMs / 60000)));
  const [criticalMin, setCriticalMin] = useState<string>(() => String(Math.round(criticalThresholdMs / 60000)));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWarnMin(String(Math.round(warnThresholdMs / 60000)));
    setCriticalMin(String(Math.round(criticalThresholdMs / 60000)));
  }, [warnThresholdMs, criticalThresholdMs]);

  const warnNum = Number(warnMin);
  const critNum = Number(criticalMin);
  const validNumbers = Number.isFinite(warnNum) && Number.isFinite(critNum) && warnNum > 0 && critNum > 0;
  const validOrder = validNumbers && critNum > warnNum;
  const isDirty =
    validNumbers &&
    (warnNum * 60000 !== warnThresholdMs || critNum * 60000 !== criticalThresholdMs);

  const handleSave = () => {
    if (!validNumbers) {
      setError("Thresholds must be positive numbers (in minutes).");
      return;
    }
    if (!validOrder) {
      setError("The critical threshold must be greater than the warning threshold.");
      return;
    }
    setError(null);
    setWarningThresholds({
      warnThresholdMs: warnNum * 60000,
      criticalThresholdMs: critNum * 60000,
    });
    toast.success("Timer thresholds updated");
  };

  const handleReset = () => {
    setError(null);
    setWarningThresholds({
      warnThresholdMs: DEFAULT_WARN_THRESHOLD_MS,
      criticalThresholdMs: DEFAULT_CRITICAL_THRESHOLD_MS,
    });
    toast.success("Timer thresholds reset to defaults");
  };

  const isDefault =
    warnThresholdMs === DEFAULT_WARN_THRESHOLD_MS &&
    criticalThresholdMs === DEFAULT_CRITICAL_THRESHOLD_MS;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
          <Clock className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">Session timer warnings</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Choose how long a session timer can run before staff see a yellow warning or a red
            "did you forget to stop it?" alert. Defaults are {DEFAULT_WARN_MIN} minutes (warning)
            and {DEFAULT_CRITICAL_MIN} minutes (critical).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Warning after (minutes)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={warnMin}
            onChange={(e) => setWarnMin(e.target.value)}
            className="mt-1 w-full h-9 px-2.5 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            data-testid="input-timer-warn-minutes"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Critical after (minutes)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={criticalMin}
            onChange={(e) => setCriticalMin(e.target.value)}
            className="mt-1 w-full h-9 px-2.5 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            data-testid="input-timer-critical-minutes"
          />
        </label>
      </div>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          {isDefault ? "Using default thresholds." : "Custom thresholds active for this browser."}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={isDefault}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-timer-thresholds-reset"
          >
            <RotateCcw className="w-3 h-3" />
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || !validOrder}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-timer-thresholds-save"
          >
            <Check className="w-3 h-3" />
            Save thresholds
          </button>
        </div>
      </div>
    </div>
  );
}
