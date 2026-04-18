import { useState } from "react";
import { GraduationCap } from "lucide-react";
import IepMeetings from "./iep-meetings";
import IepCalendar from "./iep-calendar";
import IepSearch from "./iep-search";
import AccommodationLookup from "./accommodation-lookup";

const TABS = [
  { key: "meetings" as const, label: "Meetings" },
  { key: "calendar" as const, label: "Calendar" },
  { key: "search" as const, label: "Search" },
  { key: "accommodations" as const, label: "Accommodations" },
];

type Tab = typeof TABS[number]["key"];

export default function IepHub() {
  const [tab, setTab] = useState<Tab>("meetings");

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2 tracking-tight">
          <GraduationCap className="w-5 h-5 text-emerald-600" />
          IEP
        </h1>
        <p className="text-xs text-gray-400 mt-1">Meetings, compliance calendar, document search, and accommodation tracking</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
              tab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "meetings" && <IepMeetings embedded />}
      {tab === "calendar" && <IepCalendar embedded />}
      {tab === "search" && <IepSearch embedded />}
      {tab === "accommodations" && <AccommodationLookup embedded />}
    </div>
  );
}
