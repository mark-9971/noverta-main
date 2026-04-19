import { useMemo, useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useRole } from "@/lib/role-context";
import { QuickLogSheet } from "@/components/quick-log-sheet";
import {
  useListAlerts,
  useListScheduleBlocks,
  useListSessions,
  useListServiceRequirements,
  useListStudents,
  useListStaff,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Calendar, Clock, AlertTriangle, ClipboardList, CheckCircle2,
  Users, Timer, ArrowRight, MapPin, AlertCircle, ArrowLeftRight,
} from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SUPERVISOR_ROLES = new Set(["admin", "coordinator", "case_manager"]);

// Local-timezone date as YYYY-MM-DD (avoid UTC drift that toISOString causes)
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayInfo() {
  const d = new Date();
  return {
    date: localDateStr(d),
    dayName: DAY_NAMES[d.getDay()],
    dayOfWeek: d.getDay(), // 0=Sun..6=Sat
    label: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    isWeekend: d.getDay() === 0 || d.getDay() === 6,
  };
}

function weekStartIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return localDateStr(d);
}

// How much of the school week has elapsed (Mon..Fri).
// Used to fairly pro-rate the "at risk" threshold so Monday providers aren't
// flagged for not having delivered a full week of minutes yet.
// Returns 0..1. Mon-of-day = 0.2 (1/5), Fri end-of-day = 1.0, weekend = 1.0.
function weekProgressFraction(dayOfWeek: number): number {
  // Sun=0, Mon=1, ..., Fri=5, Sat=6
  if (dayOfWeek === 0) return 0; // Sunday — week hasn't started
  if (dayOfWeek >= 6) return 1; // Saturday — full week elapsed
  return Math.min(1, dayOfWeek / 5); // Mon=0.2, Tue=0.4, ..., Fri=1.0
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "p" : "a";
  const hh = ((h ?? 0) % 12) || 12;
  return `${hh}:${String(m ?? 0).padStart(2, "0")}${ampm}`;
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86400000);
}

