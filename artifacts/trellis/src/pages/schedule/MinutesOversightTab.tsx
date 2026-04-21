import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListStaff, useListSpedStudents, listServiceTypes, createScheduleBlock,
  getListStaffQueryKey, getListSpedStudentsQueryKey, useGetSession,
} from "@workspace/api-client-react";
import type {
  ServiceType, CreateScheduleBlockBody, SessionLog,
} from "@workspace/api-client-react";

type StudentListItem = {
  id: number;
  firstName: string;
  lastName: string;
};
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { RISK_CONFIG, RISK_PRIORITY_ORDER } from "@/lib/constants";
import { formatDate, formatTime } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useSearch } from "wouter";
import {
  AlertTriangle, Clock, TrendingDown, Users, Search,
  ArrowRight, CheckCircle2, CalendarPlus,
} from "lucide-react";
import { BlockFormDialog, BlockForm } from "./BlockFormDialog";

// Roles allowed to create schedule blocks inline. Mirrors the gating used on the
// parent Scheduling Hub (admin) plus the coordinator role explicitly named in
// the product requirement for this feature.
const SCHEDULING_ROLES = new Set(["admin", "coordinator"]);

interface MinuteRow {
  serviceRequirementId: number;
  studentId: number;
  studentName: string;
  serviceTypeId: number;
  serviceTypeName: string;
  providerName: string | null;
  intervalType: string;
  requiredMinutes: number;
  deliveredMinutes: number;
  remainingMinutes: number;
  percentComplete: number;
  riskStatus: string;
  missedSessionsCount: number;
}

const PRIORITY_STATUSES = ["out_of_compliance", "at_risk", "slightly_behind"];

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  out_of_compliance: AlertTriangle,
  at_risk: TrendingDown,
  slightly_behind: Clock,
  on_track: CheckCircle2,
};

function minuteBar(delivered: number, required: number) {
  const pct = required > 0 ? Math.min(100, (delivered / required) * 100) : 0;
  const color =
    pct >= 90 ? "bg-emerald-500" :
    pct >= 75 ? "bg-amber-400" :
    pct >= 50 ? "bg-orange-400" :
    "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-8 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

function SummaryBubble({
  status, count, label,
}: { status: string; count: number; label: string }) {
  const cfg = RISK_CONFIG[status] ?? RISK_CONFIG.on_track;
  const Icon = STATUS_ICON[status] ?? AlertTriangle;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-lg font-bold">{count}</span>
      <span className="text-xs font-normal opacity-80">{label}</span>
    </div>
  );
}

const DEFAULT_BLOCK_FORM: BlockForm = {
  staffId: "", studentId: "", serviceTypeId: "", dayOfWeek: "monday",
  startTime: "09:00", endTime: "10:00", location: "", blockLabel: "", notes: "",
  blockType: "service", isRecurring: true, rotationDay: "",
  recurrenceType: "weekly", effectiveFrom: "", effectiveTo: "",
};

