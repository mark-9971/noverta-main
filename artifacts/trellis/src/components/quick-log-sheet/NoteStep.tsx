import { Check, AlertTriangle, Clock } from "lucide-react";

export function NoteStep({
  studentName, serviceTypeName, durationMinutes, outcome, note, makeupNeeded,
  missedReasonLabel, sessionDate, goalCount,
  onNoteChange, onSubmit, submitting,
}: {
  studentName: string;
  serviceTypeName: string;
  durationMinutes: number;
  outcome: "completed" | "missed";
  note: string;
  makeupNeeded: boolean;
  missedReasonLabel: string | null;
  sessionDate: string;
  goalCount?: number;
  onNoteChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const dateLabel = new Date(sessionDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="px-4 pt-5 pb-6 flex flex-col min-h-[calc(100vh-80px)]">
      <h2 className="text-xl font-bold text-gray-900">Confirm &amp; save</h2>
      <p className="text-sm text-gray-500 mt-1">Add an optional note, then save</p>

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
        <p className="text-[12px] text-gray-400 mt-0.5 ml-6">{dateLabel}</p>
        {outcome === "missed" && missedReasonLabel && (
          <p className="text-[12px] text-amber-600 mt-0.5 ml-6 font-medium">Reason: {missedReasonLabel}</p>
        )}
        {makeupNeeded && (
          <p className="text-[12px] text-blue-600 mt-0.5 ml-6 font-medium">Make-up needed</p>
        )}
        {(goalCount ?? 0) > 0 && (
          <p className="text-[12px] text-emerald-600 mt-0.5 ml-6 font-medium">{goalCount} goal{goalCount !== 1 ? "s" : ""} linked</p>
        )}
      </div>

      <textarea
        placeholder="Add a note… (optional)"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        maxLength={500}
        className="mt-4 w-full h-24 rounded-xl border border-gray-200 p-3 text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-gray-300"
      />
      <p className="text-right text-[11px] text-gray-300 mt-1">{note.length}/500</p>

      <div className="mt-auto pt-6">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="w-full h-16 rounded-2xl bg-emerald-600 text-white text-[18px] font-bold active:bg-emerald-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 shadow-lg"
        >
          {submitting ? (
            <Clock className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Check className="w-5 h-5" />
              Save Session
            </>
          )}
        </button>
      </div>
    </div>
  );
}
