import { DURATION_PRESETS } from "./types";

export function DurationStep({
  studentName, serviceTypeName, selected, customValue, onCustomChange, onSelect,
}: {
  studentName: string;
  serviceTypeName: string;
  selected: number;
  customValue: string;
  onCustomChange: (v: string) => void;
  onSelect: (min: number) => void;
}) {
  return (
    <div className="px-4 pt-5 pb-6">
      <h2 className="text-xl font-bold text-gray-900">How long?</h2>
      <p className="text-sm text-gray-500 mt-1">{studentName} · {serviceTypeName}</p>

      <div className="grid grid-cols-3 gap-3 mt-6">
        {DURATION_PRESETS.map((min) => (
          <button
            key={min}
            onClick={() => onSelect(min)}
            className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-center transition-all active:scale-[0.96] border-2 ${
              selected === min
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-800"
            }`}
          >
            <span className="text-2xl font-bold leading-none">{min}</span>
            <span className="text-[11px] text-gray-400 font-medium">min</span>
          </button>
        ))}

        <div className="h-20 rounded-2xl border-2 border-dashed border-gray-200 bg-white flex flex-col items-center justify-center gap-1 overflow-hidden">
          <span className="text-[11px] text-gray-400 font-medium">Custom</span>
          <input
            type="number"
            min="1"
            max="240"
            placeholder="—"
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            onBlur={() => {
              const v = parseInt(customValue);
              if (v > 0 && v <= 240) onSelect(v);
            }}
            className="w-16 text-center text-[18px] font-bold text-gray-800 border-0 outline-none bg-transparent"
          />
        </div>
      </div>
    </div>
  );
}
