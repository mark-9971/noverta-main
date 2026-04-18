import { useState, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { listStudents } from "@workspace/api-client-react";
import {
  Activity, ChevronLeft, ChevronRight, Search, Users,
  GraduationCap, Brain, BarChart2, RefreshCw,
} from "lucide-react";
import ProgramDataPage from "./program-data";
import BehaviorAssessmentPage from "./behavior-assessment";
import CaseloadAnalytics from "./program-data/CaseloadAnalytics";
import MaintenanceTab from "./program-data/MaintenanceTab";

interface Student { id: number; firstName: string; lastName: string; grade?: string | null; }

const SECTIONS = [
  {
    key: "analytics" as const,
    label: "Caseload",
    icon: BarChart2,
    desc: "Full caseload overview — at-risk flags, mastery rates, session activity, and program summaries across all learners",
    studentRequired: false,
  },
  {
    key: "programs" as const,
    label: "Programs & Data",
    icon: Activity,
    desc: "Data collection, behavior targets, skill programs, session log, and program templates — all in one place for the selected learner",
    studentRequired: true,
  },
  {
    key: "fba" as const,
    label: "Assessments",
    icon: Brain,
    desc: "Functional behavior assessments (FBA), ABC observation data, functional analysis sessions, and behavior intervention plans (BIP)",
    studentRequired: true,
  },
  {
    key: "maintenance" as const,
    label: "Maintenance",
    icon: RefreshCw,
    desc: "Probe schedule for mastered targets — upcoming, overdue, and completed probes across your caseload",
    studentRequired: false,
  },
];

type Section = "analytics" | "programs" | "fba" | "maintenance";
const VALID_SECTIONS: Section[] = ["analytics", "programs", "fba", "maintenance"];

function resolveSection(search: string): Section {
  const p = new URLSearchParams(search).get("tab");
  return (p && VALID_SECTIONS.includes(p as Section) ? p : "analytics") as Section;
}

export default function AbaHub() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [section, setSectionState] = useState<Section>(() => resolveSection(search));
  const [searchQuery, setSearchQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (listStudents as any)({ limit: 500 }).then((d: any) => {
      const list: Student[] = (Array.isArray(d) ? d : d?.students ?? [])
        .filter((s: any) => s.status === "active");
      setStudents(list);
      if (list.length > 0) setSelectedStudentId(list[0].id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setSectionState(resolveSection(search));
  }, [search]);

  function setSection(s: Section) {
    setSectionState(s);
    navigate(`/aba?tab=${s}`, { replace: true });
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const selectedIndex = students.findIndex(s => s.id === selectedStudentId);
  const currentSection = SECTIONS.find(s => s.key === section)!;
  const needsStudent = currentSection?.studentRequired ?? false;

  function selectStudent(id: number) {
    setSelectedStudentId(id);
    setPickerOpen(false);
    setSearchQuery("");
  }

  function prevStudent() {
    if (selectedIndex > 0) setSelectedStudentId(students[selectedIndex - 1].id);
  }
  function nextStudent() {
    if (selectedIndex < students.length - 1) setSelectedStudentId(students[selectedIndex + 1].id);
  }

  function viewStudentPrograms(id: number) {
    setSelectedStudentId(id);
    setSection("programs");
  }

  const filteredStudents = students.filter(s => {
    const q = searchQuery.toLowerCase();
    return !q || `${s.firstName} ${s.lastName}`.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-0">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <Activity className="w-4 h-4 text-white" />
            </span>
            ABA
          </h1>
          <p className="text-[12px] text-gray-400 mt-1 ml-10">
            Applied behavior analysis · programs · assessments · data collection
          </p>
        </div>

        {/* Student picker — only shown on student-specific sections */}
        {needsStudent && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 font-medium hidden sm:block">Learner</span>
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => { setPickerOpen(v => !v); setSearchQuery(""); }}
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-700 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all shadow-sm min-w-[180px] max-w-[240px]"
              >
                <Users className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                <span className="flex-1 text-left truncate font-medium">
                  {selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName}` : "Select learner…"}
                </span>
                <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${pickerOpen ? "rotate-90" : ""}`} />
              </button>

              {pickerOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                      <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <input
                        autoFocus
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search learners…"
                        className="bg-transparent text-[13px] text-gray-700 w-full outline-none placeholder-gray-400"
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {filteredStudents.length === 0 && (
                      <p className="px-3 py-3 text-[12px] text-gray-400 text-center">No learners found</p>
                    )}
                    {filteredStudents.map(s => (
                      <button
                        key={s.id}
                        onClick={() => selectStudent(s.id)}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-indigo-50 transition-colors ${
                          s.id === selectedStudentId ? "bg-indigo-50/60" : ""
                        }`}
                      >
                        <span className={`text-[13px] font-medium ${s.id === selectedStudentId ? "text-indigo-700" : "text-gray-700"}`}>
                          {s.firstName} {s.lastName}
                        </span>
                        {s.grade && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">Gr {s.grade}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-0.5">
              <button
                onClick={prevStudent}
                disabled={selectedIndex <= 0}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:text-gray-700 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                title="Previous learner"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={nextStudent}
                disabled={selectedIndex >= students.length - 1}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:text-gray-700 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                title="Next learner"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 gap-0 overflow-x-auto">
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const active = section === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`group flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 -mb-px transition-all whitespace-nowrap ${
                active
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-500"}`} />
              {s.label}
              {/* Subtle indicator for caseload-level vs student-level tabs */}
              {!s.studentRequired && (
                <span className="hidden sm:inline text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 ml-0.5">
                  caseload
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab description */}
      <div className="bg-gray-50/60 border-x border-b border-gray-100 rounded-b-lg px-4 py-2.5 mb-5">
        <p className="text-[12px] text-gray-500 leading-relaxed">
          {currentSection?.desc}
        </p>
      </div>

      {/* Caseload tab — cross-student */}
      {section === "analytics" && (
        <CaseloadAnalytics onViewStudent={viewStudentPrograms} />
      )}

      {/* Maintenance tab — cross-student */}
      {section === "maintenance" && (
        <MaintenanceTab />
      )}

      {/* Student-specific tabs */}
      {needsStudent && (
        <>
          {/* Selected learner context bar */}
          {selectedStudent && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-indigo-50/50 border border-indigo-100 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-bold text-indigo-700">
                  {selectedStudent.firstName[0]}{selectedStudent.lastName[0]}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-semibold text-indigo-800">
                  {selectedStudent.firstName} {selectedStudent.lastName}
                </span>
                {selectedStudent.grade && (
                  <span className="ml-2 text-[10px] text-indigo-400 font-medium">Grade {selectedStudent.grade}</span>
                )}
              </div>
              <span className="text-[10px] text-indigo-400">
                {selectedIndex + 1} of {students.length}
              </span>
            </div>
          )}

          {/* No learner selected */}
          {!selectedStudent && !loading && (
            <div className="text-center py-16 space-y-3">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                <GraduationCap className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-[14px] font-medium text-gray-500">No learner selected</p>
              <p className="text-[12px] text-gray-400 max-w-xs mx-auto">
                Use the Learner picker above, or visit the <button className="text-indigo-500 underline" onClick={() => setSection("analytics")}>Caseload</button> tab to browse all active learners.
              </p>
            </div>
          )}

          {selectedStudentId && section === "programs" && (
            <ProgramDataPage key={selectedStudentId} embedded externalStudentId={selectedStudentId} />
          )}
          {selectedStudentId && section === "fba" && (
            <BehaviorAssessmentPage key={selectedStudentId} embedded externalStudentId={selectedStudentId} />
          )}
        </>
      )}
    </div>
  );
}
