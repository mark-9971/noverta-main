import { useParams, useSearch, useLocation } from "wouter";
import { useGetStudent, useGetStudentMinuteProgress, useGetStudentSessions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle, XCircle, TrendingUp, FileText, Activity, Target, Gift, Share2, Plus, Archive, ArchiveRestore, CalendarDays, Bell, AlertTriangle, Clock, ClipboardList, CalendarPlus } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { RISK_CONFIG } from "@/lib/constants";
import StudentSnapshot from "@/components/student-snapshot";
import { useRole } from "@/lib/role-context";
import { getStudentWorkspaceConfig } from "@/pages/student-detail/role-config";
import { IoaSummary } from "@/components/aba-graph";
import {
  getStudentPhaseChanges,
  listBehaviorTargets,
  listProgramTargets,
  getBehaviorDataTrends,
  getProgramDataTrends,
  listDataSessions,
  getStudentProtectiveMeasures,
  getStudentMinutesTrend,
  getCompensatorySummaryByStudent,
  getDataSession,
  getSession,
  listServiceTypes,
  listStaff,
} from "@workspace/api-client-react";

import { QuickLogSheet } from "@/components/quick-log-sheet";
import StudentGoalSection from "./student-detail/StudentGoalSection";
import StudentServiceSection from "./student-detail/StudentServiceSection";
import StudentBehaviorSection from "./student-detail/StudentBehaviorSection";
import PreferenceAssessmentCard from "@/components/preference-assessment/PreferenceAssessmentCard";
import ReinforcerInventoryPanel from "@/components/preference-assessment/ReinforcerInventoryPanel";
import SupportIntensityCard from "@/components/support-intensity/SupportIntensityCard";
import StudentSessionHistory from "./student-detail/StudentSessionHistory";
import StudentComplianceSection from "./student-detail/StudentComplianceSection";
import StudentContactsMedical from "./student-detail/StudentContactsMedical";
import StudentProgressReports from "./student-detail/StudentProgressReports";
import StudentDialogs from "./student-detail/StudentDialogs";
import SupersedeDialog from "./student-detail/SupersedeDialog";
import StudentJourneyTimeline from "./student-detail/StudentJourneyTimeline";
import StudentHandoffCard from "./student-detail/StudentHandoffCard";
import StudentMedicaidField from "./student-detail/StudentMedicaidField";
import { useEmergencyContacts } from "./student-detail/hooks/useEmergencyContacts";
import { useMedicalAlerts } from "./student-detail/hooks/useMedicalAlerts";
import { useEnrollmentEvents } from "./student-detail/hooks/useEnrollmentEvents";
import { useStudentArchive } from "./student-detail/hooks/useStudentArchive";
import { useStaffAssignments } from "./student-detail/hooks/useStaffAssignments";
import { useServiceRequirements } from "./student-detail/hooks/useServiceRequirements";
import { useShareProgress } from "./student-detail/hooks/useShareProgress";
import { useStudentMessageGuardians } from "./student-detail/hooks/useStudentMessageGuardians";

const BIP_EDIT_ROLES = ["admin", "case_manager", "bcba"];

