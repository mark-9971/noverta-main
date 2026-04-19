import { useParams, useSearch, useLocation } from "wouter";
import { useGetStudent, useGetStudentMinuteProgress, useGetStudentSessions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle, XCircle, TrendingUp, FileText, Activity, Target, Gift, Share2, Plus, Archive, ArchiveRestore, CalendarDays, Bell, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect, useRef, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { RISK_CONFIG } from "@/lib/constants";
import StudentSnapshot from "@/components/student-snapshot";
import { useRole } from "@/lib/role-context";
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
  getStudentProgressSummary,
  createProgressShareLink,
  createServiceRequirement,
  updateServiceRequirement,
  deleteServiceRequirement,
  listServiceTypes,
  listStaff,
  createStaffAssignment,
  deleteStaffAssignment,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Stethoscope } from "lucide-react";

import StudentGoalSection from "./student-detail/StudentGoalSection";
import StudentServiceSection from "./student-detail/StudentServiceSection";
import StudentBehaviorSection from "./student-detail/StudentBehaviorSection";
import PreferenceAssessmentCard from "@/components/preference-assessment/PreferenceAssessmentCard";
import ReinforcerInventoryPanel from "@/components/preference-assessment/ReinforcerInventoryPanel";
import SupportIntensityCard from "@/components/support-intensity/SupportIntensityCard";
import StudentSessionHistory from "./student-detail/StudentSessionHistory";
import StudentComplianceSection from "./student-detail/StudentComplianceSection";
import StudentContactsMedical, { EmergencyContactRecord, MedicalAlertRecord } from "./student-detail/StudentContactsMedical";
import StudentProgressReports from "./student-detail/StudentProgressReports";
import StudentDialogs from "./student-detail/StudentDialogs";
import StudentJourneyTimeline from "./student-detail/StudentJourneyTimeline";
import StudentHandoffCard from "./student-detail/StudentHandoffCard";

const BIP_EDIT_ROLES = ["admin", "case_manager", "bcba"];

