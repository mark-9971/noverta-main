import { useState } from "react";
import { Check } from "lucide-react";
import { MISSED_QUICK_REASONS, type MissedReason } from "./types";

export function ReasonStep({ dbReasons, makeupNeeded, onToggleMakeup, onSelect, initialSelectedId, initialSelectedLabel }: {
  dbReasons: MissedReason[];
  makeupNeeded: boolean;
  onToggleMakeup: () => void;
  onSelect: (id: number | null, label?: string) => void;
  initialSelectedId?: number | null;
  initialSelectedLabel?: string | null;
}) {
  const reasons = dbReasons.length > 0
    ? dbReasons
    : MISSED_QUICK_REASONS.map((r, i) => ({ id: -(i + 1), label: r.label, category: r.category }));
  const [localSelectedId, setLocalSelectedId] = useState<number | null>(initialSelectedId ?? null);
  const [localSelectedLabel, setLocalSelectedLabel] = useState<string | null>(initialSelectedLabel ?? null);

  const selectReason = (id: number, label: string) => {
    setLocalSelectedId(id);
    setLocalSelectedLabel(label);
  };

  return (
    <div className="px-4 pt-5 pb-6">
      <h2 className="text-xl font-bold text-gray-900">Why was it missed?</h2>
      <p className="text-sm text-gray-500 mt-1">Select the closest reason</p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {reasons.map((r) => (
          <button
            key={r.id}
            onClick={() => selectReason(r.id, r.label)}
            className={`h-14 rounded-xl px-3 text-[14px] font-medium text-left transition-all active:scale-[0.97] border-2 ${
              localSelectedId === r.id
                ? "border-amber-500 bg-amber-50 text-amber-800"
                : "border-gray-200 bg-gray-50 text-gray-800"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <button
        onClick={onToggleMakeup}
        className={`mt-5 w-full h-14 rounded-xl px-4 flex items-center gap-3 border-2 transition-all active:scale-[0.97] ${
          makeupNeeded ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50"
        }`}
      >
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          makeupNeeded ? "border-blue-500 bg-blue-500" : "border-gray-300"
        }`}>
          {makeupNeeded && <Check className="w-3.5 h-3.5 text-white" />}
        </div>
        <span className={`text-[15px] font-medium ${makeupNeeded ? "text-blue-800" : "text-gray-700"}`}>
          Make-up session needed
        </span>
      </button>

      <button
        disabled={localSelectedId === null}
        onClick={() => onSelect(localSelectedId && localSelectedId > 0 ? localSelectedId : null, localSelectedLabel ?? undefined)}
        className="mt-5 w-full h-14 rounded-xl bg-emerald-600 text-white text-[16px] font-semibold active:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  );
}
