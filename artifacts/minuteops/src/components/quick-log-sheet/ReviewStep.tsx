import { Check, AlertTriangle, Clock } from "lucide-react";

export function ReviewStep({ studentName, serviceTypeName, durationMinutes, outcome, note, makeupNeeded, missedReasonLabel, sessionDate, onSubmit, submitting }: {
  studentName: string;
  serviceTypeName: string;
  durationMinutes: number;
  outcome: "completed" | "missed";
  note: string;
  makeupNeeded: boolean;
  missedReasonLabel: string | null;
  sessionDate: string;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const dateLabel = new Date(sessionDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="px-4 pt-5 pb-6 flex flex-col min-h-[calc(100vh-80px)]">
      <h2 className="text-xl font-bold text-gray-900">Review & Confirm</h2>
      <p className="text-sm text-gray-500 mt-1">Double-check everything looks right</p>

      <div className="mt-5 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 overflow-hidden">
        <div className={`px-5 py-3 flex items-center gap-3 ${outcome === "completed" ? "bg-emerald-100" : "bg-amber-100"}`}>
          {outcome === "completed"
            ? <Check className="w-5 h-5 text-emerald-700" />
            : <AlertTriangle className="w-5 h-5 text-amber-700" />}
          <span className={`text-[16px] font-bold ${outcome === "completed" ? "text-emerald-800" : "text-amber-800"}`}>
            {outcome === "completed" ? "Completed Session" : "Missed Session"}
          </span>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-gray-500">Student</span>
            <span className="text-[14px] font-semibold text-gray-800">{studentName}</span>
          </div>
          {serviceTypeName && (
            <div className="flex justify-between items-center">
              <span className="text-[13px] text-gray-500">Service</span>
              <span className="text-[14px] font-medium text-gray-800">{serviceTypeName}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-gray-500">Duration</span>
            <span className="text-[14px] font-medium text-gray-800">{durationMinutes} min</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-gray-500">Date</span>
            <span className="text-[14px] font-medium text-gray-800">{dateLabel}</span>
          </div>
          {outcome === "missed" && missedReasonLabel && (
            <div className="flex justify-between items-center">
              <span className="text-[13px] text-gray-500">Missed Reason</span>
              <span className="text-[14px] font-medium text-amber-700">{missedReasonLabel}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-gray-500">Status</span>
            <span className={`text-[14px] font-medium capitalize ${outcome === "completed" ? "text-emerald-700" : "text-amber-700"}`}>{outcome}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-gray-500">IEP Goals</span>
            <span className="text-[14px] font-medium text-gray-800">0 goals linked</span>
          </div>
          {makeupNeeded && (
            <div className="flex justify-between items-center">
              <span className="text-[13px] text-gray-500">Make-up</span>
              <span className="text-[14px] font-medium text-blue-700">Needed</span>
            </div>
          )}
          {note.trim() && (
            <div className="pt-2 border-t border-emerald-200">
              <span className="text-[13px] text-gray-500">Notes</span>
              <p className="text-[13px] text-gray-700 mt-1 leading-snug">{note}</p>
            </div>
          )}
        </div>
      </div>

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
              Confirm & Save
            </>
          )}
        </button>
      </div>
    </div>
  );
}
