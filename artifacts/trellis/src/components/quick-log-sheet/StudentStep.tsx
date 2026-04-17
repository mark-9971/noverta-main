import { Search, Zap, Repeat, Clock } from "lucide-react";
import type { Student, RecentCombo } from "./types";

export function StudentStep({
  students, recents, search, onSearch, onSelect, searchRef, recentCombos, onSelectCombo,
}: {
  students: Student[];
  recents: Student[];
  search: string;
  onSearch: (v: string) => void;
  onSelect: (id: number, name: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  recentCombos: RecentCombo[];
  onSelectCombo: (combo: RecentCombo) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-3">
        <h2 className="text-xl font-bold text-gray-900">Who are you working with?</h2>
        <p className="text-sm text-gray-500 mt-1">Select a student to log a session</p>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search students…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full h-12 pl-10 pr-4 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
        {!search && recentCombos.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Repeat className="w-3 h-3" /> Quick Repeat
            </p>
            <div className="space-y-1.5">
              {recentCombos.map((combo, i) => (
                <button
                  key={`${combo.studentId}-${combo.serviceTypeId}-${i}`}
                  onClick={() => onSelectCombo(combo)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors active:scale-[0.98] bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
                >
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[13px] font-bold flex-shrink-0">
                    {combo.studentName.charAt(0)}{combo.studentName.split(" ")[1]?.charAt(0) ?? ""}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-emerald-900 truncate">{combo.studentName}</p>
                    <p className="text-[12px] text-emerald-600 flex items-center gap-1">
                      {combo.serviceTypeName}
                      <span className="text-emerald-400">·</span>
                      <Clock className="w-3 h-3 inline" />
                      {combo.durationMinutes} min
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-2 py-1 rounded-lg flex-shrink-0">
                    1 tap
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!search && recents.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Recent Students
            </p>
            <div className="space-y-1.5">
              {recents.map((s) => (
                <StudentRow key={s.id} student={s} onSelect={onSelect} highlight />
              ))}
            </div>
          </div>
        )}

        <div>
          {(!search && (recents.length > 0 || recentCombos.length > 0)) && (
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">All Students</p>
          )}
          <div className="space-y-1.5">
            {students.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No students found</p>
            )}
            {students.map((s) => (
              <StudentRow key={s.id} student={s} onSelect={onSelect} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentRow({ student, onSelect, highlight }: { student: Student; onSelect: (id: number, name: string) => void; highlight?: boolean }) {
  const name = `${student.firstName} ${student.lastName}`;
  return (
    <button
      onClick={() => onSelect(student.id, name)}
      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-colors active:scale-[0.98] ${
        highlight ? "bg-emerald-50 border border-emerald-200" : "bg-gray-50 hover:bg-gray-100"
      }`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 ${
        highlight ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"
      }`}>
        {student.firstName[0]}{student.lastName[0]}
      </div>
      <span className="text-[15px] font-medium text-gray-900">{name}</span>
    </button>
  );
}
