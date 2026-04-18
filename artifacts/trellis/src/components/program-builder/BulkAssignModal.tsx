import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  X, Search, CheckSquare, Square, Users, AlertTriangle,
  CheckCircle2, XCircle, SkipForward, Loader2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { listStudents, customFetch } from "@workspace/api-client-react";
import { ProgramTemplate } from "./template-types";

interface Props {
  template: ProgramTemplate;
  onClose: () => void;
  onAssigned: () => void;
}

type Student = {
  id: number;
  firstName: string;
  lastName: string;
  grade?: string | null;
  schoolName?: string | null;
  status: string;
};

type OnDuplicate = "skip" | "reassign";

type AssignResultItem = {
  studentId: number;
  status: "assigned" | "skipped" | "reassigned" | "error";
  message?: string;
  targetId?: number;
  existingTargetId?: number;
};

type BulkResult = {
  total: number;
  assigned: number;
  skipped: number;
  reassigned: number;
  errors: number;
  results: AssignResultItem[];
};

export function BulkAssignModal({ template, onClose, onAssigned }: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [alreadyAssignedIds, setAlreadyAssignedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [onDuplicate, setOnDuplicate] = useState<OnDuplicate>("skip");
  const [assigning, setAssigning] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [stuResp, assignedResp] = await Promise.all([
          listStudents({ status: "active", limit: 500 } as any),
          customFetch<{ studentIds: number[] }>(
            `/api/program-templates/${template.id}/assigned-students`,
          ),
        ]);
        const stuList = (stuResp as any).students ?? (stuResp as any).data ?? stuResp;
        setStudents(Array.isArray(stuList) ? stuList : []);
        setAlreadyAssignedIds(new Set(assignedResp.studentIds ?? []));
      } catch (e) {
        toast.error("Failed to load students");
      }
      setLoading(false);
    }
    load();
  }, [template.id]);

  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(
      s =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
        (s.schoolName ?? "").toLowerCase().includes(q) ||
        (s.grade ?? "").toLowerCase().includes(q),
    );
  }, [students, search]);

  function toggleStudent(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map(s => s.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  const selectedList = useMemo(() => [...selected], [selected]);
  const willReceive = useMemo(
    () => selectedList.filter(id =>
      onDuplicate === "reassign" || !alreadyAssignedIds.has(id)
    ).length,
    [selectedList, alreadyAssignedIds, onDuplicate],
  );
  const willSkip = useMemo(
    () =>
      onDuplicate === "skip"
        ? selectedList.filter(id => alreadyAssignedIds.has(id)).length
        : 0,
    [selectedList, alreadyAssignedIds, onDuplicate],
  );
  const willReassign = useMemo(
    () =>
      onDuplicate === "reassign"
        ? selectedList.filter(id => alreadyAssignedIds.has(id)).length
        : 0,
    [selectedList, alreadyAssignedIds, onDuplicate],
  );

  async function assign() {
    if (selected.size === 0) return;
    setAssigning(true);
    try {
      const data = await customFetch<BulkResult>(
        `/api/program-templates/${template.id}/bulk-clone`,
        {
          method: "POST",
          body: JSON.stringify({ studentIds: selectedList, onDuplicate }),
        },
      );
      setResult(data);
      if (data.assigned + data.reassigned > 0) {
        onAssigned();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to bulk assign");
    }
    setAssigning(false);
  }

  const nameMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of students) m.set(s.id, `${s.firstName} ${s.lastName}`);
    return m;
  }, [students]);

  if (result) {
    return (
      <div
        className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-gray-800">Assignment Complete</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[
                { label: "Assigned", value: result.assigned, color: "text-emerald-700", bg: "bg-emerald-50" },
                { label: "Reassigned", value: result.reassigned, color: "text-blue-700", bg: "bg-blue-50" },
                { label: "Skipped", value: result.skipped, color: "text-amber-700", bg: "bg-amber-50" },
                { label: "Errors", value: result.errors, color: "text-red-700", bg: "bg-red-50" },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`rounded-lg p-3 ${bg}`}>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-[11px] text-gray-500">{label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1 max-h-64 overflow-y-auto">
              {result.results.map(r => {
                const name = nameMap.get(r.studentId) ?? `Student #${r.studentId}`;
                const icon =
                  r.status === "assigned" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : r.status === "reassigned" ? (
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  ) : r.status === "skipped" ? (
                    <SkipForward className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  );
                return (
                  <div
                    key={r.studentId}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 text-[12px]"
                  >
                    {icon}
                    <span className="flex-1 font-medium text-gray-700">{name}</span>
                    <span className="text-gray-400 capitalize">{r.status}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 border-t border-gray-100 flex justify-end">
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-xl shadow-xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-[15px] font-bold text-gray-800">Assign to Multiple Students</h2>
            <p className="text-[12px] text-gray-400 mt-0.5 truncate max-w-xs">"{template.name}"</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : (
          <>
            {/* Search + select-all */}
            <div className="px-4 pt-4 pb-2 space-y-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search students..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>
                  {filtered.length} student{filtered.length !== 1 ? "s" : ""}
                  {search ? " matching" : ""}
                </span>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-emerald-700 hover:underline font-medium">
                    Select all
                  </button>
                  <span>·</span>
                  <button onClick={deselectAll} className="text-gray-500 hover:underline">
                    Deselect all
                  </button>
                </div>
              </div>
            </div>

            {/* Student list */}
            <div className="flex-1 overflow-y-auto px-4 pb-1">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No active students found
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map(s => {
                    const isSelected = selected.has(s.id);
                    const hasProgram = alreadyAssignedIds.has(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleStudent(s.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                          isSelected
                            ? "bg-emerald-50 border border-emerald-200"
                            : "border border-transparent hover:bg-gray-50"
                        }`}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-700 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-300 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-800 truncate">
                            {s.firstName} {s.lastName}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {[s.grade && `Grade ${s.grade}`, s.schoolName].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {hasProgram && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">
                            Has program
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Duplicate policy */}
            {selected.size > 0 && (
              <div className="px-4 pt-3 pb-1 border-t border-gray-100 shrink-0">
                <p className="text-[11px] font-semibold text-gray-500 mb-2">
                  When a student already has this program:
                </p>
                <div className="flex gap-2">
                  {(["skip", "reassign"] as OnDuplicate[]).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setOnDuplicate(opt)}
                      className={`flex-1 py-2 rounded-lg border text-[11px] font-medium transition-all ${
                        onDuplicate === opt
                          ? "bg-gray-800 text-white border-gray-800"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {opt === "skip" ? "Skip (keep existing)" : "Reassign (reset program)"}
                    </button>
                  ))}
                </div>
                {onDuplicate === "reassign" && willReassign > 0 && (
                  <div className="flex items-start gap-1.5 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-amber-800">
                      Reassignment deactivates existing program targets and creates fresh copies.
                      Historical data and progress for those students is preserved but their programs restart.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Preview + action */}
            <div className="px-4 py-4 border-t border-gray-100 shrink-0 space-y-3">
              {selected.size > 0 && (
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {willReceive > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                      {willReceive} will receive program
                    </span>
                  )}
                  {willSkip > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      {willSkip} will be skipped (already assigned)
                    </span>
                  )}
                  {willReassign > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                      {willReassign} will be reassigned
                    </span>
                  )}
                </div>
              )}

              <div className="flex gap-2 items-center justify-between">
                <span className="text-[12px] text-gray-500">
                  {selected.size === 0
                    ? "Select students to assign"
                    : `${selected.size} student${selected.size !== 1 ? "s" : ""} selected`}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-[12px] h-9" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-9"
                    disabled={selected.size === 0 || assigning || willReceive === 0}
                    onClick={assign}
                  >
                    {assigning ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Assigning...</>
                    ) : (
                      <>
                        <Users className="w-3.5 h-3.5 mr-1" />
                        Assign to {willReceive > 0 ? willReceive : selected.size} Student{willReceive !== 1 ? "s" : ""}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
