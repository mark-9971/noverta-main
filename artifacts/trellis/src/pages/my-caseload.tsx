import { useMemo } from "react";
import { Link } from "wouter";
import { useRole } from "@/lib/role-context";
import { useListServiceRequirements, useListStudents, useListSessions, useListStaff } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Timer, ClipboardList, AlertTriangle, Shield,
  CheckCircle2, Clock, BookOpen, ChevronRight, Activity,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import RoleFirstRunCard from "@/components/onboarding/RoleFirstRunCard";
import { formatDate } from "@/lib/formatters";

interface AssignedBip {
  id: number; studentId: number; studentName?: string;
  targetBehavior: string; status: string; version: number;
  teachingStrategies: string | null; crisisPlan: string | null;
  implementationStartDate: string | null;
}

interface ServiceReq {
  id: number; studentId: number; providerId: number | null;
  serviceTypeName?: string; serviceType?: any;
  requiredMinutes: number; intervalType: string;
  startDate: string | null; endDate: string | null; active: boolean;
}
interface Student {
  id: number; firstName: string; lastName: string;
  grade: string | null; schoolId: number | null;
}
interface SessionLog {
  id: number; studentId: number; staffId: number | null;
  sessionDate: string; durationMinutes: number | null; status: string;
}

function minuteLabel(minutes: number, interval: string) {
  if (interval === "weekly") return `${minutes} min/wk`;
  if (interval === "monthly") return `${minutes} min/mo`;
  return `${minutes} min`;
}

function ComplianceDot({ status }: { status: "ok" | "warn" | "missing" }) {
  if (status === "ok") return <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" title="On track" />;
  if (status === "warn") return <span className="inline-block w-2 h-2 rounded-full bg-amber-400" title="Some sessions missed" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-gray-300" title="No sessions this week" />;
}

