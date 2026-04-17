import { Check, AlertTriangle } from "lucide-react";

export function OutcomeStep({ studentName, durationMinutes, onSelect }: {
  studentName: string;
  durationMinutes: number;
  onSelect: (o: "completed" | "missed") => void;
}) {
  return (
    <div className="px-4 pt-5 pb-6">
      <h2 className="text-xl font-bold text-gray-900">How did it go?</h2>
      <p className="text-sm text-gray-500 mt-1">{studentName} · {durationMinutes} min</p>

      <div className="mt-8 space-y-4">
        <button
          onClick={() => onSelect("completed")}
          className="w-full h-24 rounded-2xl bg-emerald-50 border-2 border-emerald-200 flex items-center gap-5 px-6 text-left active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Check className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-[18px] font-bold text-emerald-800">Completed</p>
            <p className="text-[13px] text-emerald-600">Session ran as planned</p>
          </div>
        </button>

        <button
          onClick={() => onSelect("missed")}
          className="w-full h-24 rounded-2xl bg-amber-50 border-2 border-amber-200 flex items-center gap-5 px-6 text-left active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-[18px] font-bold text-amber-800">Missed</p>
            <p className="text-[13px] text-amber-600">Session did not occur</p>
          </div>
        </button>
      </div>
    </div>
  );
}
