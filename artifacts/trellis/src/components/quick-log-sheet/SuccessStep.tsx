import { CheckCircle, UserPlus, Plus } from "lucide-react";

export function SuccessStep({ studentName, serviceTypeName, durationMinutes, outcome, onLogAnotherSameStudent, onLogAnother, onDone }: {
  studentName: string;
  serviceTypeName: string;
  durationMinutes: number;
  outcome: "completed" | "missed";
  onLogAnotherSameStudent: () => void;
  onLogAnother: () => void;
  onDone: () => void;
}) {
  return (
    <div
      className="px-4 pt-8 pb-6 flex flex-col items-center"
      style={{ minHeight: "calc(100dvh - 0px)", paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))" }}
    >
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
        <CheckCircle className="w-9 h-9 text-emerald-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-900">
        {outcome === "completed" ? "Session Logged!" : "Missed Session Recorded"}
      </h2>
      <p className="text-sm text-gray-500 mt-1">
        {studentName} · {serviceTypeName} · {durationMinutes} min
      </p>

      <div className="w-full mt-10 space-y-3">
        {/* Done is the primary action — most users just want to close */}
        <button
          onClick={onDone}
          className="w-full h-16 rounded-2xl bg-emerald-600 text-white text-[17px] font-bold active:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-md"
        >
          Done
        </button>

        <button
          onClick={onLogAnotherSameStudent}
          className="w-full h-14 rounded-2xl bg-emerald-50 border-2 border-emerald-200 text-emerald-800 text-[15px] font-semibold active:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Log Another for {studentName.split(" ")[0]}
        </button>

        <button
          onClick={onLogAnother}
          className="w-full h-12 rounded-2xl bg-gray-50 border border-gray-200 text-gray-600 text-[14px] font-medium active:bg-gray-100 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Log Different Session
        </button>
      </div>
    </div>
  );
}
