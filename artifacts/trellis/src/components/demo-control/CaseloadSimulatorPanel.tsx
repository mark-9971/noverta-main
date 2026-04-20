/**
 * Panel 6 — Caseload balancing simulator.
 *
 * Loads providers + students for the active demo district from the read-only
 * /demo-control/caseload-providers endpoint. The runner can:
 *  - Move students between providers (drag-and-drop or click-to-move).
 *  - Mark a provider as on leave / vacant — their students become uncovered.
 *
 * All changes live in component state. Nothing is persisted — the panel
 * never writes back. "Scenarios persist only to the demo district" is satisfied
 * by the fact that the seed data we read is itself demo-only and the scenario
 * resets on reload.
 *
 * Caseload thresholds use the same defaults as routes/caseloadBalancing.ts so
 * overload counts line up with the production caseload page.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, RotateCcw, UserX } from "lucide-react";

interface Props {
  districtId: number;
}

interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
  title: string | null;
  schoolId: number | null;
}
interface Student {
  id: number;
  firstName: string;
  lastName: string;
  grade: string | null;
  schoolId: number | null;
  caseManagerId: number | null;
}
interface ApiResp {
  providers: Provider[];
  students: Student[];
}

const THRESHOLDS: Record<string, number> = {
  bcba: 15, provider: 30, sped_teacher: 20, para: 10, case_manager: 25,
  coordinator: 40, teacher: 30, admin: 50,
};

const UNCOVERED = -1; // sentinel "case manager" id

export default function CaseloadSimulatorPanel({ districtId }: Props) {
  const { data, isLoading } = useQuery<ApiResp>({
    queryKey: ["demo-control", "caseload-providers", districtId],
    queryFn: () => apiGet<ApiResp>(`/api/demo-control/caseload-providers?districtId=${districtId}`),
  });

  // Scenario state: studentId -> assignedProviderId (or UNCOVERED).
  const [assignment, setAssignment] = useState<Record<number, number>>({});
  // Vacancies: providerId -> true.
  const [vacant, setVacant] = useState<Record<number, boolean>>({});

  // Seed assignment from API the first time data lands.
  useEffect(() => {
    if (!data) return;
    const next: Record<number, number> = {};
    for (const s of data.students) {
      next[s.id] = s.caseManagerId ?? UNCOVERED;
    }
    setAssignment(next);
    setVacant({});
  }, [data]);

  const providers = data?.providers ?? [];
  const students = data?.students ?? [];

  // Derive caseload counts from current scenario, treating vacant providers
  // as having zero load (their students show as uncovered).
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    let uncovered = 0;
    for (const s of students) {
      const aid = assignment[s.id] ?? UNCOVERED;
      if (aid === UNCOVERED || vacant[aid]) { uncovered++; continue; }
      m.set(aid, (m.get(aid) ?? 0) + 1);
    }
    return { byProvider: m, uncovered };
  }, [students, assignment, vacant]);

  const summary = useMemo(() => {
    let overload = 0;
    for (const p of providers) {
      if (vacant[p.id]) continue;
      const t = THRESHOLDS[p.role] ?? 25;
      if ((counts.byProvider.get(p.id) ?? 0) > t) overload++;
    }
    return {
      providers: providers.length,
      overloaded: overload,
      uncovered: counts.uncovered,
      vacancies: Object.values(vacant).filter(Boolean).length,
    };
  }, [providers, counts, vacant]);

  function move(studentId: number, toProviderId: number) {
    setAssignment(prev => ({ ...prev, [studentId]: toProviderId }));
  }

  function reset() {
    if (!data) return;
    const next: Record<number, number> = {};
    for (const s of data.students) next[s.id] = s.caseManagerId ?? UNCOVERED;
    setAssignment(next);
    setVacant({});
  }

  function toggleVacancy(pid: number) {
    setVacant(prev => ({ ...prev, [pid]: !prev[pid] }));
  }

  function onDragStart(e: React.DragEvent, studentId: number) {
    e.dataTransfer.setData("text/student", String(studentId));
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function onDrop(e: React.DragEvent, providerId: number) {
    e.preventDefault();
    const sid = Number(e.dataTransfer.getData("text/student"));
    if (Number.isFinite(sid) && sid > 0) move(sid, providerId);
  }

  // Limit the rendered roster to a sensible size for live demos.
  const visibleProviders = providers.slice(0, 10);

  return (
    <Card data-testid="demo-control-slot-6">
      <CardHeader className="py-3 bg-blue-50 border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px]">6</span>
          <Users className="w-4 h-4 text-blue-600" />
          Caseload balancing simulator
          <Button
            onClick={reset}
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-[11px] gap-1"
            data-testid="button-caseload-reset"
            disabled={isLoading || !data}
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Providers" value={String(summary.providers)} />
          <Stat label="Overloaded" value={String(summary.overloaded)} warn={summary.overloaded > 0} />
          <Stat label="Vacancies" value={String(summary.vacancies)} warn={summary.vacancies > 0} />
          <Stat label="Uncovered" value={String(summary.uncovered)} warn={summary.uncovered > 0} />
        </div>

        {isLoading && <div className="text-xs text-gray-500">Loading caseload…</div>}

        {!isLoading && providers.length === 0 && (
          <div className="text-xs text-gray-500">No active providers in this demo district yet.</div>
        )}

        <div
          className="space-y-2 max-h-[320px] overflow-y-auto pr-1"
          data-testid="caseload-provider-list"
        >
          {visibleProviders.map(p => {
            const load = counts.byProvider.get(p.id) ?? 0;
            const t = THRESHOLDS[p.role] ?? 25;
            const isVacant = !!vacant[p.id];
            const overloaded = !isVacant && load > t;
            const assigned = students.filter(s => (assignment[s.id] ?? UNCOVERED) === p.id);
            return (
              <div
                key={p.id}
                onDragOver={onDragOver}
                onDrop={(e) => !isVacant && onDrop(e, p.id)}
                className={`border rounded p-2 ${isVacant ? "bg-gray-100 opacity-60" : overloaded ? "bg-red-50 border-red-200" : "bg-white"}`}
                data-testid={`provider-row-${p.id}`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-800 truncate">
                      {p.firstName} {p.lastName}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {p.role} · threshold {t}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`tabular-nums ${overloaded ? "border-red-400 text-red-700" : ""}`}
                    data-testid={`provider-load-${p.id}`}
                  >
                    {load}/{t}
                  </Badge>
                  <Button
                    size="sm" variant="ghost"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => toggleVacancy(p.id)}
                    data-testid={`button-vacancy-${p.id}`}
                    title={isVacant ? "Restore provider" : "Simulate vacancy / leave"}
                  >
                    <UserX className="w-3 h-3" />
                    {isVacant ? "Restore" : "On leave"}
                  </Button>
                </div>

                {assigned.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {assigned.slice(0, 12).map(s => (
                      <span
                        key={s.id}
                        draggable={!isVacant}
                        onDragStart={(e) => onDragStart(e, s.id)}
                        className={`text-[10px] border rounded px-1.5 py-0.5 ${isVacant ? "bg-gray-200 cursor-not-allowed" : "bg-blue-50 border-blue-200 cursor-grab hover:bg-blue-100"}`}
                        data-testid={`student-chip-${s.id}`}
                        title="Drag to move to another provider"
                      >
                        {s.firstName} {s.lastName.charAt(0)}.
                      </span>
                    ))}
                    {assigned.length > 12 && (
                      <span className="text-[10px] text-gray-500">+{assigned.length - 12} more</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-gray-500 italic pt-1 border-t">
          Drag a student chip onto another provider to rebalance, or use "On leave" to simulate a vacancy.
          Scenario lives in this panel only — nothing is written back to the database.
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="border rounded p-2 text-center bg-gray-50">
      <div className="text-[9px] uppercase text-gray-500 tracking-wide">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${warn ? "text-red-600" : "text-blue-700"}`}>
        {value}
      </div>
    </div>
  );
}
