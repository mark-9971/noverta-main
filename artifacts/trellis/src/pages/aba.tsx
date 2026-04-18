import { useState, useEffect } from "react";
import { listStudents } from "@workspace/api-client-react";
import { Activity } from "lucide-react";
import ProgramDataPage from "./program-data";
import BehaviorAssessmentPage from "./behavior-assessment";
import CaseloadAnalytics from "./program-data/CaseloadAnalytics";

const SECTIONS = [
  { key: "analytics" as const, label: "Analytics" },
  { key: "programs" as const, label: "Programs & Behaviors" },
  { key: "fba" as const, label: "FBA / BIP" },
];

export default function AbaHub() {
  const [students, setStudents] = useState<Array<{ id: number; firstName: string; lastName: string }>>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [studentInput, setStudentInput] = useState("");
  const [section, setSection] = useState<"analytics" | "programs" | "fba">("analytics");

  useEffect(() => {
    (listStudents as any)({ limit: 200 }).then((d: any) => {
      const list = (Array.isArray(d) ? d : d?.students ?? []).filter((s: any) => s.status === "active");
      setStudents(list);
      if (list.length > 0) {
        setSelectedStudentId(list[0].id);
        setStudentInput(`${list[0].firstName} ${list[0].lastName}`);
      }
    }).catch(() => {});
  }, []);

  function handleStudentInput(value: string) {
    setStudentInput(value);
    const match = students.find(s => `${s.firstName} ${s.lastName}` === value);
    if (match) setSelectedStudentId(match.id);
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500" />
            ABA
          </h1>
          <p className="text-xs text-gray-400 mt-1">Applied behavior analysis — programs, assessments & data</p>
        </div>

        {section !== "analytics" && (
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">Student</label>
            <input
              type="text"
              list="aba-student-list"
              value={studentInput}
              onChange={e => handleStudentInput(e.target.value)}
              placeholder="Search student…"
              className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 w-52"
            />
            <datalist id="aba-student-list">
              {students.map(s => (
                <option key={s.id} value={`${s.firstName} ${s.lastName}`} />
              ))}
            </datalist>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              section === s.key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "analytics" && <CaseloadAnalytics />}

      {section !== "analytics" && !selectedStudentId && (
        <div className="text-center py-12 text-sm text-gray-400">
          Search for a student above to begin
        </div>
      )}

      {selectedStudentId && section === "programs" && (
        <ProgramDataPage embedded externalStudentId={selectedStudentId} />
      )}
      {selectedStudentId && section === "fba" && (
        <BehaviorAssessmentPage embedded externalStudentId={selectedStudentId} />
      )}
    </div>
  );
}