export default function MinutesOversightTab() {
  const { filterParams, typedFilter } = useSchoolContext();
  const { role } = useRole();
  const canSchedule = SCHEDULING_ROLES.has(role);
  const queryClient = useQueryClient();
  const searchStr = useSearch();
  const queryFlags = useMemo(() => {
    const p = new URLSearchParams(searchStr);
    const sid = Number(p.get("studentId"));
    const reqId = Number(p.get("serviceRequirementId"));
    const msid = Number(p.get("missedSessionId"));
    const sourceItem = p.get("sourceActionItemId");
    return {
      preselectedStudentId: Number.isFinite(sid) && sid > 0 ? sid : null,
      preselectedRequirementId: Number.isFinite(reqId) && reqId > 0 ? reqId : null,
      preselectedMissedSessionId: Number.isFinite(msid) && msid > 0 ? msid : null,
      preselectedSourceActionItemId: sourceItem && sourceItem.length > 0 ? sourceItem : null,
      makeupIntent: p.get("intent") === "makeup",
      from: p.get("from") ?? null,
    };
  }, [searchStr]);
  const {
    preselectedStudentId, preselectedRequirementId, preselectedMissedSessionId,
    preselectedSourceActionItemId, makeupIntent, from,
  } = queryFlags;

  // Phase 1D — auto-open guard so we don't reopen the dialog every
  // render or after the user closes it. Resets when the launch context
  // (intent / studentId / requirementId / missedSessionId) changes.
  const autoOpenKey = `${makeupIntent ? "1" : "0"}:${preselectedStudentId ?? ""}:${preselectedRequirementId ?? ""}:${preselectedMissedSessionId ?? ""}`;
  const autoOpenedRef = useRef<string | null>(null);

  // Task 948 — fetch the missed session referenced in the URL so the banner
  // can show the missed-session date/time and we can fall back to its
  // serviceRequirementId / serviceTypeId when the URL omits them.
  const { data: missedSession, status: missedSessionStatus } = useGetSession(
    preselectedMissedSessionId ?? 0,
    {
      query: {
        enabled: !!preselectedMissedSessionId && makeupIntent,
        queryKey: [`/api/sessions/${preselectedMissedSessionId ?? 0}`],
      },
    },
  ) as { data: SessionLog | undefined; status: "pending" | "success" | "error" };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Inline scheduling dialog state
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [blockForm, setBlockForm] = useState<BlockForm>(DEFAULT_BLOCK_FORM);
  const [blockSaving, setBlockSaving] = useState(false);
  const [serviceTypesList, setServiceTypesList] = useState<ServiceType[]>([]);

  const { data: staffData } = useListStaff(typedFilter, {
    query: { enabled: canSchedule, queryKey: getListStaffQueryKey(typedFilter) },
  });
  const { data: studentsData } = useListSpedStudents(typedFilter, {
    query: { enabled: canSchedule, queryKey: getListSpedStudentsQueryKey(typedFilter) },
  });
  const staffList = staffData ?? [];
  const studentList: StudentListItem[] = (studentsData ?? []) as unknown as StudentListItem[];

  useEffect(() => {
    if (!canSchedule) return;
    listServiceTypes()
      .then(r => setServiceTypesList(Array.isArray(r) ? r : []))
      .catch(() => {});
  }, [canSchedule]);

  function buildMakeupNotes(missedId: number | null, row?: { serviceTypeName?: string | null } | null) {
    const ref = missedId ? ` (missed session #${missedId})` : "";
    const svc = row?.serviceTypeName ? ` for ${row.serviceTypeName}` : "";
    return `Makeup session${svc}${ref}`;
  }

  function openScheduleFor(
    row: { studentId: number; serviceTypeId: number | null; serviceTypeName?: string | null },
    opts?: { makeup?: boolean; missedSessionId?: number | null; sourceActionItemId?: string | null },
  ) {
    const isMakeup = !!opts?.makeup;
    const missedId = opts?.missedSessionId ?? null;
    setBlockForm({
      ...DEFAULT_BLOCK_FORM,
      studentId: String(row.studentId),
      serviceTypeId: row.serviceTypeId != null ? String(row.serviceTypeId) : "",
      blockType: isMakeup ? "makeup" : DEFAULT_BLOCK_FORM.blockType,
      blockLabel: isMakeup ? "Makeup" : "",
      notes: isMakeup ? buildMakeupNotes(missedId, row) : "",
      isRecurring: isMakeup ? false : DEFAULT_BLOCK_FORM.isRecurring,
      // T02 — carry the originating Action Center / Risk Report
      // handling-row id through the form so it lands on the created
      // schedule_block.source_action_item_id. Only meaningful for makeup
      // launches; left null on ordinary block creation.
      sourceActionItemId: isMakeup ? (opts?.sourceActionItemId ?? null) : null,
    });
    setScheduleDialogOpen(true);
  }

  async function handleSaveBlock() {
    if (!canSchedule) return;
    if (!blockForm.staffId) { toast.error("Staff is required"); return; }
    setBlockSaving(true);
    try {
      const payload: CreateScheduleBlockBody = {
        staffId: Number(blockForm.staffId),
        studentId: blockForm.studentId && blockForm.studentId !== "__none" ? Number(blockForm.studentId) : null,
        serviceTypeId: blockForm.serviceTypeId && blockForm.serviceTypeId !== "__none" ? Number(blockForm.serviceTypeId) : null,
        dayOfWeek: blockForm.dayOfWeek,
        startTime: blockForm.startTime,
        endTime: blockForm.endTime,
        location: blockForm.location || null,
        blockType: blockForm.blockType,
        notes: blockForm.notes || null,
        isRecurring: blockForm.isRecurring,
        rotationDay: blockForm.rotationDay || null,
        // T02 — Phase A wedge linkage. Persisted on schedule_blocks
        // .source_action_item_id so a created makeup block can be
        // traced back to the originating Action Center / Risk Report
        // handling row.
        sourceActionItemId: blockForm.sourceActionItemId ?? null,
      };
      await createScheduleBlock(payload);
      toast.success("Session scheduled");
      setScheduleDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["minute-progress-scheduling"] });
      queryClient.invalidateQueries({ queryKey: ["schedule/compliance"] });
    } catch {
      toast.error("Failed to schedule session");
    }
    setBlockSaving(false);
  }

  // Student record lookup for the preselected studentId — used to display a
  // human-readable name in the banner and search box instead of a raw id.
  const preselectedStudent = useMemo<StudentListItem | null>(() => {
    if (preselectedStudentId == null) return null;
    return studentList.find(s => s.id === preselectedStudentId) ?? null;
  }, [preselectedStudentId, studentList]);
  const preselectedStudentName = preselectedStudent
    ? `${preselectedStudent.firstName} ${preselectedStudent.lastName}`.trim()
    : null;

  useEffect(() => {
    if (preselectedStudentId == null) return;
    // Task 948 — prefill with the human-readable name once the student
    // record loads; fall back to the numeric id while loading so the
    // filter still narrows the table.
    setSearch(preselectedStudentName ?? String(preselectedStudentId));
  }, [preselectedStudentId, preselectedStudentName]);

  const queryParams = new URLSearchParams();
  if (filterParams.schoolId) queryParams.set("schoolId", filterParams.schoolId);
  if (filterParams.districtId) queryParams.set("districtId", filterParams.districtId);

  const { data: rows, isLoading, isError } = useQuery<MinuteRow[]>({
    queryKey: ["minute-progress-scheduling", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/minute-progress?${queryParams}`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  const allRows: MinuteRow[] = rows ?? [];

  // Phase 1D — when launched with `intent=makeup` and a target row is
  // identifiable, auto-open the BlockFormDialog prefilled for that
  // service requirement so the user lands directly on the next click
  // (pick a slot + save). We intentionally do NOT pre-write the block
  // — the user still confirms via the dialog.
  // Resolve the effective requirement id, preferring the URL value but
  // falling back to the missed session's serviceRequirementId.
  const effectiveRequirementId =
    preselectedRequirementId ?? missedSession?.serviceRequirementId ?? null;

  // Single source of truth for the auto-open target. Returns null whenever
  // the dialog cannot be auto-opened (no candidates, ambiguous multiple
  // candidates without a resolvable requirement, or requirement mismatch).
  const autoOpenTarget = useMemo<MinuteRow | null>(() => {
    if (!makeupIntent || preselectedStudentId == null) return null;
    const candidates = allRows.filter(r => r.studentId === preselectedStudentId);
    if (candidates.length === 0) return null;
    if (effectiveRequirementId != null) {
      return candidates.find(r => r.serviceRequirementId === effectiveRequirementId) ?? null;
    }
    return candidates.length === 1 ? candidates[0] : null;
  }, [makeupIntent, preselectedStudentId, effectiveRequirementId, allRows]);

  useEffect(() => {
    if (!makeupIntent || !canSchedule) return;
    if (preselectedStudentId == null) return;
    if (autoOpenedRef.current === autoOpenKey) return;
    // Wait for the missed session fetch to settle before deciding, but
    // only when the query is genuinely in flight. Use the data state
    // directly so an invalid/missing id doesn't block auto-open forever.
    if (preselectedMissedSessionId != null
        && missedSessionStatus !== "success"
        && missedSessionStatus !== "error") return;
    if (!autoOpenTarget) return;
    autoOpenedRef.current = autoOpenKey;
    openScheduleFor(autoOpenTarget, {
      makeup: true,
      missedSessionId: preselectedMissedSessionId,
      sourceActionItemId: preselectedSourceActionItemId,
    });
  }, [
    makeupIntent, canSchedule, preselectedStudentId, autoOpenTarget,
    preselectedMissedSessionId, missedSessionStatus, autoOpenKey,
    preselectedSourceActionItemId,
  ]);

  // Fallback launcher used by the banner CTA when no at-risk row matches.
  // Resolves student/service from the missed session record + studentList +
  // serviceTypesList so the dialog still opens prefilled.
  function openMakeupFallback() {
    if (preselectedStudentId == null) return;
    const serviceTypeId =
      missedSession?.serviceTypeId ??
      allRows.find(r =>
        r.studentId === preselectedStudentId &&
        (effectiveRequirementId == null || r.serviceRequirementId === effectiveRequirementId),
      )?.serviceTypeId ?? null;
    const serviceTypeName =
      missedSession?.serviceTypeName ??
      serviceTypesList.find(s => s.id === serviceTypeId)?.name ?? null;
    autoOpenedRef.current = autoOpenKey;
    openScheduleFor(
      { studentId: preselectedStudentId, serviceTypeId, serviceTypeName },
      { makeup: true, missedSessionId: preselectedMissedSessionId },
    );
  }

  // True when intent=makeup is set with a target student but the auto-open
  // path can't resolve a target row (no candidates, ambiguous multi-row
  // without a requirement, requirement mismatch, or missed-session fetch
  // didn't yield a usable fallback). In any of these cases the banner
  // must surface the explicit "Open scheduling form" CTA instead of
  // silently doing nothing.
  const missedSessionFetchSettled =
    preselectedMissedSessionId == null
    || missedSessionStatus === "success"
    || missedSessionStatus === "error";
  const noTargetCandidate =
    makeupIntent &&
    preselectedStudentId != null &&
    missedSessionFetchSettled &&
    autoOpenTarget == null;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of allRows) c[r.riskStatus] = (c[r.riskStatus] ?? 0) + 1;
    return c;
  }, [allRows]);

  const needsAttention = useMemo(
    () => allRows.filter(r => PRIORITY_STATUSES.includes(r.riskStatus)),
    [allRows],
  );

  const filtered = useMemo(() => {
    const src = statusFilter === "all"
      ? needsAttention
      : needsAttention.filter(r => r.riskStatus === statusFilter);
    const q = search.trim().toLowerCase();
    return q
      ? src.filter(r =>
          r.studentName.toLowerCase().includes(q) ||
          r.serviceTypeName.toLowerCase().includes(q) ||
          (r.providerName ?? "").toLowerCase().includes(q) ||
          String(r.studentId) === q,
        )
      : src;
  }, [needsAttention, statusFilter, search]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => {
      const oa = RISK_PRIORITY_ORDER.indexOf(a.riskStatus);
      const ob = RISK_PRIORITY_ORDER.indexOf(b.riskStatus);
      if (oa !== ob) return oa - ob;
      return b.remainingMinutes - a.remainingMinutes;
    }),
    [filtered],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        Could not load minute progress data. Check your connection and try again.
      </div>
    );
  }

  // Phase 1D — back-link target for the makeup launch workflow.
  const backHref =
    from === "action-center" ? "/action-center"
    : from === "compliance" ? "/compliance"
    : from === "student-detail" && preselectedStudentId != null
      ? `/students/${preselectedStudentId}`
      : null;
  const backLabel =
    from === "action-center" ? "Back to Action Center"
    : from === "compliance" ? "Back to Compliance"
    : from === "student-detail" ? "Back to student"
    : null;

  return (
    <div className="space-y-5">
      {makeupIntent && (() => {
        const rowMatch = preselectedStudentId != null
          ? allRows.find(x => x.studentId === preselectedStudentId &&
              (effectiveRequirementId == null || x.serviceRequirementId === effectiveRequirementId))
            ?? allRows.find(x => x.studentId === preselectedStudentId)
            ?? null
          : null;
          const displayStudentName =
            rowMatch?.studentName
            ?? preselectedStudentName
            ?? missedSession?.studentName
            ?? null;
          const displayServiceName =
            rowMatch?.serviceTypeName
            ?? missedSession?.serviceTypeName
            ?? null;
          const missedDate = missedSession?.sessionDate ? formatDate(missedSession.sessionDate) : null;
          const missedTime = missedSession?.startTime ? formatTime(missedSession.startTime) : null;
          return (
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-[12px] text-blue-800"
              data-testid="banner-makeup-intent"
            >
              <CalendarPlus className="w-4 h-4 shrink-0 text-blue-600" />
              <span className="flex-1 min-w-0">
                Scheduling a <strong>makeup session</strong>
                {displayStudentName && <> for <strong>{displayStudentName}</strong></>}
                {displayServiceName && <> · {displayServiceName}</>}
                {missedDate && (
                  <> for the missed session on <strong>{missedDate}</strong>{missedTime && <> · {missedTime}</>}</>
                )}
                .{" "}
                {noTargetCandidate
                  ? "We couldn't auto-open a row for this student — open the scheduling form to schedule the makeup directly."
                  : "Pick a slot below — the existing scheduling form is pre-filled."}
              </span>
              {canSchedule && (noTargetCandidate || preselectedMissedSessionId != null) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px] gap-1 border-blue-300 text-blue-700 hover:bg-blue-100"
                  onClick={openMakeupFallback}
                  data-testid="button-open-scheduling-form"
                >
                  <CalendarPlus className="w-3.5 h-3.5" /> Open scheduling form
                </Button>
              )}
              {backHref && backLabel && (
                <Link
                  href={backHref}
                  className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap"
                  data-testid="link-makeup-back"
                >
                  ← {backLabel}
                </Link>
              )}
            </div>
          );
      })()}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Service Minutes at Risk</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Students who need additional sessions scheduled this period to stay compliant.
          </p>
        </div>
        <Link href="/compliance" className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 font-medium shrink-0">
          View full compliance report <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <SummaryBubble status="out_of_compliance" count={counts.out_of_compliance ?? 0} label="out of compliance" />
        <SummaryBubble status="at_risk" count={counts.at_risk ?? 0} label="at risk" />
        <SummaryBubble status="slightly_behind" count={counts.slightly_behind ?? 0} label="slightly behind" />
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium bg-emerald-50 border-emerald-200 text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="text-lg font-bold">{counts.on_track ?? 0}</span>
          <span className="text-xs font-normal opacity-80">on track</span>
        </div>
      </div>

      {needsAttention.length === 0 && (
        <div className="text-center py-16">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">All students are on track</p>
          <p className="text-xs text-gray-400 mt-1">No students need priority scheduling right now.</p>
        </div>
      )}

      {needsAttention.length > 0 && (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Search student, service, or provider…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {[
                { key: "all", label: "All" },
                { key: "out_of_compliance", label: "Out of Compliance" },
                { key: "at_risk", label: "At Risk" },
                { key: "slightly_behind", label: "Behind" },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setStatusFilter(opt.key)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    statusFilter === opt.key
                      ? "bg-gray-800 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-400">
            Showing {sorted.length} of {needsAttention.length} students needing attention
          </div>

          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            {sorted.map(row => {
              const cfg = RISK_CONFIG[row.riskStatus] ?? RISK_CONFIG.on_track;
              return (
                <div key={row.serviceRequirementId} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/students/${row.studentId}`}
                        className="text-sm font-semibold text-gray-800 hover:text-emerald-700 truncate"
                      >
                        {row.studentName}
                      </Link>
                      <Badge className={`text-xs shrink-0 border ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {row.serviceTypeName}
                      {row.providerName && <span className="ml-2 text-gray-400">· {row.providerName}</span>}
                      <span className="ml-2 text-gray-400">· {row.intervalType}</span>
                    </div>
                    <div className="mt-2">
                      {minuteBar(row.deliveredMinutes, row.requiredMinutes)}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Shortfall</div>
                      <div className="text-sm font-bold text-red-600 tabular-nums">
                        {row.remainingMinutes > 0 ? `−${row.remainingMinutes} min` : "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Delivered</div>
                      <div className="text-sm font-medium text-gray-700 tabular-nums">
                        {row.deliveredMinutes}/{row.requiredMinutes}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Link
                        href={`/students/${row.studentId}`}
                        className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                      >
                        <Users className="w-3.5 h-3.5" /> View
                      </Link>
                      {canSchedule && (
                        <button
                          type="button"
                          onClick={() => openScheduleFor(row, makeupIntent && row.studentId === preselectedStudentId
                            ? { makeup: true, missedSessionId: preselectedMissedSessionId }
                            : undefined)}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" /> Schedule
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {sorted.length === 0 && search && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No students match "{search}"
            </div>
          )}
        </>
      )}

      <BlockFormDialog
        open={scheduleDialogOpen}
        onClose={() => setScheduleDialogOpen(false)}
        editingBlock={null}
        blockForm={blockForm}
        setBlockForm={setBlockForm}
        staffList={staffList}
        studentList={studentList}
        serviceTypesList={serviceTypesList}
        saving={blockSaving}
        onSave={handleSaveBlock}
      />
    </div>
  );
}
