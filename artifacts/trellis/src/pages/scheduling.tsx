import { useState } from "react";
import { Calendar } from "lucide-react";
import Schedule from "./schedule";
import CoveragePage from "./coverage";

const TABS = [
  { key: "schedule" as const, label: "Weekly Schedule" },
  { key: "coverage" as const, label: "Coverage & Substitutes" },
];

type Tab = typeof TABS[number]["key"];

export default function SchedulingHub() {
  const [tab, setTab] = useState<Tab>("schedule");

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2 tracking-tight">
          <Calendar className="w-5 h-5 text-emerald-600" />
          Scheduling
        </h1>
        <p className="text-xs text-gray-400 mt-1">Weekly schedule blocks, absences, and coverage management</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "schedule" && <Schedule embedded />}
      {tab === "coverage" && <CoveragePage embedded />}
    </div>
  );
}