export default function TodayPage() {
  const { teacherId, role, user } = useRole();
  const [location] = useLocation();
  const isSupervisor = SUPERVISOR_ROLES.has(role ?? "");

  // Read ?staffId from URL — only honored for supervisors. Non-supervisors are
  // pinned to their own teacherId regardless of URL to prevent cross-staff data
  // peeking via URL manipulation. (Backend list endpoints are district-scoped,
  // not self-scoped, so the frontend must enforce this.)
  const urlStaffId = useMemo(() => {
    if (!isSupervisor) return null;
    const params = new URLSearchParams(location.split("?")[1] ?? "");
    const v = params.get("staffId");
    return v ? Number(v) : null;
  }, [location, isSupervisor]);

  const [viewedStaffId, setViewedStaffId] = useState<number | null>(
    urlStaffId ?? teacherId ?? null
  );
  useEffect(() => {
    if (!isSupervisor) {
      // Force non-supervisors to their own staff id only.
      if (teacherId && viewedStaffId !== teacherId) setViewedStaffId(teacherId);
      return;
    }
    if (urlStaffId) setViewedStaffId(urlStaffId);
    else if (!viewedStaffId && teacherId) setViewedStaffId(teacherId);
  }, [urlStaffId, teacherId, viewedStaffId, isSupervisor]);

  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogPrefill, setQuickLogPrefill] = useState<{
    studentId?: number; studentName?: string;
    serviceTypeId?: number; serviceTypeName?: string;
    durationMinutes?: number; startTime?: string; endTime?: string; date?: string;
  }>({});

  const openQuickLog = useCallback((b: {
    studentId?: number | null; studentName?: string | null;
    serviceTypeId?: number | null; serviceTypeName?: string | null;
    startTime?: string; endTime?: string; date?: string;
  }) => {
    const [sh = 0, sm = 0] = (b.startTime ?? "00:00").split(":").map(Number);
    const [eh = 0, em = 0] = (b.endTime ?? "00:00").split(":").map(Number);
    const dur = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
    setQuickLogPrefill({
      studentId: b.studentId ?? undefined,
      studentName: b.studentName ?? undefined,
      serviceTypeId: b.serviceTypeId ?? undefined,
      serviceTypeName: b.serviceTypeName ?? undefined,
      durationMinutes: dur || undefined,
      startTime: b.startTime,
      endTime: b.endTime,
      date: b.date,
    });
    setQuickLogOpen(true);
  }, []);

  const today = useMemo(() => todayInfo(), []);
  const weekStart = useMemo(() => weekStartIso(), []);

  const { data: allStaff } = useListStaff({} as any, { enabled: isSupervisor });
  const staffList = (allStaff as any[]) ?? [];
  const viewedStaff = staffList.find(s => s.id === viewedStaffId) ?? null;

  const enabled = !!viewedStaffId;
  const staffIdStr = viewedStaffId ? String(viewedStaffId) : "";

  // All hooks fetch only when we have a staff id
  const { data: blocksData, isLoading: blocksLoading } = useListScheduleBlocks(
    enabled ? { staffId: staffIdStr, dayOfWeek: today.dayName } as any : ({} as any),
    { enabled }
  );
  const { data: sessionsData, isLoading: sessionsLoading } = useListSessions(
    enabled
      ? ({ staffId: staffIdStr, dateFrom: weekStart, dateTo: today.date, limit: "500" } as any)
      : ({} as any),
    { enabled }
  );
  const { data: reqsData, isLoading: reqsLoading } = useListServiceRequirements(
    enabled ? { providerId: staffIdStr, active: "true" } as any : ({} as any),
    { enabled }
  );
  const { data: alertsData, isLoading: alertsLoading } = useListAlerts(
    enabled ? { staffId: staffIdStr, resolved: "false", snoozed: "false" } as any : ({} as any),
    { enabled }
  );
  const { data: studentsData } = useListStudents({} as any, { enabled });

  const blocks = (blocksData as any[]) ?? [];
  const sessions = ((sessionsData as any)?.data ?? (Array.isArray(sessionsData) ? sessionsData : [])) as any[];
  const reqs = (Array.isArray(reqsData) ? reqsData : (reqsData as any)?.data ?? []) as any[];
  const alerts = ((alertsData as any)?.data ?? (Array.isArray(alertsData) ? alertsData : [])) as any[];
  const students = ((studentsData as any)?.data ?? (Array.isArray(studentsData) ? studentsData : [])) as any[];
  const studentMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

  // ----- Derived data -----

  // Today's blocks sorted by start time, with logged status
  const todayBlocks = useMemo(() => {
    const todaySessions = sessions.filter(s => s.sessionDate === today.date);
    const now = nowMinutes();

    const sameDayBlocks = [...blocks]
      .filter(b => b.dayOfWeek?.toLowerCase() === today.dayName)
      .filter(b => {
        if (b.effectiveFrom && today.date < b.effectiveFrom) return false;
        if (b.effectiveTo && today.date > b.effectiveTo) return false;
        return true;
      });

    return sameDayBlocks
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
      .map(b => {
        const blockStartMin = timeToMinutes(b.startTime);
        const blockEndMin = timeToMinutes(b.endTime);

        // 1. Prefer exact match by scheduleBlockId.
        let matched: any =
          todaySessions.find(s => s.scheduleBlockId === b.id) ?? null;

        // 2. Fall back to student + service type + session start in block window.
        if (!matched) {
          matched =
            todaySessions.find(s => {
              if (s.studentId !== b.studentId) return false;
              if (b.serviceTypeId != null && s.serviceTypeId != null && s.serviceTypeId !== b.serviceTypeId) return false;
              if (!s.startTime) return false; // skip — handled in step 3
              const sMin = timeToMinutes(String(s.startTime).slice(0, 5));
              return sMin >= blockStartMin - 30 && sMin <= blockEndMin + 30;
            }) ?? null;
        }

        // 3. Last-resort fallback for sessions with no startTime: only allow the
        // match when there's exactly ONE block today for this student+service,
        // so a single session can't mislabel multiple blocks as logged.
        if (!matched) {
          const peerBlocks = sameDayBlocks.filter(other =>
            other.studentId === b.studentId &&
            (b.serviceTypeId == null || other.serviceTypeId === b.serviceTypeId)
          );
          if (peerBlocks.length === 1) {
            matched =
              todaySessions.find(s =>
                s.studentId === b.studentId &&
                !s.startTime &&
                (b.serviceTypeId == null || s.serviceTypeId == null || s.serviceTypeId === b.serviceTypeId)
              ) ?? null;
          }
        }

        let status: "logged" | "in_progress" | "missed" | "upcoming";
        if (matched) status = "logged";
        else if (now >= blockStartMin && now < blockEndMin) status = "in_progress";
        else if (blockEndMin < now) status = "missed";
        else status = "upcoming";
        return { ...b, matched, status };
      });
  }, [blocks, sessions, today.date, today.dayName]);

  // Sessions logged today (including ad-hoc, not just scheduled)
  const loggedToday = useMemo(
    () => sessions.filter(s => s.sessionDate === today.date),
    [sessions, today.date]
  );

  // Overdue session log alerts (the in-app alerts we added)
  const overdueLogAlerts = useMemo(
    () => alerts.filter(a => a.type === "overdue_session_log"),
    [alerts]
  );

  // Other relevant alerts (high/critical, not overdue logs)
  const otherAlerts = useMemo(
    () => alerts.filter(a =>
      a.type !== "overdue_session_log" &&
      (a.severity === "critical" || a.severity === "high")
    ),
    [alerts]
  );

  // Students at risk of shortfall this week
  const atRiskStudents = useMemo(() => {
    const byStudent = new Map<number, { reqMinutes: number; deliveredMinutes: number }>();
    for (const r of reqs) {
      if (r.intervalType !== "weekly") continue;
      const cur = byStudent.get(r.studentId) ?? { reqMinutes: 0, deliveredMinutes: 0 };
      cur.reqMinutes += r.requiredMinutes;
      byStudent.set(r.studentId, cur);
    }
    for (const s of sessions) {
      if (s.sessionDate < weekStart) continue;
      if (!byStudent.has(s.studentId)) continue;
      const cur = byStudent.get(s.studentId)!;
      cur.deliveredMinutes += s.durationMinutes ?? 0;
    }
    const items: { studentId: number; required: number; delivered: number; pct: number }[] = [];
    for (const [studentId, v] of byStudent.entries()) {
      if (v.reqMinutes === 0) continue;
      const pct = v.deliveredMinutes / v.reqMinutes;
      // "At risk" = pace below 70% of where the student should be by this point
      // in the week. Pro-rate by school-week elapsed: a student isn't "behind" on
      // Monday for not having delivered Friday's minutes yet.
      const expectedPct = weekProgressFraction(today.dayOfWeek);
      if (expectedPct === 0) continue; // Sunday: nothing expected yet
      const pacePct = pct / expectedPct;
      if (pacePct < 0.7) {
        items.push({ studentId, required: v.reqMinutes, delivered: v.deliveredMinutes, pct });
      }
    }
    return items.sort((a, b) => a.pct - b.pct);
  }, [reqs, sessions, weekStart]);

  const totalCaseloadStudents = useMemo(() => {
    return new Set(reqs.map(r => r.studentId)).size;
  }, [reqs]);

  const loading = blocksLoading || sessionsLoading || reqsLoading || alertsLoading;

  // ----- No staff linked -----
  if (!viewedStaffId) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <EmptyState
          icon={Users}
          title="No staff profile linked"
          description={
            isSupervisor
              ? "Pick a provider from the dropdown above to view their day, or link your own staff record in Settings."
              : "Your account isn't linked to a staff record yet. Contact your administrator to set this up."
          }
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">{today.label}</h1>
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            {viewedStaff
              ? <>Viewing <span className="font-medium text-gray-600">{viewedStaff.firstName} {viewedStaff.lastName}</span>{viewedStaff.role ? ` · ${viewedStaff.role.replace(/_/g, " ")}` : ""}</>
              : (user?.firstName ? `${user.firstName}'s day` : "Your day")}
            {isSupervisor && viewedStaffId !== teacherId && (
              <span className="ml-2 text-[11px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">Supervisor view</span>
            )}
          </p>
        </div>

        {isSupervisor && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">View:</span>
            <Select
              value={viewedStaffId ? String(viewedStaffId) : ""}
              onValueChange={v => setViewedStaffId(Number(v))}
            >
              <SelectTrigger className="h-8 text-[12px] w-56">
                <SelectValue placeholder="Pick a provider" />
              </SelectTrigger>
              <SelectContent>
                {teacherId && (
                  <SelectItem value={String(teacherId)}>Me ({user?.firstName ?? "self"})</SelectItem>
                )}
                {staffList
                  .filter((s: any) => s.id !== teacherId)
                  .filter((s: any) => ["sped_teacher", "provider", "bcba", "para", "case_manager"].includes(s.role))
                  .sort((a: any, b: any) => `${a.lastName}`.localeCompare(b.lastName))
                  .map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName} ({s.role?.replace(/_/g, " ")})</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* At-a-glance strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Calendar}
          label="Sessions Today"
          value={loading ? "…" : todayBlocks.length}
          sub={today.isWeekend ? "Weekend" : `${todayBlocks.filter(b => b.status === "logged").length} logged`}
          tone={todayBlocks.length === 0 ? "gray" : "emerald"}
        />
        <StatCard
          icon={CheckCircle2}
          label="Logged Today"
          value={loading ? "…" : loggedToday.length}
          sub={`${loggedToday.reduce((s, x) => s + (x.durationMinutes ?? 0), 0)} min`}
          tone="emerald"
        />
        <StatCard
          icon={AlertTriangle}
          label="Missing Logs (week)"
          value={loading ? "…" : overdueLogAlerts.length}
          sub={overdueLogAlerts.length > 0 ? "Catch up below" : "All caught up"}
          tone={overdueLogAlerts.length > 0 ? "red" : "gray"}
        />
        <StatCard
          icon={Timer}
          label="Students At Risk"
          value={loading ? "…" : atRiskStudents.length}
          sub={`of ${totalCaseloadStudents} total`}
          tone={atRiskStudents.length > 0 ? "amber" : "gray"}
        />
      </div>

      {/* Today's Schedule */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-[13px] font-semibold text-gray-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-500" /> Today&apos;s Schedule
          </CardTitle>
          <Link href={isSupervisor && viewedStaffId !== teacherId ? "/schedule" : "/my-schedule"}>
            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-gray-400">
              Full schedule <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : todayBlocks.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-gray-400">
              {today.isWeekend ? "No school today." : "No scheduled sessions for today."}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {todayBlocks.map(b => {
                const student = b.studentId ? studentMap.get(b.studentId) : null;
                const studentName = student
                  ? `${student.firstName} ${student.lastName}`
                  : b.studentName ?? "—";
                return (
                  <div key={b.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                    <div className="text-[12px] font-mono font-medium text-gray-500 w-20 flex-shrink-0">
                      {formatTime(b.startTime)}<span className="text-gray-300">–</span>{formatTime(b.endTime)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{studentName}</div>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                        {b.serviceTypeName && <span>{b.serviceTypeName}</span>}
                        {b.location && <><MapPin className="w-3 h-3" />{b.location}</>}
                        {b.blockLabel && <span className="italic">{b.blockLabel}</span>}
                      </div>
                    </div>
                    <StatusPill status={b.status} />
                    {b.status === "missed" && b.studentId && (
                      <Button
                        size="sm"
                        onClick={() => openQuickLog({ ...b, date: today.date })}
                        className="h-7 text-[11px] bg-red-600 hover:bg-red-700 text-white"
                      >
                        Log Now
                      </Button>
                    )}
                    {b.status === "in_progress" && b.studentId && (
                      <Button
                        size="sm"
                        onClick={() => openQuickLog({ ...b, date: today.date })}
                        className="h-7 text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white"
                      >
                        Log Session
                      </Button>
                    )}
                    {b.status === "upcoming" && b.studentId && (
                      <Button
                        size="sm"
                        onClick={() => openQuickLog({ ...b, date: today.date })}
                        variant="outline"
                        className="h-7 text-[11px]"
                      >
                        Log Session
                      </Button>
                    )}
                    {b.status === "logged" && b.matched && b.studentId && (
                      <Link href={`/sessions?studentId=${b.studentId}&date=${today.date}`}>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] text-emerald-600">
                          View
                        </Button>
                      </Link>
                    )}
                    {!isSupervisor && (
                      <Link href="/my-schedule">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] text-gray-400 hover:text-gray-600"
                          title="Request a change to this block"
                        >
                          <ArrowLeftRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two-column: Missing Logs + At-risk Students */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-gray-700 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-red-500" /> Missing Session Logs
              {overdueLogAlerts.length > 0 && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-1 border-red-200 text-red-600">
                  {overdueLogAlerts.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : overdueLogAlerts.length === 0 ? (
              <div className="flex items-center gap-2 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <p className="text-[12px] text-gray-500">All session logs are up to date.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {overdueLogAlerts.slice(0, 8).map(a => {
                  const refMatch = a.message?.match(/\[ref:(\d{4}-\d{2}-\d{2})\]/);
                  const refDate = refMatch ? refMatch[1] : null;
                  const days = refDate ? daysSince(refDate) : null;
                  const sevColor = a.severity === "critical" ? "text-red-600" : a.severity === "high" ? "text-amber-600" : "text-gray-500";
                  return (
                    <div key={a.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${sevColor} w-12 flex-shrink-0`}>
                        {a.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-gray-700 truncate">
                          {a.studentName ?? `Student ${a.studentId}`}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {refDate ?? "—"}{days != null && <> · {days} day{days !== 1 ? "s" : ""} ago</>}
                        </div>
                      </div>
                      {a.studentId && refDate && (
                        <Link href={`/sessions?studentId=${a.studentId}&date=${refDate}`}>
                          <Button size="sm" className="h-7 text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white">
                            Log
                          </Button>
                        </Link>
                      )}
                    </div>
                  );
                })}
                {overdueLogAlerts.length > 8 && (
                  <Link href="/alerts?type=overdue_session_log">
                    <Button variant="ghost" size="sm" className="w-full text-[11px] h-7 text-gray-400 mt-1">
                      View all {overdueLogAlerts.length} <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-gray-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Students at Risk of Shortfall
              {atRiskStudents.length > 0 && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-1 border-amber-200 text-amber-700">
                  {atRiskStudents.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : atRiskStudents.length === 0 ? (
              <div className="flex items-center gap-2 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <p className="text-[12px] text-gray-500">All students on pace this week.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {atRiskStudents.slice(0, 8).map(s => {
                  const stu = studentMap.get(s.studentId);
                  const deficit = s.required - s.delivered;
                  const pctLabel = Math.round(s.pct * 100);
                  return (
                    <div key={s.studentId} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                      <div className={`w-1.5 h-7 rounded-full ${s.pct < 0.4 ? "bg-red-400" : "bg-amber-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-gray-700 truncate">
                          {stu ? `${stu.firstName} ${stu.lastName}` : `Student ${s.studentId}`}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {s.delivered}/{s.required} min delivered · {deficit} min behind ({pctLabel}%)
                        </div>
                      </div>
                      <Link href={`/students/${s.studentId}`}>
                        <Button size="sm" variant="outline" className="h-7 text-[11px]">
                          Open
                        </Button>
                      </Link>
                    </div>
                  );
                })}
                {atRiskStudents.length > 8 && (
                  <Link href="/compliance">
                    <Button variant="ghost" size="sm" className="w-full text-[11px] h-7 text-gray-400 mt-1">
                      View compliance dashboard <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Other open alerts */}
      {otherAlerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-gray-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" /> Other Open Alerts
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-1 border-red-200 text-red-600">
                {otherAlerts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1.5">
              {otherAlerts.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0 text-[12px]">
                  <span className={`text-[10px] font-bold uppercase tracking-wider w-12 flex-shrink-0 mt-0.5 ${a.severity === "critical" ? "text-red-600" : "text-amber-600"}`}>
                    {a.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-700">{a.message}</div>
                    {a.suggestedAction && <div className="text-[11px] text-gray-400 italic mt-0.5">{a.suggestedAction}</div>}
                  </div>
                </div>
              ))}
              <Link href="/alerts">
                <Button variant="ghost" size="sm" className="w-full text-[11px] h-7 text-gray-400 mt-1">
                  Open alerts page <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <QuickLogSheet
        isOpen={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onSuccess={() => {
          setQuickLogOpen(false);
        }}
        staffId={viewedStaffId}
        onBehalfOfNote={
          isSupervisor && viewedStaffId !== teacherId && viewedStaff
            ? `Logged by ${user?.name ?? "supervisor"} on behalf of ${viewedStaff.firstName} ${viewedStaff.lastName}`
            : undefined
        }
        prefillStudentId={quickLogPrefill.studentId}
        prefillStudentName={quickLogPrefill.studentName}
        prefillServiceTypeId={quickLogPrefill.serviceTypeId}
        prefillServiceTypeName={quickLogPrefill.serviceTypeName}
        prefillDurationMinutes={quickLogPrefill.durationMinutes}
        prefillStartTime={quickLogPrefill.startTime}
        prefillEndTime={quickLogPrefill.endTime}
        sessionDate={quickLogPrefill.date}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone }: {
  icon: any; label: string; value: string | number; sub: string;
  tone: "emerald" | "amber" | "red" | "gray";
}) {
  const toneCfg: Record<string, { bg: string; text: string; }> = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
    amber: { bg: "bg-amber-50", text: "text-amber-600" },
    red: { bg: "bg-red-50", text: "text-red-600" },
    gray: { bg: "bg-gray-50", text: "text-gray-500" },
  };
  const t = toneCfg[tone];
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${t.bg} ${t.text}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[19px] font-bold text-gray-800 leading-tight truncate">{value}</p>
            <p className="text-[10px] text-gray-400 leading-tight uppercase tracking-wider">{label}</p>
            <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{sub}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: "logged" | "in_progress" | "missed" | "upcoming" }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    logged: { label: "Logged", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    in_progress: { label: "Now", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    missed: { label: "Not logged", cls: "bg-red-50 text-red-700 border-red-200" },
    upcoming: { label: "Upcoming", cls: "bg-gray-50 text-gray-500 border-gray-200" },
  };
  const c = cfg[status];
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${c.cls}`}>
      {c.label}
    </span>
  );
}