function StudentMedicaidField({ student, onSave }: { student: any; onSave: () => void }) {
  const [mid, setMid] = useState(student?.medicaidId || "");
  const [saving, setSaving] = useState(false);
  const dirty = mid !== (student?.medicaidId || "");

  useEffect(() => { setMid(student?.medicaidId || ""); }, [student?.medicaidId]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await authFetch(`/api/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicaidId: mid || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onSave();
      toast.success("Medicaid ID saved");
    } catch {
      toast.error("Failed to save Medicaid ID");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <Stethoscope className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 flex items-center gap-3">
          <Label htmlFor="medicaidId" className="text-xs text-gray-500 whitespace-nowrap">Medicaid ID</Label>
          <Input id="medicaidId" placeholder="Student Medicaid ID" value={mid} onChange={e => setMid(e.target.value)} className="h-8 max-w-xs" />
          {dirty && (
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-8">
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function StudentDetail() {
  const params = useParams<{ id: string }>();
  const studentId = Number(params.id);
  const { role } = useRole();
  const bipReadOnly = !BIP_EDIT_ROLES.includes(role);

  const { data: student, isLoading: loadingStudent, refetch: refetchStudent } = useGetStudent(studentId);
  const { data: progress, refetch: refetchProgress } = useGetStudentMinuteProgress(studentId);
  const { data: sessions } = useGetStudentSessions(studentId, { limit: 20 } as any);

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

  const [expandedDataSessionId, setExpandedDataSessionId] = useState<number | null>(null);
  const [expandedDataDetail, setExpandedDataDetail] = useState<any>(null);
  const [expandedDataLoading, setExpandedDataLoading] = useState(false);

  const [expandedServiceSessionId, setExpandedServiceSessionId] = useState<number | null>(null);
  const [expandedServiceDetail, setExpandedServiceDetail] = useState<any>(null);
  const [expandedServiceLoading, setExpandedServiceLoading] = useState(false);

  const [behaviorPhaseLines, setBehaviorPhaseLines] = useState<Record<number, { id: string; date: string; label: string; color?: string }[]>>({});
  const [programPhaseLines, setProgramPhaseLines] = useState<Record<number, { id: string; date: string; label: string; color?: string }[]>>({});
  const [goalAbaView, setGoalAbaView] = useState<Record<string | number, boolean>>({});
  const [minutesExpanded, setMinutesExpanded] = useState(false);
  const [minutesTrend, setMinutesTrend] = useState<any[]>([]);
  const [minutesPhaseLines, setMinutesPhaseLines] = useState<{ id: string; date: string; label: string; color?: string }[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareSummary, setShareSummary] = useState<any>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareDays, setShareDays] = useState(30);
  const [phaseChangesByTarget, setPhaseChangesByTarget] = useState<Record<number, any[]>>({});
  const [annotationsByGoal, setAnnotationsByGoal] = useState<Record<number, any[]>>({});

  const [svcDialogOpen, setSvcDialogOpen] = useState(false);
  const [editingSvc, setEditingSvc] = useState<any>(null);
  const [deletingSvc, setDeletingSvc] = useState<any>(null);
  const [svcSaving, setSvcSaving] = useState(false);
  const [serviceTypesList, setServiceTypesList] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [svcForm, setSvcForm] = useState({ serviceTypeId: "", providerId: "", deliveryType: "direct", requiredMinutes: "", intervalType: "weekly", startDate: "", endDate: "", priority: "medium", notes: "" });

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignForm, setAssignForm] = useState({ staffId: "", assignmentType: "service_provider", startDate: "", endDate: "", notes: "" });

  const [enrollmentHistory, setEnrollmentHistory] = useState<any[]>([]);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);

  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContactRecord[]>([]);
  const [emergencyContactsLoading, setEmergencyContactsLoading] = useState(false);
  const [ecDialogOpen, setEcDialogOpen] = useState(false);
  const [editingEc, setEditingEc] = useState<EmergencyContactRecord | null>(null);
  const [ecSaving, setEcSaving] = useState(false);
  const [deletingEc, setDeletingEc] = useState<EmergencyContactRecord | null>(null);
  const [ecForm, setEcForm] = useState({ firstName: "", lastName: "", relationship: "", phone: "", phoneSecondary: "", email: "", isAuthorizedForPickup: false, priority: 1, notes: "" });

  const [medicalAlerts, setMedicalAlerts] = useState<MedicalAlertRecord[]>([]);
  const [medicalAlertsLoading, setMedicalAlertsLoading] = useState(false);
  const [maDialogOpen, setMaDialogOpen] = useState(false);
  const [editingMa, setEditingMa] = useState<MedicalAlertRecord | null>(null);
  const [maSaving, setMaSaving] = useState(false);
  const [deletingMa, setDeletingMa] = useState<MedicalAlertRecord | null>(null);
  const [maForm, setMaForm] = useState({ alertType: "allergy", description: "", severity: "mild", treatmentNotes: "", epiPenOnFile: false, notifyAllStaff: false });

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [reactivateSaving, setReactivateSaving] = useState(false);
  const [messageGuardians, setMessageGuardians] = useState<{ id: number; name: string; relationship: string; email: string | null }[]>([]);

  const [addEventDialogOpen, setAddEventDialogOpen] = useState(false);
  const [addEventSaving, setAddEventSaving] = useState(false);
  const [addEventForm, setAddEventForm] = useState({ eventType: "note", eventDate: "", reasonCode: "", reason: "", notes: "" });
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<any | null>(null);

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

  // Contacts & Medical — fires on first Contacts tab visit
  useEffect(() => {
    if (!contactsDataFetched || !studentId) return;
    setEnrollmentLoading(true);
    authFetch(`/api/students/${studentId}/enrollment`)
      .then((r: any) => r.json())
      .then((d: any) => setEnrollmentHistory(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setEnrollmentLoading(false));
    setEmergencyContactsLoading(true);
    authFetch(`/api/students/${studentId}/emergency-contacts`)
      .then((r: Response) => r.json())
      .then((d: EmergencyContactRecord[]) => setEmergencyContacts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setEmergencyContactsLoading(false));
    setMedicalAlertsLoading(true);
    authFetch(`/api/students/${studentId}/medical-alerts`)
      .then((r: Response) => r.json())
      .then((d: MedicalAlertRecord[]) => setMedicalAlerts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setMedicalAlertsLoading(false));
    authFetch(`/api/students/${studentId}/guardians`)
      .then((r: Response) => r.ok ? r.json() : [])
      .then((d: any) => setMessageGuardians(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [contactsDataFetched, studentId]);

  async function handleArchive() {
    setArchiveSaving(true);
    try {
      const r = await authFetch(`/api/students/${studentId}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: archiveReason || null }) });
      if (!r.ok) throw new Error();
      toast.success("Student archived");
      setArchiveDialogOpen(false);
      setArchiveReason("");
      refetchStudent();
      const d = await authFetch(`/api/students/${studentId}/enrollment`).then((r: any) => r.json());
      setEnrollmentHistory(Array.isArray(d) ? d : []);
    } catch { toast.error("Failed to archive student"); }
    setArchiveSaving(false);
  }

  async function handleReactivate() {
    setReactivateSaving(true);
    try {
      const r = await authFetch(`/api/students/${studentId}/reactivate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!r.ok) throw new Error();
      toast.success("Student reactivated");
      setReactivateDialogOpen(false);
      refetchStudent();
      const d = await authFetch(`/api/students/${studentId}/enrollment`).then((r: any) => r.json());
      setEnrollmentHistory(Array.isArray(d) ? d : []);
    } catch { toast.error("Failed to reactivate student"); }
    setReactivateSaving(false);
  }

  async function handleAddEvent() {
    if (!addEventForm.eventType || !addEventForm.eventDate) { toast.error("Event type and date are required"); return; }
    setAddEventSaving(true);
    try {
      if (editingEvent) {
        const r = await authFetch(`/api/students/${studentId}/enrollment/${editingEvent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: addEventForm.eventType,
            eventDate: addEventForm.eventDate,
            reasonCode: addEventForm.reasonCode || null,
            reason: addEventForm.reason || null,
            notes: addEventForm.notes || null,
          }),
        });
        if (!r.ok) throw new Error();
        toast.success("Enrollment event updated");
      } else {
        const r = await authFetch(`/api/students/${studentId}/enrollment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: addEventForm.eventType,
            eventDate: addEventForm.eventDate,
            reasonCode: addEventForm.reasonCode || null,
            reason: addEventForm.reason || null,
            notes: addEventForm.notes || null,
          }),
        });
        if (!r.ok) throw new Error();
        toast.success("Enrollment event logged");
      }
      setAddEventDialogOpen(false);
      setEditingEvent(null);
      setAddEventForm({ eventType: "note", eventDate: "", reasonCode: "", reason: "", notes: "" });
      const d = await authFetch(`/api/students/${studentId}/enrollment`).then((res: any) => res.json());
      setEnrollmentHistory(Array.isArray(d) ? d : []);
    } catch { toast.error(editingEvent ? "Failed to update event" : "Failed to log event"); }
    setAddEventSaving(false);
  }

  function openAddEvent() {
    setEditingEvent(null);
    setAddEventForm({ eventType: "note", eventDate: new Date().toISOString().slice(0, 10), reasonCode: "", reason: "", notes: "" });
    setAddEventDialogOpen(true);
  }

  function openEditEvent(ev: any) {
    setEditingEvent(ev);
    setAddEventForm({
      eventType: ev.eventType ?? "note",
      eventDate: ev.eventDate ?? "",
      reasonCode: ev.reasonCode ?? "",
      reason: ev.reason ?? "",
      notes: ev.notes ?? "",
    });
    setAddEventDialogOpen(true);
  }

  async function handleDeleteEvent(ev: any) {
    try {
      const r = await authFetch(`/api/students/${studentId}/enrollment/${ev.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Enrollment event deleted");
      setDeletingEvent(null);
      const d = await authFetch(`/api/students/${studentId}/enrollment`).then((res: any) => res.json());
      setEnrollmentHistory(Array.isArray(d) ? d : []);
    } catch { toast.error("Failed to delete event"); }
  }

  async function handleSaveEc() {
    if (!ecForm.firstName || !ecForm.lastName || !ecForm.relationship || !ecForm.phone) {
      toast.error("First name, last name, relationship, and phone are required"); return;
    }
    setEcSaving(true);
    try {
      if (editingEc) {
        const r = await authFetch(`/api/emergency-contacts/${editingEc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ecForm) });
        if (!r.ok) throw new Error();
        toast.success("Contact updated");
      } else {
        const r = await authFetch(`/api/students/${studentId}/emergency-contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ecForm, studentId }) });
        if (!r.ok) throw new Error();
        toast.success("Contact added");
      }
      setEcDialogOpen(false);
      setEditingEc(null);
      const d = await authFetch(`/api/students/${studentId}/emergency-contacts`).then((r: Response) => r.json());
      setEmergencyContacts(Array.isArray(d) ? d : []);
    } catch { toast.error("Failed to save contact"); }
    setEcSaving(false);
  }

  async function handleDeleteEc(contact: EmergencyContactRecord) {
    try {
      const r = await authFetch(`/api/emergency-contacts/${contact.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Contact removed");
      setDeletingEc(null);
      const d = await authFetch(`/api/students/${studentId}/emergency-contacts`).then((r: Response) => r.json());
      setEmergencyContacts(Array.isArray(d) ? d : []);
    } catch { toast.error("Failed to remove contact"); }
  }

  function openAddEc() {
    setEditingEc(null);
    setEcForm({ firstName: "", lastName: "", relationship: "", phone: "", phoneSecondary: "", email: "", isAuthorizedForPickup: false, priority: 1, notes: "" });
    setEcDialogOpen(true);
  }

  function openEditEc(contact: EmergencyContactRecord) {
    setEditingEc(contact);
    setEcForm({
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      relationship: contact.relationship ?? "",
      phone: contact.phone ?? "",
      phoneSecondary: contact.phoneSecondary ?? "",
      email: contact.email ?? "",
      isAuthorizedForPickup: contact.isAuthorizedForPickup ?? false,
      priority: contact.priority ?? 1,
      notes: contact.notes ?? "",
    });
    setEcDialogOpen(true);
  }

  async function handleSaveMa() {
    if (!maForm.description || !maForm.alertType || !maForm.severity) {
      toast.error("Alert type, description, and severity are required"); return;
    }
    setMaSaving(true);
    try {
      if (editingMa) {
        const r = await authFetch(`/api/medical-alerts/${editingMa.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(maForm) });
        if (!r.ok) throw new Error();
        toast.success("Alert updated");
      } else {
        const r = await authFetch(`/api/students/${studentId}/medical-alerts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...maForm, studentId }) });
        if (!r.ok) throw new Error();
        toast.success("Alert added");
      }
      setMaDialogOpen(false);
      setEditingMa(null);
      const d = await authFetch(`/api/students/${studentId}/medical-alerts`).then((r: Response) => r.json());
      setMedicalAlerts(Array.isArray(d) ? d : []);
    } catch { toast.error("Failed to save alert"); }
    setMaSaving(false);
  }

  async function handleDeleteMa(alert: MedicalAlertRecord) {
    try {
      const r = await authFetch(`/api/medical-alerts/${alert.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Alert removed");
      setDeletingMa(null);
      const d = await authFetch(`/api/students/${studentId}/medical-alerts`).then((r: Response) => r.json());
      setMedicalAlerts(Array.isArray(d) ? d : []);
    } catch { toast.error("Failed to remove alert"); }
  }

  function openAddMa() {
    setEditingMa(null);
    setMaForm({ alertType: "allergy", description: "", severity: "mild", treatmentNotes: "", epiPenOnFile: false, notifyAllStaff: false });
    setMaDialogOpen(true);
  }

  function openEditMa(alert: MedicalAlertRecord) {
    setEditingMa(alert);
    setMaForm({
      alertType: alert.alertType ?? "allergy",
      description: alert.description ?? "",
      severity: alert.severity ?? "mild",
      treatmentNotes: alert.treatmentNotes ?? "",
      epiPenOnFile: alert.epiPenOnFile ?? false,
      notifyAllStaff: alert.notifyAllStaff ?? false,
    });
    setMaDialogOpen(true);
  }

  function openAddSvc() {
    setEditingSvc(null);
    setSvcForm({ serviceTypeId: "", providerId: "", deliveryType: "direct", requiredMinutes: "", intervalType: "weekly", startDate: new Date().toISOString().split("T")[0], endDate: "", priority: "medium", notes: "" });
    setSvcDialogOpen(true);
  }

  function openEditSvc(req: any) {
    setEditingSvc(req);
    setSvcForm({
      serviceTypeId: String(req.serviceTypeId),
      providerId: req.providerId ? String(req.providerId) : "",
      deliveryType: req.deliveryType || "direct",
      requiredMinutes: String(req.requiredMinutes),
      intervalType: req.intervalType || "weekly",
      startDate: req.startDate || "",
      endDate: req.endDate || "",
      priority: req.priority || "medium",
      notes: req.notes || "",
    });
    setSvcDialogOpen(true);
  }

  async function handleSaveSvc() {
    if (!svcForm.serviceTypeId || !svcForm.requiredMinutes) { toast.error("Service type and minutes are required"); return; }
    setSvcSaving(true);
    try {
      if (editingSvc) {
        await updateServiceRequirement(editingSvc.id, {
          providerId: svcForm.providerId && svcForm.providerId !== "__none" ? Number(svcForm.providerId) : null,
          deliveryType: svcForm.deliveryType,
          requiredMinutes: Number(svcForm.requiredMinutes),
          intervalType: svcForm.intervalType,
          startDate: svcForm.startDate || null,
          endDate: svcForm.endDate || null,
          priority: svcForm.priority,
          notes: svcForm.notes || null,
        });
        toast.success("Service requirement updated");
      } else {
        await createServiceRequirement({
          studentId,
          serviceTypeId: Number(svcForm.serviceTypeId),
          providerId: svcForm.providerId && svcForm.providerId !== "__none" ? Number(svcForm.providerId) : null,
          deliveryType: svcForm.deliveryType,
          requiredMinutes: Number(svcForm.requiredMinutes),
          intervalType: svcForm.intervalType,
          startDate: svcForm.startDate,
          endDate: svcForm.endDate || null,
          priority: svcForm.priority,
          notes: svcForm.notes || null,
          active: true,
        });
        toast.success("Service requirement added");
      }
      setSvcDialogOpen(false);
      refetchStudent();
      refetchProgress();
    } catch { toast.error("Failed to save service requirement"); }
    setSvcSaving(false);
  }

  async function handleDeleteSvc() {
    if (!deletingSvc) return;
    setSvcSaving(true);
    try {
      await deleteServiceRequirement(deletingSvc.id);
      toast.success("Service requirement deleted");
      setDeletingSvc(null);
      refetchStudent();
      refetchProgress();
    } catch { toast.error("Failed to delete"); }
    setSvcSaving(false);
  }

  async function handleAddAssignment() {
    if (!assignForm.staffId || !assignForm.assignmentType) { toast.error("Staff and assignment type required"); return; }
    setAssignSaving(true);
    try {
      await createStaffAssignment({
        staffId: Number(assignForm.staffId),
        studentId,
        assignmentType: assignForm.assignmentType,
        startDate: assignForm.startDate || null,
        endDate: assignForm.endDate || null,
        notes: assignForm.notes || null,
      });
      toast.success("Staff assigned");
      setAssignDialogOpen(false);
      refetchStudent();
    } catch { toast.error("Failed to assign staff"); }
    setAssignSaving(false);
  }

  async function handleRemoveAssignment(id: number) {
    try {
      await deleteStaffAssignment(id);
      toast.success("Assignment removed");
      refetchStudent();
    } catch { toast.error("Failed to remove assignment"); }
  }

  function openAssignDialog() {
    setAssignForm({ staffId: "", assignmentType: "service_provider", startDate: "", endDate: "", notes: "" });
    setAssignDialogOpen(true);
  }

  const isEditable = role === "admin" || role === "case_manager";

  const STUDENT_TABS = [
    { id: "summary" as const, label: "Summary" },
    { id: "iep" as const, label: "IEP & Goals" },
    { id: "sessions" as const, label: "Sessions" },
    { id: "reports" as const, label: "Progress Reports" },
    { id: "behavior" as const, label: "Behavior & ABA" },
    { id: "contacts" as const, label: "Contacts & Documents" },
    { id: "journey" as const, label: "History" },
    { id: "handoff" as const, label: "Staff Guide" },
  ] as const;

  type StudentTab = typeof STUDENT_TABS[number]["id"];

  function resolveTab(s: string): StudentTab {
    const p = new URLSearchParams(s).get("tab") as StudentTab | null;
    return p && STUDENT_TABS.some(t => t.id === p) ? p : "summary";
  }

  const search = useSearch();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<StudentTab>(() => resolveTab(search));
  const [mountedTabs, setMountedTabs] = useState<Set<StudentTab>>(() => new Set([resolveTab(search)]));

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

  const latestEnrollment = enrollmentHistory.length > 0 ? enrollmentHistory[0] : null;
  const enrolledEvent = enrollmentHistory.find((e: any) => e.eventType === "enrolled");
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
        <Link href="/students" className="text-emerald-700 text-sm flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Students
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

  async function handleShareProgress() {
    setShowShareModal(true);
    setShareLoading(true);
    setShareLink(null);
    setShareSummary(null);
    try {
      const data = await getStudentProgressSummary(studentId, { days: shareDays } as any);
      setShareSummary(data);
    } catch {}
    setShareLoading(false);
  }

  async function generateShareLink() {
    try {
      const data = await createProgressShareLink(studentId, { days: shareDays, expiresInHours: 72 } as any);
      const fullUrl = `${window.location.origin}${data.url}`;
      setShareLink(fullUrl);
      toast.success("Share link generated (expires in 72 hours)");
    } catch {
      toast.error("Failed to generate share link");
    }
  }

  function handlePrintSummary() {
    const w = window.open("", "_blank");
    if (!w || !shareSummary) return;
    const s = shareSummary;
    w.document.write(`<!DOCTYPE html><html><head><title>Progress Summary - ${s.student.name}</title>
      <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1f2937}
      h1{font-size:24px;border-bottom:2px solid #059669;padding-bottom:8px}
      h2{font-size:16px;color:#059669;margin-top:24px}
      table{width:100%;border-collapse:collapse;margin:8px 0}
      th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px}
      th{background:#f9fafb;font-weight:600}
      .meta{color:#6b7280;font-size:13px}
      .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600}
      .on_track{background:#ecfdf5;color:#059669}.at_risk{background:#fef3c7;color:#d97706}
      .out_of_compliance{background:#fef2f2;color:#dc2626}.completed{background:#ecfdf5;color:#059669}
      @media print{body{margin:0}}</style></head><body>
      <h1>Progress Summary</h1>
      <p class="meta">${s.student.name} | Grade ${s.student.grade} | ${s.student.school || ""}</p>
      <p class="meta">Report Period: ${s.reportPeriod.startDate} to ${s.reportPeriod.endDate} (${s.reportPeriod.days} days)</p>
      <h2>IEP Goals</h2>
      <table><tr><th>Area</th><th>#</th><th>Goal</th><th>Status</th></tr>
      ${s.goals.map((g: any) => `<tr><td>${g.goalArea}</td><td>${g.goalNumber}</td><td>${g.annualGoal}</td><td>${g.status}</td></tr>`).join("")}
      </table>
      <h2>Service Delivery</h2>
      <table><tr><th>Service</th><th>Required</th><th>Delivered</th><th>%</th><th>Status</th></tr>
      ${s.serviceDelivery.map((d: any) => `<tr><td>${d.serviceType}</td><td>${d.requiredMinutes} min</td><td>${d.deliveredMinutes} min</td><td>${d.percentComplete}%</td><td><span class="badge ${d.riskStatus}">${d.riskStatus.replace(/_/g, " ")}</span></td></tr>`).join("")}
      </table>
      ${s.behaviorData.length > 0 ? `<h2>Behavior Data Trends</h2>
      <table><tr><th>Target</th><th>Type</th><th>Baseline</th><th>Goal</th><th>Avg</th><th>Recent</th><th>Trend</th></tr>
      ${s.behaviorData.map((b: any) => `<tr><td>${b.targetName}</td><td>${b.measurementType}</td><td>${b.baselineValue}</td><td>${b.goalValue}</td><td>${b.average ?? "\u2014"}</td><td>${b.recentAverage ?? "\u2014"}</td><td>${b.trend}</td></tr>`).join("")}
      </table>` : ""}
      ${s.programData.length > 0 ? `<h2>Program/Academic Progress</h2>
      <table><tr><th>Target</th><th>Mastery</th><th>Avg %</th><th>Recent %</th><th>Trend</th></tr>
      ${s.programData.map((p: any) => `<tr><td>${p.targetName}</td><td>${p.masteryCriterion}%</td><td>${p.averagePercent ?? "\u2014"}</td><td>${p.recentAveragePercent ?? "\u2014"}</td><td>${p.trend}</td></tr>`).join("")}
      </table>` : ""}
      <p class="meta" style="margin-top:24px">Generated ${new Date().toLocaleDateString()}</p>
      </body></html>`);
    w.document.close();
    w.print();
  }

  const studentName = s ? `${s.firstName} ${s.lastName}` : "";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-5 md:space-y-8">
      <div>
        <Link href="/students" className="text-emerald-700 text-sm flex items-center gap-1.5 mb-4 hover:text-emerald-800">
          <ArrowLeft className="w-4 h-4" /> All Students
        </Link>

        {s ? (
          <div className="flex items-center gap-3 md:gap-5 flex-wrap">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-700 text-base md:text-lg font-bold flex-shrink-0" aria-hidden="true">
              {s.firstName?.[0]}{s.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800 truncate">{s.firstName} {s.lastName}</h1>
              <p className="text-xs md:text-sm text-gray-400 mt-0.5 truncate">
                Grade {s.grade} · {s.disabilityCategory?.replace(/_/g, " ")} · Case Mgr #{s.caseManagerId}
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
              <Link href={`/students/${studentId}/iep`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors">
                <FileText className="w-3.5 h-3.5" /> IEP & Reports
              </Link>
              <Link href={`/students/${studentId}/iep-builder`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors">
                <FileText className="w-3.5 h-3.5" /> Build IEP Draft
              </Link>
              <button
                onClick={handleShareProgress}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" /> Share Progress
              </button>
              {role === "admin" && (
                s.status === "inactive" ? (
                  <button
                    onClick={() => setReactivateDialogOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" /> Reactivate
                  </button>
                ) : (
                  <button
                    onClick={() => setArchiveDialogOpen(true)}
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

        {(role === "admin" || role === "coordinator") && s && (
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
              openAddSvc={openAddSvc}
              openEditSvc={openEditSvc}
              setDeletingSvc={setDeletingSvc}
              openAssignDialog={openAssignDialog}
              handleRemoveAssignment={handleRemoveAssignment}
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
                      <Link href="/compensatory-finance" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                        Financial View
                      </Link>
                      <Link href={`/compensatory-services?studentId=${studentId}`} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
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
                            <Link href="/compensatory-finance?tab=rates" className="underline font-medium">
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
              emergencyContacts={emergencyContacts}
              emergencyContactsLoading={emergencyContactsLoading}
              openAddEc={openAddEc}
              openEditEc={openEditEc}
              setDeletingEc={setDeletingEc}
              medicalAlerts={medicalAlerts}
              medicalAlertsLoading={medicalAlertsLoading}
              openAddMa={openAddMa}
              openEditMa={openEditMa}
              setDeletingMa={setDeletingMa}
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
              enrollmentHistory={enrollmentHistory}
              enrollmentLoading={enrollmentLoading}
              role={role}
              openAddEvent={openAddEvent}
              openEditEvent={openEditEvent}
              setDeletingEvent={setDeletingEvent}
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
        addEventDialogOpen={addEventDialogOpen}
        setAddEventDialogOpen={setAddEventDialogOpen}
        addEventForm={addEventForm}
        setAddEventForm={setAddEventForm}
        addEventSaving={addEventSaving}
        handleAddEvent={handleAddEvent}
        editingEvent={editingEvent}
        setEditingEvent={setEditingEvent}
        deletingEvent={deletingEvent}
        setDeletingEvent={setDeletingEvent}
        handleDeleteEvent={handleDeleteEvent}
        ecDialogOpen={ecDialogOpen}
        setEcDialogOpen={setEcDialogOpen}
        editingEc={editingEc}
        setEditingEc={setEditingEc}
        ecForm={ecForm}
        setEcForm={setEcForm}
        ecSaving={ecSaving}
        handleSaveEc={handleSaveEc}
        deletingEc={deletingEc}
        setDeletingEc={setDeletingEc}
        handleDeleteEc={handleDeleteEc}
        maDialogOpen={maDialogOpen}
        setMaDialogOpen={setMaDialogOpen}
        editingMa={editingMa}
        setEditingMa={setEditingMa}
        maForm={maForm}
        setMaForm={setMaForm}
        maSaving={maSaving}
        handleSaveMa={handleSaveMa}
        deletingMa={deletingMa}
        setDeletingMa={setDeletingMa}
        handleDeleteMa={handleDeleteMa}
        archiveDialogOpen={archiveDialogOpen}
        setArchiveDialogOpen={setArchiveDialogOpen}
        archiveReason={archiveReason}
        setArchiveReason={setArchiveReason}
        archiveSaving={archiveSaving}
        handleArchive={handleArchive}
        reactivateDialogOpen={reactivateDialogOpen}
        setReactivateDialogOpen={setReactivateDialogOpen}
        reactivateSaving={reactivateSaving}
        handleReactivate={handleReactivate}
        svcDialogOpen={svcDialogOpen}
        setSvcDialogOpen={setSvcDialogOpen}
        editingSvc={editingSvc}
        svcForm={svcForm}
        setSvcForm={setSvcForm}
        svcSaving={svcSaving}
        handleSaveSvc={handleSaveSvc}
        serviceTypesList={serviceTypesList}
        staffList={staffList}
        deletingSvc={deletingSvc}
        handleDeleteSvc={handleDeleteSvc}
        assignDialogOpen={assignDialogOpen}
        setAssignDialogOpen={setAssignDialogOpen}
        assignForm={assignForm}
        setAssignForm={setAssignForm}
        assignSaving={assignSaving}
        handleAddAssignment={handleAddAssignment}
        showShareModal={showShareModal}
        setShowShareModal={setShowShareModal}
        shareDays={shareDays}
        setShareDays={setShareDays}
        shareLoading={shareLoading}
        shareSummary={shareSummary}
        shareLink={shareLink ?? ""}
        handleShareProgress={handleShareProgress}
        handlePrintSummary={handlePrintSummary}
        generateShareLink={generateShareLink}
        studentId={studentId}
      />
    </div>
  );
}
