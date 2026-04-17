import { Check, AlertTriangle, SkipForward } from "lucide-react";

export function NoteStep({ studentName, serviceTypeName, durationMinutes, outcome, note, makeupNeeded, onNoteChange, onContinue }: {
  studentName: string;
  serviceTypeName: string;
  durationMinutes: number;
  outcome: "completed" | "missed";
  note: string;
  makeupNeeded: boolean;
  onNoteChange: (v: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="px-4 pt-5 pb-6 flex flex-col min-h-[calc(100vh-80px)]">
      <h2 className="text-xl font-bold text-gray-900">Any notes?</h2>
      <div className="flex items-center justify-between mt-1">
        <p className="text-sm text-gray-500">Optional — add context or observations</p>
        {outcome === "completed" && !note.trim() && (
          <button
            onClick={onContinue}
            className="text-[12px] font-medium text-emerald-600 flex items-center gap-1 hover:text-emerald-700 active:text-emerald-800"
          >
            Skip <SkipForward className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className={`mt-4 rounded-xl border-2 p-4 ${
        outcome === "completed" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }`}>
        <div className="flex items-center gap-2">
          {outcome === "completed"
            ? <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            : <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />}
          <p className={`text-[14px] font-semibold ${outcome === "completed" ? "text-emerald-800" : "text-amber-800"}`}>
            {outcome === "completed" ? "Completed" : "Missed"} · {studentName} · {durationMinutes} min
          </p>
        </div>
        {serviceTypeName && <p className="text-[12px] text-gray-500 mt-1 ml-6">{serviceTypeName}</p>}
        {makeupNeeded && (
          <p className="text-[12px] text-blue-600 mt-1 ml-6 font-medium">Make-up needed</p>
        )}
      </div>

      <textarea
        placeholder="Add a note… (e.g. student was distracted, worked on goal X)"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        maxLength={500}
        className="mt-4 w-full h-28 rounded-xl border border-gray-200 p-3 text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-gray-300"
      />
      <p className="text-right text-[11px] text-gray-300 mt-1">{note.length}/500</p>

      <div className="mt-auto pt-6">
        <button
          onClick={onContinue}
          className="w-full h-16 rounded-2xl bg-emerald-600 text-white text-[18px] font-bold active:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-lg"
        >
          <Check className="w-5 h-5" />
          Review
        </button>
      </div>
    </div>
  );
}