export default function MyCaseloadPage() {
  const { teacherId, role } = useRole();

  const { data: allReqs, isLoading: reqsLoading } = useListServiceRequirements(
    teacherId ? { providerId: teacherId, active: "true" } as any : ({} as any),
    { enabled: !!teacherId }
  );
  const { data: allStudents, isLoading: studentsLoading } = useListStudents({} as any);
  const { data: recentSessions } = useListSessions({ staffId: teacherId } as any, { enabled: !!teacherId });
  const { data: allStaff } = useListStaff({} as any);

  const { data: assignedBipsData } = useQuery<AssignedBip[]>({
    queryKey: ["assigned-bips", teacherId],
    queryFn: ({ signal }) =>
      authFetch(`/api/staff/${teacherId}/assigned-bips`, { signal }).then(async r => {
        if (!r.ok) return [];
        return r.json();
      }),
    enabled: !!teacherId,
  });
  const assignedBips: AssignedBip[] = assignedBipsData ?? [];

  const reqs: ServiceReq[] = useMemo(() => (allReqs as any[] ?? []).filter((r: any) => r.active), [allReqs]);
  const students: Student[] = useMemo(() => ((allStudents as any)?.data ?? []) as Student[], [allStudents]);
  const sessions: SessionLog[] = useMemo(() => ((recentSessions as any)?.data ?? []) as SessionLog[], [recentSessions]);

  const myStaff = useMemo(() => {
    if (!teacherId) return null;
    return (allStaff as any[] ?? []).find((s: any) => s.id === teacherId) ?? null;
  }, [allStaff, teacherId]);

  const caseloadStudentIds = useMemo(() => {
    const ids = new Set<number>();
    reqs.forEach(r => ids.add(r.studentId));
    return ids;
  }, [reqs]);

  const caseloadStudents = useMemo(() => {
    return students.filter(s => caseloadStudentIds.has(s.id));
  }, [students, caseloadStudentIds]);

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  }, []);

  function getStudentData(studentId: number) {
    const studentReqs = reqs.filter(r => r.studentId === studentId);
    const studentSessions = sessions.filter(s => s.studentId === studentId);
    const recentSession = [...studentSessions].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))[0];
    const thisWeekSessions = studentSessions.filter(s => s.sessionDate >= weekStart);
    const totalWeeklyRequired = studentReqs.filter(r => r.intervalType === "weekly").reduce((sum, r) => sum + r.requiredMinutes, 0);
    const thisWeekDelivered = thisWeekSessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
    let complianceStatus: "ok" | "warn" | "missing" = "missing";
    if (totalWeeklyRequired > 0) {
      const pct = thisWeekDelivered / totalWeeklyRequired;
      complianceStatus = pct >= 0.9 ? "ok" : pct > 0 ? "warn" : "missing";
    } else if (thisWeekSessions.length > 0) {
      complianceStatus = "ok";
    }
    return { studentReqs, recentSession, thisWeekSessions, totalWeeklyRequired, thisWeekDelivered, complianceStatus };
  }

  const loading = reqsLoading || studentsLoading;

  const totalRequiredMinutes = useMemo(() => reqs.filter(r => r.intervalType === "weekly").reduce((s, r) => s + r.requiredMinutes, 0), [reqs]);
  const thisWeekTotal = useMemo(() => sessions.filter(s => s.sessionDate >= weekStart).reduce((s, sess) => s + (sess.durationMinutes ?? 0), 0), [sessions, weekStart]);

  if (!teacherId) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <EmptyState
          icon={Users}
          title="No staff profile linked"
          description="Your account isn't linked to a staff record yet. Contact your administrator to set this up."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">My Caseload</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">
          {myStaff ? `${myStaff.firstName} ${myStaff.lastName} · ` : ""}
          {caseloadStudents.length} student{caseloadStudents.length !== 1 ? "s" : ""} assigned
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={Users} label="Students" value={caseloadStudents.length} color="emerald" />
        <SummaryCard icon={Timer} label="Weekly Minutes Required" value={`${totalRequiredMinutes} min`} color="blue" />
        <SummaryCard icon={CheckCircle2} label="Delivered This Week" value={`${thisWeekTotal} min`} color={thisWeekTotal >= totalRequiredMinutes * 0.9 ? "emerald" : "amber"} />
        <SummaryCard icon={ClipboardList} label="Active Service Plans" value={reqs.length} color="gray" />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : caseloadStudents.length === 0 ? (
        role === "admin" || role === "coordinator" ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Shield className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">Administrator accounts don't carry a direct service caseload.</p>
              <p className="text-xs text-gray-400 mt-1">Use the Students page to view all student records and compliance across the district.</p>
              <div className="flex gap-2 justify-center mt-4">
                <Link href="/students">
                  <Button size="sm" variant="outline" className="text-[12px]">View All Students</Button>
                </Link>
                <Link href="/compliance">
                  <Button size="sm" variant="outline" className="text-[12px]">Compliance Dashboard</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <RoleFirstRunCard role="provider" personName={myStaff?.firstName} />
        )
      ) : (
        <div className="space-y-3">
          {caseloadStudents.map(student => {
            const { studentReqs, recentSession, thisWeekSessions, totalWeeklyRequired, thisWeekDelivered, complianceStatus } = getStudentData(student.id);
            return (
              <Card key={student.id} className="hover:border-emerald-200 transition-colors">
                <CardContent className="py-4 px-5">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <ComplianceDot status={complianceStatus} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-semibold text-gray-800">
                            {student.firstName} {student.lastName}
                          </span>
                          {student.grade && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5">Gr {student.grade}</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {studentReqs.map((req, i) => (
                            <span key={i} className="text-[11px] text-gray-500">
                              {req.serviceType?.name ?? req.serviceTypeName ?? "Service"} · {minuteLabel(req.requiredMinutes, req.intervalType)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-center flex-shrink-0">
                      {totalWeeklyRequired > 0 && (
                        <div>
                          <p className="text-[10px] text-gray-400">This Week</p>
                          <p className={`text-[13px] font-bold ${thisWeekDelivered >= totalWeeklyRequired ? "text-emerald-600" : thisWeekDelivered > 0 ? "text-amber-600" : "text-gray-400"}`}>
                            {thisWeekDelivered}<span className="text-gray-400 font-normal text-[11px]">/{totalWeeklyRequired} min</span>
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-gray-400">Last Session</p>
                        <p className="text-[12px] text-gray-600 font-medium">
                          {recentSession ? formatDate(recentSession.sessionDate) : <span className="text-gray-300">—</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400">Sessions</p>
                        <p className="text-[13px] font-bold text-gray-700">{thisWeekSessions.length}<span className="text-gray-400 font-normal text-[11px]"> this wk</span></p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link href={`/students/${student.id}/iep`}>
                        <Button size="sm" variant="outline" className="text-[11px] h-7 gap-1">
                          <BookOpen className="w-3 h-3" /> IEP
                        </Button>
                      </Link>
                      <Link href={`/sessions?studentId=${student.id}`}>
                        <Button size="sm" variant="outline" className="text-[11px] h-7 gap-1">
                          <ClipboardList className="w-3 h-3" /> Log
                        </Button>
                      </Link>
                      <Link href={`/students/${student.id}`}>
                        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] h-7 gap-1">
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {assignedBips.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-gray-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" /> My BIP Assignments
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-1">{assignedBips.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {assignedBips.map(bip => {
              const student = students.find(s => s.id === bip.studentId);
              return (
                <div key={bip.id} className="border border-gray-100 rounded-lg p-3 text-[12px]">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-gray-800">
                      {student ? `${student.firstName} ${student.lastName}` : `Student ${bip.studentId}`}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-gray-400">v{bip.version}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${bip.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                        {bip.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-gray-600 line-clamp-2">{bip.targetBehavior}</p>
                  {bip.implementationStartDate && (
                    <p className="text-gray-400 text-[11px] mt-1">Started {formatDate(bip.implementationStartDate)}</p>
                  )}
                  <Link href="/behavior-assessment">
                    <Button size="sm" variant="ghost" className="mt-1.5 text-[11px] h-6 px-2 text-emerald-700">
                      View BIP <ChevronRight className="w-3 h-3 ml-0.5" />
                    </Button>
                  </Link>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4 mt-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-500" /> Recent Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessions.slice(0, 6).length === 0 ? (
              <p className="text-[12px] text-gray-400 py-4 text-center">No sessions recorded yet.</p>
            ) : sessions.slice(0, 6).map((s: any) => {
              const stu = students.find(st => st.id === s.studentId);
              return (
                <div key={s.id} className="flex items-center justify-between text-[12px]">
                  <div>
                    <span className="font-medium text-gray-700">{stu ? `${stu.firstName} ${stu.lastName}` : "—"}</span>
                    <span className="text-gray-400 ml-2">{formatDate(s.sessionDate)}</span>
                  </div>
                  <span className={`text-[11px] font-semibold ${s.status === "completed" ? "text-emerald-600" : "text-amber-600"}`}>
                    {s.durationMinutes ? `${s.durationMinutes} min` : s.status}
                  </span>
                </div>
              );
            })}
            <Link href="/sessions">
              <Button size="sm" variant="ghost" className="w-full text-[11px] text-gray-400 mt-1 h-7">View all sessions <ChevronRight className="w-3 h-3 ml-1" /></Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-gray-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Students Needing Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {caseloadStudents.filter(s => getStudentData(s.id).complianceStatus !== "ok").length === 0 ? (
              <div className="flex items-center gap-2 py-4">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <p className="text-[12px] text-gray-500">All students on track this week.</p>
              </div>
            ) : caseloadStudents.filter(s => getStudentData(s.id).complianceStatus !== "ok").map(s => {
              const { complianceStatus, thisWeekDelivered, totalWeeklyRequired } = getStudentData(s.id);
              return (
                <div key={s.id} className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center gap-2">
                    <ComplianceDot status={complianceStatus} />
                    <span className="font-medium text-gray-700">{s.firstName} {s.lastName}</span>
                  </div>
                  <span className="text-gray-400">
                    {thisWeekDelivered}/{totalWeeklyRequired} min this wk
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    gray: "bg-gray-50 text-gray-500",
  };
  return (
    <Card>
      <CardContent className="py-4 px-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[color] ?? colors.gray}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[19px] font-bold text-gray-800 leading-tight truncate">{value}</p>
            <p className="text-[11px] text-gray-400 leading-tight">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
