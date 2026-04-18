import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Sparkles, Search, User, ChevronRight, Clock, FolderOpen } from "lucide-react";
import { listSpedStudents } from "@workspace/api-client-react";
import { useSchoolContext } from "@/lib/school-context";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth-fetch";
import { API_BASE } from "./iep-builder/types";

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  grade: string | null;
}

interface InProgressDraft {
  studentId: number;
  wizardStep: number;
  updatedAt: string;
  lastEditorName: string | null;
}

export default function IepBuilderLanding() {
  const [, navigate] = useLocation();
  const { selectedSchoolId } = useSchoolContext();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [draftsMap, setDraftsMap] = useState<Map<number, InProgressDraft>>(new Map());

  useEffect(() => {
    Promise.all([
      listSpedStudents(selectedSchoolId ? { schoolId: selectedSchoolId } as any : undefined)
        .then((data: any) => Array.isArray(data) ? data : data?.students ?? [])
        .catch(() => [] as Student[]),
      authFetch(`${API_BASE}/iep-builder/drafts`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => [] as InProgressDraft[]),
    ]).then(([studentList, draftList]) => {
      setStudents(studentList);
      const map = new Map<number, InProgressDraft>();
      for (const d of draftList as InProgressDraft[]) {
        map.set(d.studentId, d);
      }
      setDraftsMap(map);
    }).finally(() => setLoading(false));
  }, [selectedSchoolId]);

  const filtered = students.filter(s =>
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(q.toLowerCase())
  );

  const inProgressCount = filtered.filter(s => draftsMap.has(s.id)).length;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[700px] mx-auto space-y-6" data-tour-id="showcase-iep-builder">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2 tracking-tight">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          IEP Draft Builder
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Select a student to start or continue the team's shared IEP draft.
        </p>
        {!loading && inProgressCount > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
            <FolderOpen className="w-3.5 h-3.5" />
            {inProgressCount} draft{inProgressCount !== 1 ? "s" : ""} in progress
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search students…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No students found</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(s => {
            const draft = draftsMap.get(s.id);
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/students/${s.id}/iep-builder`)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-white hover:bg-emerald-50 hover:border-emerald-200 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{s.firstName} {s.lastName}</p>
                  {draft ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-emerald-500 shrink-0" />
                      <p className="text-xs text-emerald-600 truncate">
                        Draft in progress · step {draft.wizardStep}
                        {draft.lastEditorName && ` · last saved by ${draft.lastEditorName}`}
                        {" · "}{new Date(draft.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  ) : (
                    s.grade && <p className="text-xs text-gray-400">Grade {s.grade}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {draft ? (
                    <span className="text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5 transition-colors">
                      Open for Editing
                    </span>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