export default function StudentDetail() {
  const params = useParams<{ id: string }>();
  const studentId = Number(params.id);
  const { role, teacherId } = useRole();
  const bipReadOnly = !BIP_EDIT_ROLES.includes(role);

  const { data: student, isLoading: loadingStudent, refetch: refetchStudent } = useGetStudent(studentId);
  const { data: progress, refetch: refetchProgress } = useGetStudentMinuteProgress(studentId);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const { data: sessions } = useGetStudentSessions(studentId, { limit: 20 } as any);

  // Heavy data fetched lazily, gated by which tab the user has visited.
  const [behaviorTargets, setBehaviorTargets] = useState<any[]>([]);
  const [programTargets, setProgramTargets] = useState<any[]>([]);
  const [behaviorTrends, setBehaviorTrends] = useState<any[]>([]);
  const [programTrends, setProgramTrends] = useState<any[]>([]);
  const [dataSessions, setDataSessions] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [behaviorDataFetched, setBehaviorDataFetched] = useState(false);
  const [contactsDataFetched, setContactsDataFetched] = useState(false);
  const [progressReportsFetched, setProgressReportsFetched] = useState(false);
  const [protectiveData, setProtectiveData] = useState<{ incidents: any[]; summary: any } | null>(null);
  const [compSummary, setCompSummary] = useState<any>(null);
  const [compFinancial, setCompFinancial] = useState<{ exposure: number; totalOwed: number } | null>(null);
  const [goalProgress, setGoalProgress] = useState<any[]>([]);
  const [reEvalStatus, setReEvalStatus] = useState<{ hasEligibility: boolean; reEvalStatus: { nextReEvalDate: string | null; daysUntilReEval: number | null; urgency: string; primaryDisability: string | null; reEvalCycleMonths: number } | null } | null>(null);
  const [transitionData, setTransitionData] = useState<{ isTransitionAge: boolean; age: number | null; plans: { id: number; planDate: string; status: string; goals?: { id: number; domain: string; goalStatement: string; status: string }[]; agencyReferrals?: { id: number; agencyName: string; status: string }[] }[] } | null>(null);

  // Session expansion state
  const [expandedDataSessionId, setExpandedDataSessionId] = useState<number | null>(null);
  const [expandedDataDetail, setExpandedDataDetail] = useState<any>(null);
  const [expandedDataLoading, setExpandedDataLoading] = useState(false);
  const [expandedServiceSessionId, setExpandedServiceSessionId] = useState<number | null>(null);
  const [expandedServiceDetail, setExpandedServiceDetail] = useState<any>(null);
  const [expandedServiceLoading, setExpandedServiceLoading] = useState(false);

  // Charting / annotation state shared by multiple sections
  const [behaviorPhaseLines, setBehaviorPhaseLines] = useState<Record<number, { id: string; date: string; label: string; color?: string }[]>>({});
  const [programPhaseLines, setProgramPhaseLines] = useState<Record<number, { id: string; date: string; label: string; color?: string }[]>>({});
  const [goalAbaView, setGoalAbaView] = useState<Record<string | number, boolean>>({});
  const [minutesExpanded, setMinutesExpanded] = useState(false);
  const [minutesTrend, setMinutesTrend] = useState<any[]>([]);
  const [minutesPhaseLines, setMinutesPhaseLines] = useState<{ id: string; date: string; label: string; color?: string }[]>([]);
  const [phaseChangesByTarget, setPhaseChangesByTarget] = useState<Record<number, any[]>>({});
  const [annotationsByGoal, setAnnotationsByGoal] = useState<Record<number, any[]>>({});

  // Lookup lists for dialogs
  const [serviceTypesList, setServiceTypesList] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  // Section-level concerns extracted into focused hooks.
  const enrollment = useEnrollmentEvents(studentId, contactsDataFetched);
  const archive = useStudentArchive(studentId, refetchStudent, enrollment.reloadEnrollment);
  const contacts = useEmergencyContacts(studentId, contactsDataFetched);
  const alerts = useMedicalAlerts(studentId, contactsDataFetched);
  const messageGuardians = useStudentMessageGuardians(studentId, contactsDataFetched);
  const assignments = useStaffAssignments(studentId, refetchStudent);
  const services = useServiceRequirements(studentId, refetchStudent, refetchProgress);
  const share = useShareProgress(studentId);

  useEffect(() => {
    listServiceTypes().then((r: any) => setServiceTypesList(Array.isArray(r) ? r : [])).catch(() => {});
    listStaff().then((r: any) => setStaffList(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  // Summary + IEP metadata — fires immediately on mount
  useEffect(() => {
    if (!studentId) return;
    authFetch(`/api/evaluations/student/${studentId}/re-eval-status`)
      .then((d: unknown) => setReEvalStatus(d as typeof reEvalStatus))
      .catch(() => {});
    authFetch(`/api/transitions/student/${studentId}`)
      .then((d: unknown) => setTransitionData(d as typeof transitionData))
      .catch(() => {});
  }, [studentId]);

  const workspaceConfig = getStudentWorkspaceConfig(role);
  const caps = workspaceConfig.caps;
  const isEditable = caps.editIep;

  const ALL_STUDENT_TABS = [
    { id: "summary" as const, label: "Summary" },
    { id: "iep" as const, label: "IEP & Goals" },
    { id: "sessions" as const, label: "Sessions" },
    { id: "reports" as const, label: "Progress Reports" },
    { id: "behavior" as const, label: "Behavior & ABA" },
    { id: "contacts" as const, label: "Contacts & Documents" },
    { id: "journey" as const, label: "History" },
    { id: "handoff" as const, label: "Staff Guide" },
  ] as const;

  type StudentTab = typeof ALL_STUDENT_TABS[number]["id"];

  // Phase 2B: filter the tab strip by role. Default tab and visibility come
  // from the role-config primitive; deep-links to a tab the current role
  // cannot see fall back to the role's default tab silently.
  const STUDENT_TABS = ALL_STUDENT_TABS.filter(t => workspaceConfig.visibleTabs.has(t.id));

  function resolveTab(s: string): StudentTab {
    const p = new URLSearchParams(s).get("tab") as StudentTab | null;
    if (p && STUDENT_TABS.some(t => t.id === p)) return p;
    return workspaceConfig.defaultTab as StudentTab;
  }

  const search = useSearch();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<StudentTab>(() => resolveTab(search));
  const [mountedTabs, setMountedTabs] = useState<Set<StudentTab>>(() => new Set([resolveTab(search)]));

  const fromPage = new URLSearchParams(search).get("from");
  const backHref = fromPage === "compliance" ? "/compliance" : fromPage === "action-center" ? "/action-center" : "/students";
  const backLabel = fromPage === "compliance" ? "Compliance" : fromPage === "action-center" ? "Action Center" : "All Students";

  useEffect(() => {
    setActiveTab(resolveTab(search));
  }, [search]);

  function handleTabChange(tab: StudentTab) {
    setMountedTabs(prev => { const n = new Set(prev); n.add(tab); return n; });
    navigate(`/students/${studentId}?tab=${tab}`, { replace: true });
    if (tab === "behavior") setBehaviorDataFetched(true);
    if (tab === "contacts") setContactsDataFetched(true);
    if (tab === "reports") setProgressReportsFetched(true);
  }

  function loadPhaseChanges() {
    getStudentPhaseChanges(studentId).catch(() => {}).then(setPhaseChangesByTarget as any).catch(() => {});
  }

  function loadGoalAnnotations() {
    authFetch(`/api/students/${studentId}/goal-annotations`)
      .then(r => r.ok ? r.json() : {})
      .then((data: Record<number, any[]>) => setAnnotationsByGoal(data))
      .catch(() => {});
  }

  async function handleAddAnnotation(goalId: number, annotationDate: string, label: string) {
    const r = await authFetch(`/api/iep-goals/${goalId}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotationDate, label }),
    });
    if (!r.ok) throw new Error("Failed to add annotation");
    loadGoalAnnotations();
  }

  async function handleRemoveAnnotation(annotationId: number) {
    const r = await authFetch(`/api/goal-annotations/${annotationId}`, { method: "DELETE" });
    if (!r.ok) throw new Error("Failed to remove annotation");
    loadGoalAnnotations();
  }

  // IEP + Summary data — fires on mount (6 lightweight fetches)
  useEffect(() => {
    if (isNaN(studentId)) return;
    Promise.all([
      getStudentMinutesTrend(studentId).catch(() => []),
      getCompensatorySummaryByStudent(studentId).catch(() => null),
      listDataSessions(studentId, { limit: 10 } as any).catch(() => []),
      authFetch(`/api/students/${studentId}/iep-goals/progress`).then(r => r.ok ? r.json() : []).catch(() => []),
      authFetch(`/api/compensatory-finance/students`).then(r => r.ok ? r.json() : []).catch(() => []),
      authFetch(`/api/students/${studentId}/goal-annotations`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([mt, cs, ds, gp, finStudents, ga]) => {
      setMinutesTrend(mt);
      setDataSessions(ds);
      if (cs && Array.isArray(finStudents)) {
        const match = finStudents.find((s: { studentId: number; remainingDollars?: number; totalDollarsOwed?: number }) => s.studentId === studentId);
        if (match) {
          setCompFinancial({ exposure: match.remainingDollars ?? 0, totalOwed: match.totalDollarsOwed ?? 0 });
        }
      }
      setCompSummary(cs);
      setGoalProgress(gp);
      setAnnotationsByGoal(ga as Record<number, any[]>);
    }).catch(() => {});
  }, [studentId]);

  // Behavior / ABA data — fires on first Behavior tab visit (6 heavier fetches deferred)
  useEffect(() => {
    if (!behaviorDataFetched || isNaN(studentId)) return;
    setDataLoading(true);
    Promise.all([
      listBehaviorTargets(studentId).catch(() => []),
      listProgramTargets(studentId).catch(() => []),
      getBehaviorDataTrends(studentId).catch(() => []),
      getProgramDataTrends(studentId).catch(() => []),
      getStudentProtectiveMeasures(studentId).catch(() => null),
      getStudentPhaseChanges(studentId).catch(() => {}),
    ]).then(([bt, pt, btTrends, ptTrends, pm, pcs]) => {
      setBehaviorTargets(bt);
      setProgramTargets(pt);
      setBehaviorTrends(btTrends);
      setProgramTrends(ptTrends);
      setProtectiveData(pm as any);
      setPhaseChangesByTarget(pcs as any);
      setDataLoading(false);
    }).catch(() => setDataLoading(false));
  }, [behaviorDataFetched, studentId]);

  const s = student as any;
  const progressList = (progress as any[]) ?? [];
  const sessionList = (sessions as any[]) ?? [];

  // Deep-link from /data-health: when ?editServiceRequirement=:id is in the
  // URL, auto-open the existing service requirement edit dialog as soon as
  // the student data (which includes the requirement payload) finishes
  // loading. The query param is then cleared so a refresh doesn't reopen
  // the dialog. Guarded so it only fires once per param value.
  const autoOpenedReqRef = useRef<number | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(search);
    const target = params.get("editServiceRequirement");
    if (!target) return;
    const targetId = Number(target);
    if (!Number.isFinite(targetId)) return;
    if (autoOpenedReqRef.current === targetId) return;
    const reqs: any[] | undefined = s?.serviceRequirements;
    if (!Array.isArray(reqs)) return;
    const match = reqs.find((r) => r?.id === targetId);
    autoOpenedReqRef.current = targetId;
    if (!match) {
      // Requirement no longer exists on this student (e.g. it was already
      // superseded and the data-health row is stale). Tell the user instead
      // of silently doing nothing on a retried deep-link click.
      import("sonner").then(({ toast }) => toast.error("That service requirement is no longer on this student. It may have already been replaced — check the active requirements below."));
    } else {
      services.openEditSvc(match);
    }
    params.delete("editServiceRequirement");
    const next = params.toString();
    navigate(`/students/${studentId}${next ? `?${next}` : ""}`, { replace: true });
  }, [search, s, studentId, navigate]);

  const totalDelivered = progressList.reduce((sum: number, p: any) => sum + (p.deliveredMinutes ?? 0), 0);
  const totalRequired = progressList.reduce((sum: number, p: any) => sum + (p.requiredMinutes ?? 0), 0);
  const overallPct = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 100) : 0;

  const iepLinkedBehaviorIds = new Set(goalProgress.filter((g: any) => g.behaviorTargetId).map((g: any) => g.behaviorTargetId));
  const iepLinkedProgramIds = new Set(goalProgress.filter((g: any) => g.programTargetId).map((g: any) => g.programTargetId));
  const nonIepBehaviorTargets = behaviorTargets.filter((bt: any) => !iepLinkedBehaviorIds.has(bt.id));
  const nonIepProgramTargets = programTargets.filter((pt: any) => !iepLinkedProgramIds.has(pt.id));
  const hasNonIepData = nonIepBehaviorTargets.length > 0 || nonIepProgramTargets.length > 0;

  const priorityOrder = ["out_of_compliance", "at_risk", "slightly_behind", "on_track", "completed"];
  let worstRisk = "on_track";
  for (const p of progressList) {
    if (priorityOrder.indexOf(p.riskStatus) < priorityOrder.indexOf(worstRisk)) {
      worstRisk = p.riskStatus;
    }
  }
  const riskCfg = RISK_CONFIG[worstRisk] ?? RISK_CONFIG.on_track;

  const latestEnrollment = enrollment.enrollmentHistory.length > 0 ? enrollment.enrollmentHistory[0] : null;
  const enrolledEvent = enrollment.enrollmentHistory.find((e: any) => e.eventType === "enrolled");
  const enrollmentDate = enrolledEvent?.eventDate ?? s?.createdAt?.substring(0, 10);

  const atRiskServices = progressList.filter((p: any) =>
    p.riskStatus === "at_risk" || p.riskStatus === "slightly_behind" || p.riskStatus === "out_of_compliance"
  );

  const chartData = progressList.map((p: any) => ({
    name: p.serviceTypeName?.split(" ").slice(0, 2).join(" ") ?? "Service",
    delivered: p.deliveredMinutes ?? 0,
    required: p.requiredMinutes ?? 0,
    pct: p.requiredMinutes > 0 ? Math.round((p.deliveredMinutes / p.requiredMinutes) * 100) : 0,
    riskStatus: p.riskStatus,
  }));

  const recentSessions = sessionList.slice(0, 12);
  const completedSessions = sessionList.filter((se: any) => se.status === "completed").length;
  const missedSessions = sessionList.filter((se: any) => se.status === "missed").length;

  function getBehaviorTrendData(targetId: number) {
    return behaviorTrends
      .filter((t: any) => t.behaviorTargetId === targetId)
      .map((t: any) => ({ date: t.sessionDate, value: parseFloat(t.value) || 0, staffId: t.staffId, staffName: t.staffName }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }

  function getProgramTrendData(targetId: number) {
    return programTrends
      .filter((t: any) => t.programTargetId === targetId)
      .map((t: any) => ({ date: t.sessionDate, value: parseFloat(t.percentCorrect) || 0, staffId: t.staffId, staffName: t.staffName }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }

  function getTrendDirection(data: { value: number }[]) {
    if (data.length < 4) return "flat";
    const mid = Math.floor(data.length / 2);
    const earlier = data.slice(0, mid);
    const recent = data.slice(mid);
    const earlierAvg = earlier.reduce((s, d) => s + d.value, 0) / earlier.length;
    const recentAvg = recent.reduce((s, d) => s + d.value, 0) / recent.length;
    const diff = recentAvg - earlierAvg;
    if (Math.abs(diff) < 0.5) return "flat";
    return diff > 0 ? "up" : "down";
  }

  if (!loadingStudent && !s) {
    return (
      <div className="p-8">
        <Link href={backHref} className="text-emerald-700 text-sm flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to {backLabel}
        </Link>
        <p className="text-gray-500">Student not found.</p>
      </div>
    );
  }

  function formatDate(d: string) {
    if (!d) return "\u2014";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function formatTime(t: string | null) {
    if (!t) return null;
    const [h, m] = t.split(":");
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
  }

  async function toggleDataSession(id: number) {
    if (expandedDataSessionId === id) {
      setExpandedDataSessionId(null);
      setExpandedDataDetail(null);
      return;
    }
    setExpandedDataSessionId(id);
    setExpandedDataLoading(true);
    try {
      const data = await getDataSession(id);
      setExpandedDataDetail(data);
    } catch { setExpandedDataDetail(null); }
    setExpandedDataLoading(false);
  }

  async function toggleServiceSession(id: number) {
    if (expandedServiceSessionId === id) {
      setExpandedServiceSessionId(null);
      setExpandedServiceDetail(null);
      return;
    }
    setExpandedServiceSessionId(id);
    setExpandedServiceLoading(true);
    try {
      const data = await getSession(id);
      setExpandedServiceDetail(data);
    } catch { setExpandedServiceDetail(null); }
    setExpandedServiceLoading(false);
  }

  const studentName = s ? `${s.firstName} ${s.lastName}` : "";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-5 md:space-y-8">
      <div>
        <Link href={backHref} className="text-emerald-700 text-sm flex items-center gap-1.5 mb-4 hover:text-emerald-800">
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </Link>

        {s ? (
          <div className="flex items-center gap-3 md:gap-5 flex-wrap">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-700 text-base md:text-lg font-bold flex-shrink-0" aria-hidden="true">
              {s.firstName?.[0]}{s.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800 truncate">{s.firstName} {s.lastName}</h1>
              <p className="text-xs md:text-sm text-gray-400 mt-0.5 truncate">
                Grade {s.grade}{s.disabilityCategory ? ` · ${s.disabilityCategory}` : ""}{s.schoolName ? ` · ${s.schoolName}` : ""}{s.caseManagerName ? ` · CM: ${s.caseManagerName}` : s.caseManagerId ? ` · CM #${s.caseManagerId}` : ""}
                {(() => {
                  // Prefer the direct enrolledAt/withdrawnAt fields; fall back to
                  // enrollment-history events for records predating the field.
                  let statusLabel: string;
                  let dateStr: string | null | undefined;

                  if (s.status === "active") {
                    statusLabel = "Enrolled";
                    dateStr = s.enrolledAt ?? enrollmentDate;
                  } else if (s.withdrawnAt) {
                    statusLabel = "Withdrawn";
                    dateStr = s.withdrawnAt;
                  } else if (latestEnrollment) {
                    statusLabel =
                      latestEnrollment.eventType === "graduated" ? "Graduated"
                      : latestEnrollment.eventType?.startsWith("transferred") ? "Transferred"
                      : "Withdrawn";
                    dateStr = latestEnrollment.eventDate ?? enrollmentDate;
                  } else {
                    return null;
                  }

                  if (!dateStr) return null;
                  return (
                    <> · <CalendarDays className="w-3 h-3 inline -mt-0.5" /> {statusLabel} {new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</>
                  );
                })()}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:flex-shrink-0">
              {s.status === "inactive" && (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <Archive className="w-3 h-3" /> Inactive
                </span>
              )}
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${riskCfg.bg} ${riskCfg.color}`}>
                {riskCfg.label}
              </span>
              {((role === "para" || role === "provider" || role === "direct_provider")) ? (
                <button
                  onClick={() => setQuickLogOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors"
                  data-testid="button-student-quick-log"
                >
                  <Plus className="w-3.5 h-3.5" /> Log Session
                </button>
              ) : (
                <Link href={`/sessions?studentId=${studentId}&log=true`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors">
                  <ClipboardList className="w-3.5 h-3.5" /> Log Session
                </Link>
              )}
              <Link href={`/students/${studentId}/iep`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors">
                <FileText className="w-3.5 h-3.5" /> View IEP
              </Link>
              <Link href={`/scheduling?studentId=${studentId}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors">
                <CalendarPlus className="w-3.5 h-3.5" /> Schedule
              </Link>
              <button
                onClick={share.handleShareProgress}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" /> Share Progress
              </button>
              {caps.archiveStudent && (
                s.status === "inactive" ? (
                  <button
                    onClick={() => archive.setReactivateDialogOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" /> Reactivate
                  </button>
                ) : (
                  <button
                    onClick={() => archive.setArchiveDialogOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    <Archive className="w-3.5 h-3.5" /> Archive
                  </button>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <Skeleton className="w-14 h-14 rounded-2xl" />
            <div>
              <Skeleton className="w-48 h-7" />
              <Skeleton className="w-32 h-4 mt-2" />
            </div>
          </div>
        )}
      </div>

      {s && (
        <nav className="sticky top-0 z-20 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 bg-white/95 backdrop-blur-sm border-b border-gray-100 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1 min-w-max py-1">
            {STUDENT_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-3 py-2 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* ── SUMMARY ───────────────────────────────────────────────────── */}
      <div className={activeTab === "summary" ? "space-y-5" : "hidden"}>

      {reEvalStatus?.hasEligibility && reEvalStatus.reEvalStatus && (reEvalStatus.reEvalStatus.urgency === "overdue" || reEvalStatus.reEvalStatus.urgency === "upcoming") && (
        <Card className={reEvalStatus.reEvalStatus.urgency === "overdue" ? "border-red-200 bg-red-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardContent className="py-3 px-5 flex items-center gap-3">
            {reEvalStatus.reEvalStatus.urgency === "overdue" ? <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" /> : <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold ${reEvalStatus.reEvalStatus.urgency === "overdue" ? "text-red-700" : "text-amber-700"}`}>
                {reEvalStatus.reEvalStatus.urgency === "overdue" ? "Re-Evaluation Overdue" : "Re-Evaluation Coming Up"}
              </p>
              <p className="text-[11px] text-gray-500">
                {reEvalStatus.reEvalStatus.primaryDisability ? `${reEvalStatus.reEvalStatus.primaryDisability} · ` : ""}
                Next re-eval due: {reEvalStatus.reEvalStatus.nextReEvalDate ?? "—"}
                {reEvalStatus.reEvalStatus.daysUntilReEval !== null && (
                  reEvalStatus.reEvalStatus.daysUntilReEval < 0
                    ? ` (${Math.abs(reEvalStatus.reEvalStatus.daysUntilReEval)} days overdue)`
                    : ` (${reEvalStatus.reEvalStatus.daysUntilReEval} days remaining)`
                )}
                {` · ${reEvalStatus.reEvalStatus.reEvalCycleMonths}-month cycle`}
              </p>
            </div>
            <Link href="/evaluations" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
              View Evaluations →
            </Link>
          </CardContent>
        </Card>
      )}

      {atRiskServices.length > 0 && (
        <Card className={worstRisk === "out_of_compliance" ? "border-red-200 bg-red-50/30" : "border-amber-200 bg-amber-50/30"}>
          <CardContent className="py-3 px-5">
            <div className="flex items-center gap-3 mb-2">
              <Bell className={`w-5 h-5 flex-shrink-0 ${worstRisk === "out_of_compliance" ? "text-red-500" : "text-amber-500"}`} />
              <p className={`text-[13px] font-semibold ${worstRisk === "out_of_compliance" ? "text-red-700" : "text-amber-700"}`}>
                {worstRisk === "out_of_compliance" ? "Service Minutes — Compliance Alert" : "Service Minutes — Approaching Shortfall"}
              </p>
            </div>
            <div className="space-y-1 ml-8">
              {atRiskServices.map((p: any) => {
                const pct = p.requiredMinutes > 0 ? Math.round((p.deliveredMinutes / p.requiredMinutes) * 100) : 0;
                const deficit = (p.requiredMinutes ?? 0) - (p.deliveredMinutes ?? 0);
                const statusLabel = p.riskStatus === "out_of_compliance" ? "Out of Compliance" : p.riskStatus === "at_risk" ? "At Risk" : "Slightly Behind";
                const statusColor = p.riskStatus === "out_of_compliance" ? "text-red-600" : p.riskStatus === "at_risk" ? "text-amber-600" : "text-yellow-600";
                return (
                  <div key={p.serviceRequirementId} className="flex items-center gap-2 text-[11px]">
                    <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-600">{p.serviceTypeName}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500">{p.deliveredMinutes}/{p.requiredMinutes} min ({pct}%)</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500">{deficit} min remaining</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

        <StudentSnapshot studentId={studentId} />

        <StudentGoalSection
          goalProgress={goalProgress}
          dataLoading={dataLoading}
          behaviorTargets={behaviorTargets}
          behaviorTrends={behaviorTrends}
          programTrends={programTrends}
          phaseChangesByTarget={phaseChangesByTarget}
          goalAbaView={goalAbaView}
          setGoalAbaView={setGoalAbaView}
          loadPhaseChanges={loadPhaseChanges}
          student={s}
          annotationsByGoal={annotationsByGoal}
          onAddAnnotation={handleAddAnnotation}
          onRemoveAnnotation={handleRemoveAnnotation}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <Card>
            <CardContent className="p-3.5 md:p-5 flex items-center gap-3 md:gap-4">
              <ProgressRing value={overallPct} size={56} strokeWidth={6} color={riskCfg.ringColor} />
              <div>
                <p className="text-2xl font-bold text-gray-800">{overallPct}%</p>
                <p className="text-[11px] text-gray-400">Overall Progress</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center" aria-hidden="true">
                <TrendingUp className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{totalDelivered}<span className="text-sm text-gray-400 font-normal"> / {totalRequired}</span></p>
                <p className="text-[11px] text-gray-400">Minutes Delivered</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center" aria-hidden="true">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{completedSessions}</p>
                <p className="text-[11px] text-gray-400">Completed Sessions</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center" aria-hidden="true">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{missedSessions}</p>
                <p className="text-[11px] text-gray-400">Missed Sessions</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {caps.editMedicaidId && s && (
          <StudentMedicaidField student={s} onSave={() => refetchStudent()} />
        )}

      </div>{/* end Summary tab */}

      {/* ── IEP & GOALS ───────────────────────────────────────────────── */}
      <div className={activeTab === "iep" ? "space-y-5" : "hidden"}>
        {mountedTabs.has("iep") && (
          <>
            <StudentGoalSection
              goalProgress={goalProgress}
              dataLoading={dataLoading}
              behaviorTargets={behaviorTargets}
              behaviorTrends={behaviorTrends}
              programTrends={programTrends}
              phaseChangesByTarget={phaseChangesByTarget}
              goalAbaView={goalAbaView}
              setGoalAbaView={setGoalAbaView}
              loadPhaseChanges={loadPhaseChanges}
              student={s}
              annotationsByGoal={annotationsByGoal}
              onAddAnnotation={handleAddAnnotation}
              onRemoveAnnotation={handleRemoveAnnotation}
            />
            <StudentServiceSection
              chartData={chartData}
              minutesExpanded={minutesExpanded}
              setMinutesExpanded={setMinutesExpanded}
              minutesTrend={minutesTrend}
              minutesPhaseLines={minutesPhaseLines}
              setMinutesPhaseLines={setMinutesPhaseLines}
              progressList={progressList}
              isEditable={isEditable}
              student={s}
              openAddSvc={services.openAddSvc}
              openEditSvc={services.openEditSvc}
              setDeletingSvc={services.setDeletingSvc}
              openAssignDialog={assignments.openAssignDialog}
              handleRemoveAssignment={assignments.handleRemoveAssignment}
            />
            {compSummary && compSummary.counts?.total > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                      <Gift className="w-4 h-4 text-emerald-600" />
                      Compensatory Services
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Link href="/compensatory?view=finance" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                        Financial View
                      </Link>
                      <Link href={`/compensatory?studentId=${studentId}`} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                        View All →
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  {compSummary.totalRemaining > 0 && (
                    <div className="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-amber-800">Financial Exposure</p>
                        {compFinancial ? (
                          <p className="text-sm font-bold text-amber-900">
                            ${compFinancial.exposure.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        ) : (
                          <p className="text-xs font-semibold text-amber-900">Rate not configured</p>
                        )}
                      </div>
                      <p className="text-[10px] text-amber-600 mt-0.5">
                        {compFinancial ? (
                          "Based on configured district rates"
                        ) : (
                          <>
                            {compSummary.totalRemaining} min owed.{" "}
                            <Link href="/compensatory?view=finance&tab=rates" className="underline font-medium">
                              Set hourly rates
                            </Link>{" "}
                            to compute dollar exposure.
                          </>
                        )}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-gray-800">{compSummary.totalRemaining}</p>
                      <p className="text-[10px] text-gray-400">Min Remaining</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-emerald-700">{compSummary.totalDelivered}</p>
                      <p className="text-[10px] text-gray-400">Min Delivered</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-gray-800">{compSummary.counts.pending + compSummary.counts.inProgress}</p>
                      <p className="text-[10px] text-gray-400">Active</p>
                    </div>
                  </div>
                  {compSummary.obligations?.length > 0 && (
                    <div className="space-y-1.5">
                      {compSummary.obligations.slice(0, 5).map((ob: any) => {
                        const pct = ob.minutesOwed > 0 ? Math.round((ob.minutesDelivered / ob.minutesOwed) * 100) : 0;
                        return (
                          <div key={ob.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50/50">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700">{ob.serviceTypeName || "Service"}</p>
                              <p className="text-[10px] text-gray-400">
                                {ob.minutesRemaining} min remaining · {ob.status.replace(/_/g, " ")}
                              </p>
                            </div>
                            <div className="w-16">
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                              <p className="text-[9px] text-gray-400 text-right mt-0.5">{pct}%</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            <StudentComplianceSection
              section="transition"
              studentId={studentId}
              transitionData={transitionData}
            />
          </>
        )}
      </div>{/* end IEP & Goals tab */}

      {/* ── BEHAVIOR / ABA ────────────────────────────────────────────── */}
      <div className={activeTab === "behavior" ? "space-y-5" : "hidden"}>
        {mountedTabs.has("behavior") && (
          <>
            <SupportIntensityCard studentId={studentId} />
            <StudentBehaviorSection
              hasNonIepData={hasNonIepData}
              dataLoading={dataLoading}
              nonIepBehaviorTargets={nonIepBehaviorTargets}
              nonIepProgramTargets={nonIepProgramTargets}
              behaviorTrends={behaviorTrends}
              programTrends={programTrends}
              behaviorPhaseLines={behaviorPhaseLines}
              setBehaviorPhaseLines={setBehaviorPhaseLines}
              programPhaseLines={programPhaseLines}
              setProgramPhaseLines={setProgramPhaseLines}
              phaseChangesByTarget={phaseChangesByTarget}
              goalAbaView={goalAbaView}
              setGoalAbaView={setGoalAbaView}
              loadPhaseChanges={loadPhaseChanges}
              getBehaviorTrendData={getBehaviorTrendData}
              getProgramTrendData={getProgramTrendData}
              getTrendDirection={getTrendDirection}
            />
            {behaviorTargets.length > 0 && !dataLoading && (
              <Card className="border-gray-100">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-gray-400" />
                    Inter-Observer Agreement (IOA)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <IoaSummary studentId={studentId} />
                </CardContent>
              </Card>
            )}
            <PreferenceAssessmentCard studentId={studentId} />
            <ReinforcerInventoryPanel studentId={studentId} />
            <StudentComplianceSection
              section="protective"
              studentId={studentId}
              protectiveData={protectiveData}
              formatDate={formatDate}
            />
          </>
        )}
      </div>{/* end Behavior / ABA tab */}

      {/* ── SESSIONS ──────────────────────────────────────────────────── */}
      <div className={activeTab === "sessions" ? "space-y-5" : "hidden"}>
        {mountedTabs.has("sessions") && (
          <>
            <StudentSessionHistory
              section="data"
              dataSessions={dataSessions}
              dataLoading={dataLoading}
              expandedDataSessionId={expandedDataSessionId}
              expandedDataDetail={expandedDataDetail}
              expandedDataLoading={expandedDataLoading}
              toggleDataSession={toggleDataSession}
              recentSessions={recentSessions}
              expandedServiceSessionId={expandedServiceSessionId}
              expandedServiceDetail={expandedServiceDetail}
              expandedServiceLoading={expandedServiceLoading}
              toggleServiceSession={toggleServiceSession}
              formatDate={formatDate}
              formatTime={formatTime}
            />
            <StudentSessionHistory
              section="service"
              dataSessions={dataSessions}
              dataLoading={dataLoading}
              expandedDataSessionId={expandedDataSessionId}
              expandedDataDetail={expandedDataDetail}
              expandedDataLoading={expandedDataLoading}
              toggleDataSession={toggleDataSession}
              recentSessions={recentSessions}
              expandedServiceSessionId={expandedServiceSessionId}
              expandedServiceDetail={expandedServiceDetail}
              expandedServiceLoading={expandedServiceLoading}
              toggleServiceSession={toggleServiceSession}
              formatDate={formatDate}
              formatTime={formatTime}
            />
          </>
        )}
      </div>{/* end Sessions tab */}

      {/* ── PROGRESS REPORTS ──────────────────────────────────────────── */}
      <div className={activeTab === "reports" ? "space-y-5" : "hidden"}>
        <StudentProgressReports
          studentId={studentId}
          enabled={progressReportsFetched || activeTab === "reports"}
          isEditable={isEditable}
        />
      </div>{/* end Progress Reports tab */}

      {/* ── DOCUMENTS & CONTACTS ──────────────────────────────────────── */}
      <div className={activeTab === "contacts" ? "space-y-5" : "hidden"}>
        {mountedTabs.has("contacts") && (
          <>
            <StudentContactsMedical
              section="contactsAndMedical"
              isEditable={isEditable}
              emergencyContacts={contacts.emergencyContacts}
              emergencyContactsLoading={contacts.emergencyContactsLoading}
              openAddEc={contacts.openAddEc}
              openEditEc={contacts.openEditEc}
              setDeletingEc={contacts.setDeletingEc}
              medicalAlerts={alerts.medicalAlerts}
              medicalAlertsLoading={alerts.medicalAlertsLoading}
              openAddMa={alerts.openAddMa}
              openEditMa={alerts.openEditMa}
              setDeletingMa={alerts.setDeletingMa}
            />
            <StudentComplianceSection
              section="afterTransition"
              studentId={studentId}
              bipReadOnly={bipReadOnly}
              isEditable={isEditable}
            />
            <StudentComplianceSection
              section="messagesAccommodations"
              studentId={studentId}
              studentName={studentName}
              messageGuardians={messageGuardians}
            />
            <StudentContactsMedical
              section="enrollment"
              enrollmentHistory={enrollment.enrollmentHistory}
              enrollmentLoading={enrollment.enrollmentLoading}
              role={role}
              openAddEvent={enrollment.openAddEvent}
              openEditEvent={enrollment.openEditEvent}
              setDeletingEvent={enrollment.setDeletingEvent}
            />
          </>
        )}
      </div>{/* end Documents & Contacts tab */}

      {/* ── JOURNEY ───────────────────────────────────────────────────── */}
      <div className={activeTab === "journey" ? "space-y-5" : "hidden"}>
        {mountedTabs.has("journey") && (
          <StudentJourneyTimeline studentId={studentId} />
        )}
      </div>{/* end Journey tab */}

      {/* ── STAFF GUIDE (handoff) ─────────────────────────────────────── */}
      <div className={activeTab === "handoff" ? "space-y-2" : "hidden"}>
        {mountedTabs.has("handoff") && (
          <StudentHandoffCard studentId={studentId} />
        )}
      </div>{/* end Staff Guide tab */}

      {/* Dialogs — always rendered so modals work from any tab */}
      <StudentDialogs
        addEventDialogOpen={enrollment.addEventDialogOpen}
        setAddEventDialogOpen={enrollment.setAddEventDialogOpen}
        addEventForm={enrollment.addEventForm}
        setAddEventForm={enrollment.setAddEventForm}
        addEventSaving={enrollment.addEventSaving}
        handleAddEvent={enrollment.handleAddEvent}
        editingEvent={enrollment.editingEvent}
        setEditingEvent={enrollment.setEditingEvent}
        deletingEvent={enrollment.deletingEvent}
        setDeletingEvent={enrollment.setDeletingEvent}
        handleDeleteEvent={enrollment.handleDeleteEvent}
        ecDialogOpen={contacts.ecDialogOpen}
        setEcDialogOpen={contacts.setEcDialogOpen}
        editingEc={contacts.editingEc}
        setEditingEc={contacts.setEditingEc}
        ecForm={contacts.ecForm}
        setEcForm={contacts.setEcForm}
        ecSaving={contacts.ecSaving}
        handleSaveEc={contacts.handleSaveEc}
        deletingEc={contacts.deletingEc}
        setDeletingEc={contacts.setDeletingEc}
        handleDeleteEc={contacts.handleDeleteEc}
        maDialogOpen={alerts.maDialogOpen}
        setMaDialogOpen={alerts.setMaDialogOpen}
        editingMa={alerts.editingMa}
        setEditingMa={alerts.setEditingMa}
        maForm={alerts.maForm}
        setMaForm={alerts.setMaForm}
        maSaving={alerts.maSaving}
        handleSaveMa={alerts.handleSaveMa}
        deletingMa={alerts.deletingMa}
        setDeletingMa={alerts.setDeletingMa}
        handleDeleteMa={alerts.handleDeleteMa}
        archiveDialogOpen={archive.archiveDialogOpen}
        setArchiveDialogOpen={archive.setArchiveDialogOpen}
        archiveReason={archive.archiveReason}
        setArchiveReason={archive.setArchiveReason}
        archiveSaving={archive.archiveSaving}
        handleArchive={archive.handleArchive}
        reactivateDialogOpen={archive.reactivateDialogOpen}
        setReactivateDialogOpen={archive.setReactivateDialogOpen}
        reactivateSaving={archive.reactivateSaving}
        handleReactivate={archive.handleReactivate}
        svcDialogOpen={services.svcDialogOpen}
        setSvcDialogOpen={services.setSvcDialogOpen}
        editingSvc={services.editingSvc}
        svcForm={services.svcForm}
        setSvcForm={services.setSvcForm}
        svcSaving={services.svcSaving}
        handleSaveSvc={services.handleSaveSvc}
        serviceTypesList={serviceTypesList}
        staffList={staffList}
        deletingSvc={services.deletingSvc}
        handleDeleteSvc={services.handleDeleteSvc}
        assignDialogOpen={assignments.assignDialogOpen}
        setAssignDialogOpen={assignments.setAssignDialogOpen}
        assignForm={assignments.assignForm}
        setAssignForm={assignments.setAssignForm}
        assignSaving={assignments.assignSaving}
        handleAddAssignment={assignments.handleAddAssignment}
        showShareModal={share.showShareModal}
        setShowShareModal={share.setShowShareModal}
        shareDays={share.shareDays}
        setShareDays={share.setShareDays}
        shareLoading={share.shareLoading}
        shareSummary={share.shareSummary}
        shareLink={share.shareLink ?? ""}
        handleShareProgress={share.handleShareProgress}
        handlePrintSummary={share.handlePrintSummary}
        generateShareLink={share.generateShareLink}
        studentId={studentId}
      />
      <SupersedeDialog
        flow={services.supersedeFlow}
        onConfirm={services.handleConfirmSupersede}
      />
      <QuickLogSheet
        isOpen={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onSuccess={() => {
          setQuickLogOpen(false);
          refetchStudent();
          refetchProgress();
        }}
        staffId={teacherId ?? null}
        prefillStudentId={studentId}
        prefillStudentName={studentName}
      />
    </div>
  );
}
