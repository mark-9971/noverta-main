import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Link } from "wouter";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import {
  ArrowLeft, Users, Calendar, AlertTriangle, CheckCircle2, Clock,
  Mail, Phone, Building, Shield, ChevronRight, ClipboardCheck, Stethoscope, Save, Loader2
} from "lucide-react";

import { toast } from "sonner";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import { useRole } from "@/lib/role-context";
import { getStaff, getStaffCaseloadSummary, getStaffCaseload, getStaffSupervisionSummary } from "@workspace/api-client-react";
import { authFetch } from "@workspace/api-client-react";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const WEEKDAY_SHORT: Record<string, string> = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri" };

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}

interface ProviderScheduleSummary {
  totalWeeklyHours: number;
  daysScheduled: number;
  distribution: Array<{ schoolId: number; schoolName: string; weeklyHours: number }>;
  schedule: Array<{ dayOfWeek: string; startTime: string; endTime: string; schoolName: string; serviceTypeName: string | null }>;
  availability: Record<string, Array<{ start: string; end: string }>>;
}

function MedicaidBillingFields({ staff, onSave }: { staff: any; onSave: (s: any) => void }) {
  const [npi, setNpi] = useState(staff.npiNumber || "");
  const [providerId, setProviderId] = useState(staff.medicaidProviderId || "");
  const [saving, setSaving] = useState(false);
  const dirty = npi !== (staff.npiNumber || "") || providerId !== (staff.medicaidProviderId || "");

  async function handleSave() {
    setSaving(true);
    try {
      const res = await authFetch(`/api/staff/${staff.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ npiNumber: npi || null, medicaidProviderId: providerId || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      onSave(updated);
      toast.success("Medicaid billing info saved");
    } catch {
      toast.error("Failed to save billing info");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-emerald-600" />
          Medicaid Billing Info
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="npi" className="text-xs text-gray-500">NPI Number</Label>
            <Input id="npi" placeholder="10-digit NPI" value={npi} onChange={e => setNpi(e.target.value)} maxLength={10} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="medicaidPid" className="text-xs text-gray-500">Medicaid Provider ID</Label>
            <Input id="medicaidPid" placeholder="State Medicaid Provider ID" value={providerId} onChange={e => setProviderId(e.target.value)} className="h-9" />
          </div>
        </div>
        {dirty && (
          <div className="flex justify-end mt-3">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>();
  const staffId = parseInt(id || "0");
  const { role } = useRole();
  const [staff, setStaff] = useState<any>(null);
  const [caseload, setCaseload] = useState<any>(null);
  const [supervisionSummary, setSupervisionSummary] = useState<any>(null);
  const [scheduleSummary, setScheduleSummary] = useState<ProviderScheduleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  function loadData() {
    if (!staffId) return;
    setLoading(true);
    setLoadError(false);
    Promise.all([
      getStaff(staffId).catch(() => null),
      getStaffCaseloadSummary(staffId).catch(() => ({ students: [], summary: {} })),
      getStaffCaseload(staffId).catch(() => []),
      getStaffSupervisionSummary(staffId).catch(() => null),
      authFetch(`/api/staff-schedules/provider-summary/${staffId}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([s, cs, cl, sup, sched]) => {
      setStaff(s);
      setCaseload({ ...cs, minuteProgress: Array.isArray(cl) ? cl : [] });
      setSupervisionSummary(sup);
      setScheduleSummary(sched);
    }).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, [staffId]);

  if (loading) return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4">
      <Skeleton className="w-48 h-6" />
      <Skeleton className="w-full h-32" />
      <Skeleton className="w-full h-64" />
    </div>
  );
  if (loadError) return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <Link href="/staff" className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-900 font-medium mb-4">
        <ArrowLeft className="w-4 h-4" /> All Staff
      </Link>
      <ErrorBanner message="Failed to load staff details. Please check your connection." onRetry={loadData} />
    </div>
  );
  if (!staff) return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <Link href="/staff" className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-900 font-medium mb-4">
        <ArrowLeft className="w-4 h-4" /> All Staff
      </Link>
      <div className="p-8 text-center text-gray-400">Staff member not found</div>
    </div>
  );

  const initials = `${(staff.firstName || "")[0] || ""}${(staff.lastName || "")[0] || ""}`;
  const summary = caseload?.summary || {};
  const students = caseload?.students || [];
  const minuteProgress = caseload?.minuteProgress || [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <Link href="/staff" className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-900 font-medium">
        <ArrowLeft className="w-4 h-4" /> All Staff
      </Link>

      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl font-bold">
          {initials}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">{staff.firstName} {staff.lastName}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${ROLE_COLORS[staff.role] || "bg-gray-100 text-gray-700"}`}>
              {ROLE_LABELS[staff.role] || staff.role}
            </span>
            {staff.email && (
              <span className="flex items-center gap-1 text-[12px] text-gray-400">
                <Mail className="w-3 h-3" /> {staff.email}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{summary.total || 0}</p>
              <p className="text-[11px] text-gray-400">Assigned Students</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{summary.activeIeps || 0}</p>
              <p className="text-[11px] text-gray-400">Active IEPs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{summary.iepsDueSoon || 0}</p>
              <p className="text-[11px] text-gray-400">IEPs Expiring Soon</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{summary.overdueReviews || 0}</p>
              <p className="text-[11px] text-gray-400">Expired IEPs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {(role === "admin" || role === "coordinator") && (
        <MedicaidBillingFields staff={staff} onSave={(updated: any) => setStaff(updated)} />
      )}

      {scheduleSummary && scheduleSummary.daysScheduled > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              Weekly Schedule & Availability
              <Link href="/staff-calendar" className="ml-auto text-xs text-emerald-600 hover:text-emerald-700 font-normal">
                View Full Calendar →
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-[10px] font-medium text-gray-500 uppercase">Weekly Hours</p>
                <p className="text-xl font-bold text-gray-900">{scheduleSummary.totalWeeklyHours}h</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-gray-500 uppercase">Days Scheduled</p>
                <p className="text-xl font-bold text-gray-900">{scheduleSummary.daysScheduled}/5</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-gray-500 uppercase">Buildings</p>
                <p className="text-xl font-bold text-gray-900">{scheduleSummary.distribution.length}</p>
              </div>
            </div>
            {scheduleSummary.distribution.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Building Distribution</p>
                <div className="space-y-1">
                  {scheduleSummary.distribution.map(d => (
                    <div key={d.schoolId} className="flex items-center gap-2">
                      <Building className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-700 flex-1">{d.schoolName}</span>
                      <span className="text-xs font-semibold text-gray-900">{d.weeklyHours}h</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-5 gap-1.5 pt-3 border-t border-gray-100">
              {WEEKDAYS.map(day => {
                const dayBlocks = scheduleSummary!.schedule.filter(s => s.dayOfWeek === day);
                const freeSlots = scheduleSummary!.availability?.[day] || [];
                return (
                  <div key={day} className="text-center">
                    <p className="text-[10px] font-semibold text-gray-500 mb-1">{WEEKDAY_SHORT[day]}</p>
                    {dayBlocks.length > 0 ? (
                      <div className="space-y-0.5">
                        {dayBlocks.map((b, i) => (
                          <div key={i} className="text-[9px] bg-emerald-50 rounded px-1 py-0.5 text-emerald-700 truncate" title={`${b.schoolName}${b.serviceTypeName ? ' — ' + b.serviceTypeName : ''}`}>
                            {formatTime(b.startTime).replace(/ [AP]M/, '')}-{formatTime(b.endTime).replace(/ [AP]M/, '')}
                          </div>
                        ))}
                        {freeSlots.map((s, i) => (
                          <div key={`f${i}`} className="text-[9px] bg-gray-50 rounded px-1 py-0.5 text-gray-400 truncate">
                            {formatTime(s.start).replace(/ [AP]M/, '')}-{formatTime(s.end).replace(/ [AP]M/, '')} free
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[9px] text-gray-300">No blocks</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Caseload Students</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2">
            {students.length > 0 ? students.map((s: any) => (
              <Link key={s.id} href={`/students/${s.id}`}>
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] font-bold text-gray-500">
                      {(s.firstName?.[0] || "")}{(s.lastName?.[0] || "")}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-gray-700">{s.firstName} {s.lastName}</p>
                      <p className="text-[11px] text-gray-400">Grade {s.grade}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-medium ${
                      s.iepStatus === "expired" ? "bg-red-100 text-red-700" :
                      s.iepStatus === "expiring_soon" ? "bg-amber-100 text-amber-700" :
                      s.iepStatus === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {s.iepStatus === "expired" ? "Expired" :
                       s.iepStatus === "expiring_soon" ? `${s.daysUntilExpiry}d left` :
                       s.iepStatus === "active" ? "Active" : "Unknown"}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
                  </div>
                </div>
              </Link>
            )) : (
              <p className="text-sm text-gray-400 text-center py-6">No assigned students</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Service Delivery Progress</CardTitle>
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
                    <p className="text-[12px] font-medium text-gray-700 truncate">{mp.studentName}</p>
                    <p className="text-[10px] text-gray-400">{mp.serviceTypeName}</p>
                  </div>
                  <span className="text-[11px] text-gray-500">{mp.deliveredMinutes}/{mp.requiredMinutes} min</span>
                </div>
              );
            }) : (
              <p className="text-sm text-gray-400 text-center py-6">No service data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {(staff.assignedStudents || []).length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Schedule Blocks</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {(staff.scheduleBlocks || []).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {(staff.scheduleBlocks || []).map((sb: any) => (
                  <div key={sb.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 text-[12px]">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    <span className="font-medium text-gray-700 capitalize">{sb.dayOfWeek}</span>
                    <span className="text-gray-500">{sb.startTime} - {sb.endTime}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No schedule blocks assigned</p>
            )}
          </CardContent>
        </Card>
      )}

      {supervisionSummary && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                Supervision Summary — Last 30 Days
              </CardTitle>
              <Link href="/supervision">
                <Button variant="outline" size="sm" className="text-xs">View All</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-[11px] text-gray-400">Direct Service</p>
                <p className="text-lg font-bold text-gray-800">{supervisionSummary.directServiceMinutes} min</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-[11px] text-gray-400">Required (5%)</p>
                <p className="text-lg font-bold text-gray-800">{supervisionSummary.requiredSupervisionMinutes} min</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-[11px] text-gray-400">Delivered</p>
                <p className="text-lg font-bold text-gray-800">{supervisionSummary.deliveredSupervisionMinutes} min</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-[11px] text-gray-400">Status</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                  supervisionSummary.complianceStatus === "compliant" ? "bg-emerald-100 text-emerald-700" :
                  supervisionSummary.complianceStatus === "at_risk" ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {supervisionSummary.complianceStatus === "compliant" ? "Compliant" :
                   supervisionSummary.complianceStatus === "at_risk" ? "At Risk" : "Non-Compliant"}
                  {supervisionSummary.compliancePercent > 0 && ` (${supervisionSummary.compliancePercent}%)`}
                </span>
              </div>
            </div>

            {(supervisionSummary.recentSessions || []).length > 0 ? (
              <div className="space-y-2">
                <p className="text-[12px] font-semibold text-gray-500">Recent Sessions</p>
                {supervisionSummary.recentSessions.slice(0, 5).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 text-[12px]">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-700 font-medium">{s.sessionDate}</span>
                      <span className="text-gray-500">{s.durationMinutes} min</span>
                      <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px]">
                        {s.supervisionType === "individual" ? "Individual" :
                         s.supervisionType === "group" ? "Group" : "Direct Obs"}
                      </span>
                    </div>
                    <span className="text-gray-400">{s.supervisorName || "—"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-3">No supervision sessions in the last 30 days</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
