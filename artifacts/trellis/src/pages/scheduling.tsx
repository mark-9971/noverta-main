import { useState, useEffect } from "react";
import { Calendar } from "lucide-react";
import { useSearch, useLocation } from "wouter";
import Schedule from "./schedule";
import CoveragePage from "./coverage";

const TABS = [
  { key: "schedule" as const, label: "Weekly Schedule" },
  { key: "coverage" as const, label: "Coverage & Substitutes" },
];

type Tab = typeof TABS[number]["key"];
const VALID_KEYS = TABS.map(t => t.key);

function resolveTab(search: string): Tab {
  const p = new URLSearchParams(search).get("tab");
  return (p && VALID_KEYS.includes(p as Tab) ? p : "schedule") as Tab;
}

export default function SchedulingHub() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const [tab, setTabState] = useState<Tab>(() => resolveTab(search));

  useEffect(() => {
    setTabState(resolveTab(search));
  }, [search]);

  function setTab(t: Tab) {
    setTabState(t);
    navigate(`/scheduling?tab=${t}`, { replace: true });
  }

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
