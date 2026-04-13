import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import {
  ArrowLeft, Users, Calendar, AlertTriangle, CheckCircle2, Clock,
  Mail, Phone, Building, Shield, ChevronRight
} from "lucide-react";

import { ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";

const API = "/api";

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>();
  const staffId = parseInt(id || "0");
  const [staff, setStaff] = useState<any>(null);
  const [caseload, setCaseload] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!staffId) return;
    setLoading(true);
    Promise.all([
      fetch(`${API}/staff/${staffId}`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/staff/${staffId}/caseload-summary`).then(r => r.ok ? r.json() : { students: [], summary: {} }),
      fetch(`${API}/staff/${staffId}/caseload`).then(r => r.ok ? r.json() : []),
    ]).then(([s, cs, cl]) => {
      setStaff(s);
      setCaseload({ ...cs, minuteProgress: Array.isArray(cl) ? cl : [] });
    }).catch(console.error).finally(() => setLoading(false));
  }, [staffId]);

  if (loading) return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4">
      <Skeleton className="w-48 h-6" />
      <Skeleton className="w-full h-32" />
      <Skeleton className="w-full h-64" />
    </div>
  );
  if (!staff) return <div className="p-8 text-center text-slate-400">Staff member not found</div>;

  const initials = `${(staff.firstName || "")[0] || ""}${(staff.lastName || "")[0] || ""}`;
  const summary = caseload?.summary || {};
  const students = caseload?.students || [];
  const minuteProgress = caseload?.minuteProgress || [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <Link href="/staff" className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
        <ArrowLeft className="w-4 h-4" /> All Staff
      </Link>

      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-bold">
          {initials}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">{staff.firstName} {staff.lastName}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${ROLE_COLORS[staff.role] || "bg-slate-100 text-slate-700"}`}>
              {ROLE_LABELS[staff.role] || staff.role}
            </span>
            {staff.email && (
              <span className="flex items-center gap-1 text-[12px] text-slate-400">
                <Mail className="w-3 h-3" /> {staff.email}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{summary.total || 0}</p>
              <p className="text-[11px] text-slate-400">Assigned Students</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{summary.activeIeps || 0}</p>
              <p className="text-[11px] text-slate-400">Active IEPs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{summary.iepsDueSoon || 0}</p>
              <p className="text-[11px] text-slate-400">IEPs Expiring Soon</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{summary.overdueReviews || 0}</p>
              <p className="text-[11px] text-slate-400">Expired IEPs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-slate-600">Caseload Students</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2">
            {students.length > 0 ? students.map((s: any) => (
              <Link key={s.id} href={`/students/${s.id}`}>
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-500">
                      {(s.firstName?.[0] || "")}{(s.lastName?.[0] || "")}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-slate-700">{s.firstName} {s.lastName}</p>
                      <p className="text-[11px] text-slate-400">Grade {s.grade}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-medium ${
                      s.iepStatus === "expired" ? "bg-red-100 text-red-700" :
                      s.iepStatus === "expiring_soon" ? "bg-amber-100 text-amber-700" :
                      s.iepStatus === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      {s.iepStatus === "expired" ? "Expired" :
                       s.iepStatus === "expiring_soon" ? `${s.daysUntilExpiry}d left` :
                       s.iepStatus === "active" ? "Active" : "Unknown"}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
                  </div>
                </div>
              </Link>
            )) : (
              <p className="text-sm text-slate-400 text-center py-6">No assigned students</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-slate-600">Service Delivery Progress</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {minuteProgress.length > 0 ? minuteProgress.slice(0, 10).map((mp: any, i: number) => {
              const pct = mp.requiredMinutes > 0 ? Math.round((mp.deliveredMinutes / mp.requiredMinutes) * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <MiniProgressRing
                    value={Math.min(pct, 100)}
                    size={32}
                    strokeWidth={3}
                    color={pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444"}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-slate-700 truncate">{mp.studentName}</p>
                    <p className="text-[10px] text-slate-400">{mp.serviceTypeName}</p>
                  </div>
                  <span className="text-[11px] text-slate-500">{mp.deliveredMinutes}/{mp.requiredMinutes} min</span>
                </div>
              );
            }) : (
              <p className="text-sm text-slate-400 text-center py-6">No service data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {(staff.assignedStudents || []).length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-slate-600">Schedule Blocks</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {(staff.scheduleBlocks || []).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {(staff.scheduleBlocks || []).map((sb: any) => (
                  <div key={sb.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 text-[12px]">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium text-slate-700 capitalize">{sb.dayOfWeek}</span>
                    <span className="text-slate-500">{sb.startTime} - {sb.endTime}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No schedule blocks assigned</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
