import { useParams } from "wouter";
import { useGetStudent, useGetStudentMinuteProgress, useGetStudentSessions, useListServiceRequirements } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing, MiniProgressRing } from "@/components/ui/progress-ring";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle, XCircle, TrendingUp, TrendingDown, FileText, Activity, BookOpen, ArrowUpRight, ArrowDownRight, Minus, Shield, AlertTriangle, ChevronDown, ChevronUp, Clock, MapPin, Monitor, Target, Maximize2, Gift, Share2, Copy, ExternalLink, Plus, Pencil, Trash2, UserPlus, UserMinus, Sprout, Archive, ArchiveRestore, History, Phone, Mail, Stethoscope, ShieldAlert, Sparkles, CalendarDays, Bell } from "lucide-react";
import { toast } from "sonner";
import { InteractiveChart } from "@/components/ui/interactive-chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Area, AreaChart } from "recharts";
import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { RISK_CONFIG } from "@/lib/constants";
import BipManagement from "@/components/bip-management";
import StudentDocuments from "@/components/student-documents";
import StudentSnapshot from "@/components/student-snapshot";
import { StudentGuardians } from "@/components/student-guardians";
import StudentMessages from "@/components/student-messages";
import { useRole } from "@/lib/role-context";
import { AbaGraph, IoaSummary } from "@/components/aba-graph";
import { getStudentPhaseChanges, listBehaviorTargets, listProgramTargets, getBehaviorDataTrends, getProgramDataTrends, listDataSessions, getStudentProtectiveMeasures, getStudentMinutesTrend, getCompensatorySummaryByStudent, getDataSession, getSession, getStudentProgressSummary, createProgressShareLink, createServiceRequirement, updateServiceRequirement, deleteServiceRequirement, listServiceTypes, listStaff, createStaffAssignment, deleteStaffAssignment } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DIRECTION_COLORS = {
  decrease: { good: "#10b981", bad: "#ef4444", bg: "bg-emerald-50", text: "text-emerald-700" },
  increase: { good: "#059669", bad: "#f97316", bg: "bg-emerald-50", text: "text-emerald-800" },
};

const BIP_EDIT_ROLES = ["admin", "case_manager", "bcba"];

interface EmergencyContactRecord {
  id: number;
  studentId: number;
  firstName: string;
  lastName: string;
  relationship: string;
  phone: string;
  phoneSecondary: string | null;
  email: string | null;
  isAuthorizedForPickup: boolean;
  priority: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MedicalAlertRecord {
  id: number;
  studentId: number;
  alertType: string;
  description: string;
  severity: string;
  treatmentNotes: string | null;
  epiPenOnFile: boolean;
  notifyAllStaff: boolean;
  createdAt: string;
  updatedAt: string;
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
  const [dataLoading, setDataLoading] = useState(true);
  const [protectiveData, setProtectiveData] = useState<{ incidents: any[]; summary: any } | null>(null);
  const [compSummary, setCompSummary] = useState<any>(null);
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
  const [goalAbaView, setGoalAbaView] = useState<Record<number, boolean>>({});
  const [minutesExpanded, setMinutesExpanded] = useState(false);
  const [minutesTrend, setMinutesTrend] = useState<any[]>([]);
  const [minutesPhaseLines, setMinutesPhaseLines] = useState<{ id: string; date: string; label: string; color?: string }[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareSummary, setShareSummary] = useState<any>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareDays, setShareDays] = useState(30);
  const [phaseChangesByTarget, setPhaseChangesByTarget] = useState<Record<number, any[]>>({});

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

  useEffect(() => {
    listServiceTypes().then((r: any) => setServiceTypesList(Array.isArray(r) ? r : [])).catch(() => {});
    listStaff().then((r: any) => setStaffList(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (studentId) {
      authFetch(`/api/evaluations/student/${studentId}/re-eval-status`)
        .then((d: unknown) => setReEvalStatus(d as typeof reEvalStatus))
        .catch(() => {});
      authFetch(`/api/transitions/student/${studentId}`)
        .then((d: unknown) => setTransitionData(d as typeof transitionData))
        .catch(() => {});
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
    }
  }, [studentId]);

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
      setAddEventDialogOpen(false);
      setAddEventForm({ eventType: "note", eventDate: "", reasonCode: "", reason: "", notes: "" });
      const d = await authFetch(`/api/students/${studentId}/enrollment`).then((res: any) => res.json());
      setEnrollmentHistory(Array.isArray(d) ? d : []);
    } catch { toast.error("Failed to log event"); }
    setAddEventSaving(false);
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

  const isEditable = role === "admin" || role === "case_manager";

  const SECTION_NAV = [
    { id: "snapshot", label: "Snapshot" },
    { id: "overview", label: "Overview" },
    { id: "goals", label: "Goals" },
    { id: "services", label: "Services" },
    { id: "clinical", label: "Clinical" },
    { id: "sessions", label: "Sessions" },
    { id: "safety", label: "Safety" },
    { id: "messages", label: "Messages" },
    { id: "enrollment", label: "Enrollment" },
  ] as const;

  const [activeSection, setActiveSection] = useState("snapshot");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isClickScrolling = useRef(false);

  const setSectionRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    sectionRefs.current[id] = el;
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickScrolling.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );
    for (const sec of SECTION_NAV) {
      const el = sectionRefs.current[sec.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [student]);

  function scrollToSection(id: string) {
    const el = sectionRefs.current[id];
    if (!el) return;
    isClickScrolling.current = true;
    setActiveSection(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => { isClickScrolling.current = false; }, 800);
  }

  function loadPhaseChanges() {
    getStudentPhaseChanges(studentId).catch(() => {}).then(setPhaseChangesByTarget as any).catch(() => {});
  }

  useEffect(() => {
    if (isNaN(studentId)) return;
    setDataLoading(true);
    Promise.all([
      listBehaviorTargets(studentId).catch(() => []),
      listProgramTargets(studentId).catch(() => []),
      getBehaviorDataTrends(studentId).catch(() => []),
      getProgramDataTrends(studentId).catch(() => []),
      listDataSessions(studentId, { limit: 10 } as any).catch(() => []),
      getStudentProtectiveMeasures(studentId).catch(() => null),
      getStudentMinutesTrend(studentId).catch(() => []),
      getCompensatorySummaryByStudent(studentId).catch(() => null),
      getStudentPhaseChanges(studentId).catch(() => {}),
      authFetch(`/api/students/${studentId}/iep-goals/progress`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([bt, pt, btTrends, ptTrends, ds, pm, mt, cs, pcs, gp]) => {
      setBehaviorTargets(bt);
      setProgramTargets(pt);
      setBehaviorTrends(btTrends);
      setProgramTrends(ptTrends);
      setDataSessions(ds);
      setProtectiveData(pm as any);
      setMinutesTrend(mt);
      setCompSummary(cs);
      setPhaseChangesByTarget(pcs as any);
      setGoalProgress(gp);
      setDataLoading(false);
    }).catch(() => setDataLoading(false));
  }, [studentId]);

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

  function formatShortDate(d: string) {
    if (!d) return "";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
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
                {enrollmentDate && (() => {
                  const statusDate = s.status === "active"
                    ? enrollmentDate
                    : latestEnrollment?.eventDate ?? enrollmentDate;
                  const statusLabel = s.status === "active" ? "Enrolled"
                    : latestEnrollment?.eventType === "withdrawn" ? "Withdrawn"
                    : latestEnrollment?.eventType === "graduated" ? "Graduated"
                    : latestEnrollment?.eventType?.startsWith("transferred") ? "Transferred"
                    : "Inactive";
                  return (
                    <> · <CalendarDays className="w-3 h-3 inline -mt-0.5" /> {statusLabel} {new Date(statusDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</>
                  );
                })()}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
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
                <Sparkles className="w-3.5 h-3.5" /> Build IEP Draft
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
            {SECTION_NAV.map(sec => (
              <button
                key={sec.id}
                onClick={() => scrollToSection(sec.id)}
                className={`px-3 py-2 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeSection === sec.id
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                }`}
              >
                {sec.label}
              </button>
            ))}
          </div>
        </nav>
      )}

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

      <div id="snapshot" ref={setSectionRef("snapshot")} className="scroll-mt-16">
        <StudentSnapshot studentId={studentId} />
      </div>

      <div id="overview" ref={setSectionRef("overview")} className="scroll-mt-16 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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

      <div id="goals" ref={setSectionRef("goals")} className="scroll-mt-16">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Target className="w-4 h-4" />
                IEP Goal Progress
              </CardTitle>
              <span className="text-xs text-gray-400">{goalProgress.length} active goal{goalProgress.length !== 1 ? "s" : ""}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {dataLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : goalProgress.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No active IEP goals with linked data targets</p>
                <p className="text-xs mt-1">Goals will appear here once they are created with linked program or behavior targets</p>
              </div>
            ) : (
              goalProgress.map((g: any) => {
                const ratingColors: Record<string, { bg: string; text: string; label: string }> = {
                  mastered: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Mastered" },
                  sufficient_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "On Track" },
                  some_progress: { bg: "bg-amber-100", text: "text-amber-700", label: "Some Progress" },
                  insufficient_progress: { bg: "bg-red-100", text: "text-red-700", label: "Needs Attention" },
                  not_addressed: { bg: "bg-gray-100", text: "text-gray-500", label: "No Data" },
                };
                const rating = ratingColors[g.progressRating] || ratingColors.not_addressed;
                const trendIcon = g.trendDirection === "improving" ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> : g.trendDirection === "declining" ? <TrendingDown className="w-3.5 h-3.5 text-red-500" /> : <Minus className="w-3.5 h-3.5 text-gray-400" />;
                const trendLabel = g.trendDirection === "improving" ? "Improving" : g.trendDirection === "declining" ? "Declining" : "Stable";

                return (
                  <div key={g.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{g.goalArea}</span>
                          {g.goalNumber && <span className="text-xs text-gray-400">#{g.goalNumber}</span>}
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-2">{g.annualGoal}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rating.bg} ${rating.text}`}>{rating.label}</span>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          {trendIcon}
                          <span>{trendLabel}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{g.dataPointCount} data point{g.dataPointCount !== 1 ? "s" : ""}</span>
                      {g.latestValue !== null && <span>Latest: <strong className="text-gray-700">{g.measurementType === "program" ? `${Math.round(g.latestValue)}%` : g.latestValue}</strong></span>}
                      {g.baseline_value !== null && <span>Baseline: {g.measurementType === "program" ? `${Math.round(g.baseline_value)}%` : g.baseline_value}</span>}
                      {g.goal_value !== null && <span>Target: {g.measurementType === "program" ? `${g.goal_value}%` : g.goal_value}</span>}
                    </div>
                    {g.dataPoints.length > 1 && (
                      <div>
                        <div className="flex items-center justify-end mb-1">
                          <button
                            onClick={() => setGoalAbaView(prev => ({ ...prev, [`goal-${g.id}`]: !prev[`goal-${g.id}`] }))}
                            className={`text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
                              goalAbaView[`goal-${g.id}`]
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                          >
                            {goalAbaView[`goal-${g.id}`] ? "ABA View" : "Standard View"} — click to switch
                          </button>
                        </div>
                        {goalAbaView[`goal-${g.id}`] && g.linkedTarget?.type === "behavior" ? (
                          <AbaGraph
                            target={behaviorTargets.find((bt: any) => bt.id === g.behaviorTargetId) || {
                              id: g.behaviorTargetId,
                              name: g.linkedTarget?.name || g.goalArea,
                              measurementType: g.linkedTarget?.measurementType || "frequency",
                              targetDirection: g.targetDirection,
                              baselineValue: g.baseline_value != null ? String(g.baseline_value) : null,
                              goalValue: g.goal_value != null ? String(g.goal_value) : null,
                            }}
                            data={behaviorTrends}
                            phaseChanges={phaseChangesByTarget[g.behaviorTargetId] || []}
                            onPhaseChangesUpdate={loadPhaseChanges}
                          />
                        ) : goalAbaView[`goal-${g.id}`] && g.linkedTarget?.type === "program" ? (
                          <AbaGraph
                            target={{
                              id: g.programTargetId,
                              name: g.linkedTarget?.name || g.goalArea,
                              measurementType: "percentage",
                              targetDirection: "increase",
                              baselineValue: g.baseline_value != null ? String(g.baseline_value) : null,
                              goalValue: g.goal_value != null ? String(g.goal_value) : null,
                            }}
                            data={programTrends.filter((d: any) => d.programTargetId === g.programTargetId).map((d: any) => ({
                              ...d,
                              behaviorTargetId: g.programTargetId,
                              value: d.percentCorrect ?? "0",
                              targetName: d.targetName,
                              measurementType: "percentage",
                            }))}
                            phaseChanges={[]}
                            onPhaseChangesUpdate={() => {}}
                          />
                        ) : (
                          <InteractiveChart
                            data={g.dataPoints}
                            color={g.progressRating === "mastered" ? "#10b981" : g.progressRating === "insufficient_progress" ? "#ef4444" : "#3b82f6"}
                            gradientId={`goal-${g.id}`}
                            yLabel={g.yLabel}
                            baselineLine={g.baseline_value}
                            goalLine={g.goal_value}
                            targetDirection={g.targetDirection}
                            valueFormatter={(v: number) => g.measurementType === "program" ? `${Math.round(v)}%` : String(Math.round(v * 10) / 10)}
                          />
                        )}
                      </div>
                    )}
                    {g.dataPoints.length === 1 && (
                      <div className="text-xs text-gray-400 italic">Only 1 data point collected — chart will appear after more data is recorded</div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div id="services" ref={setSectionRef("services")} className="scroll-mt-16 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600">Minutes by Service</CardTitle>
              <button
                onClick={() => setMinutesExpanded(!minutesExpanded)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                title={minutesExpanded ? "Collapse" : "Expand chart"}
              >
                {minutesExpanded ? <ChevronUp className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={minutesExpanded ? Math.max(300, chartData.length * 64) : Math.max(200, chartData.length * 48)}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
                    formatter={(val: any, name: string) => [val + " min", name === "delivered" ? "Delivered" : "Required"]}
                  />
                  <Bar dataKey="required" fill="#e5e7eb" radius={[0, 4, 4, 0]} barSize={minutesExpanded ? 24 : 18} name="Required" />
                  <Bar dataKey="delivered" radius={[0, 4, 4, 0]} barSize={minutesExpanded ? 24 : 18} name="Delivered">
                    {chartData.map((entry: any, idx: number) => (
                      <Cell key={idx} fill={RISK_CONFIG[entry.riskStatus]?.ringColor ?? "#059669"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="w-full h-48" />
            )}
            {minutesExpanded && chartData.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
                {chartData.map((entry: any, idx: number) => {
                  const rCfg = RISK_CONFIG[entry.riskStatus] ?? RISK_CONFIG.on_track;
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
                      <span className="font-medium text-gray-700">{entry.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500">{entry.delivered} / {entry.required} min</span>
                        <span className="font-bold text-gray-700">{entry.pct}%</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${rCfg.bg} ${rCfg.color}`}>{rCfg.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {minutesExpanded && minutesTrend.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">Minutes Delivered Over Time</p>
                <InteractiveChart
                  data={minutesTrend}
                  color="#059669"
                  gradientId="grad-minutes-trend"
                  title="Session Minutes"
                  yLabel="Minutes"
                  valueFormatter={(v) => `${v} min`}
                  phaseLines={minutesPhaseLines}
                  onPhaseLinesChange={setMinutesPhaseLines}
                  initialExpanded
                  hideCollapse
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600">Service Requirements</CardTitle>
              {isEditable && (
                <button onClick={openAddSvc} className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {progressList.length > 0 ? progressList.map((p: any, idx: number) => {
              const pct = p.requiredMinutes > 0 ? Math.round((p.deliveredMinutes / p.requiredMinutes) * 100) : 0;
              const rCfg = RISK_CONFIG[p.riskStatus] ?? RISK_CONFIG.on_track;
              const svcReq = s?.serviceRequirements?.find((r: any) => r.id === p.serviceRequirementId);
              return (
                <div key={p.serviceRequirementId ?? idx} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50/50 group">
                  <MiniProgressRing value={pct} size={36} strokeWidth={3.5} color={rCfg.ringColor} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-700 truncate">{p.serviceTypeName}</p>
                    <p className="text-[11px] text-gray-400">
                      {p.deliveredMinutes} / {p.requiredMinutes} min · {p.minutesPerWeek} min/wk
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-700">{pct}%</p>
                    <p className={`text-[10px] font-medium ${rCfg.color}`}>{rCfg.label}</p>
                  </div>
                  {isEditable && svcReq && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => openEditSvc(svcReq)} className="p-1 hover:bg-gray-200 rounded" title="Edit">
                        <Pencil className="w-3 h-3 text-gray-400" />
                      </button>
                      <button onClick={() => setDeletingSvc(svcReq)} className="p-1 hover:bg-red-100 rounded" title="Delete">
                        <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  )}
                </div>
              );
            }) : (
              <div className="text-center py-6">
                <p className="text-sm text-gray-400">No service requirements</p>
                {isEditable && (
                  <button onClick={openAddSvc} className="mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-800">
                    + Add first service requirement
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {s?.assignedStaff && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600">Assigned Staff</CardTitle>
              {isEditable && (
                <button onClick={() => { setAssignForm({ staffId: "", assignmentType: "service_provider", startDate: "", endDate: "", notes: "" }); setAssignDialogOpen(true); }} className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors">
                  <UserPlus className="w-3.5 h-3.5" /> Assign
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {(s.assignedStaff as any[]).length > 0 ? (
              <div className="space-y-2">
                {(s.assignedStaff as any[]).map((a: any) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50/50 group">
                    <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-600 flex-shrink-0">
                      {a.staffName?.split(" ").map((n: string) => n[0]).join("") || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-700">{a.staffName || `Staff #${a.staffId}`}</p>
                      <p className="text-[11px] text-gray-400">
                        {a.assignmentType?.replace(/_/g, " ")}
                        {a.staffRole ? ` · ${a.staffRole}` : ""}
                        {a.startDate ? ` · from ${a.startDate}` : ""}
                      </p>
                    </div>
                    {isEditable && (
                      <button onClick={() => handleRemoveAssignment(a.id)} className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-all" title="Remove assignment">
                        <UserMinus className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-400">No staff assigned</p>
                {isEditable && (
                  <button onClick={() => { setAssignForm({ staffId: "", assignmentType: "service_provider", startDate: "", endDate: "", notes: "" }); setAssignDialogOpen(true); }} className="mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-800">
                    + Assign first provider
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {compSummary && compSummary.counts?.total > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-600" />
                Compensatory Services
              </CardTitle>
              <Link href="/compensatory-services" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                View All
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
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

      <div id="clinical" ref={setSectionRef("clinical")} className="scroll-mt-16" />
      {(hasNonIepData || dataLoading) && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                Non-IEP Data Tracking
              </CardTitle>
              <span className="text-xs text-gray-400">
                {nonIepBehaviorTargets.length + nonIepProgramTargets.length} target{(nonIepBehaviorTargets.length + nonIepProgramTargets.length) !== 1 ? "s" : ""} not linked to IEP goals
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {dataLoading ? (
              <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="w-full h-24" />)}</div>
            ) : (
              <div className="space-y-4">
                {nonIepBehaviorTargets.map((bt: any) => {
                  const trendData = getBehaviorTrendData(bt.id);
                  const latest = trendData[trendData.length - 1]?.value;
                  const baseline = parseFloat(bt.baselineValue) || 0;
                  const goal = parseFloat(bt.goalValue) || 0;
                  const direction = getTrendDirection(trendData);
                  const dirColors = DIRECTION_COLORS[bt.targetDirection as keyof typeof DIRECTION_COLORS] || DIRECTION_COLORS.decrease;
                  const isGoodTrend = (bt.targetDirection === "decrease" && direction === "down") ||
                                       (bt.targetDirection === "increase" && direction === "up");
                  const trendColor = direction === "flat" ? "#9ca3af" : isGoodTrend ? dirColors.good : dirColors.bad;
                  const progressPct = bt.targetDirection === "decrease"
                    ? baseline > goal ? Math.round(((baseline - (latest ?? baseline)) / (baseline - goal)) * 100) : 0
                    : goal > baseline ? Math.round((((latest ?? baseline) - baseline) / (goal - baseline)) * 100) : 0;
                  const clampedPct = Math.max(0, Math.min(100, progressPct));
                  const showAba = goalAbaView[`beh-${bt.id}`];

                  return (
                    <div key={`beh-${bt.id}`} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Behavior</span>
                            <p className="text-[13px] font-semibold text-gray-700">{bt.name}</p>
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              bt.targetDirection === "decrease" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                            }`}>
                              {bt.targetDirection === "decrease" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                              {bt.targetDirection}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {bt.measurementType} · Baseline: {bt.baselineValue} · Goal: {bt.goalValue}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <div className="flex items-center gap-1">
                            {direction === "up" ? <ArrowUpRight className="w-3.5 h-3.5" style={{ color: trendColor }} /> :
                             direction === "down" ? <ArrowDownRight className="w-3.5 h-3.5" style={{ color: trendColor }} /> :
                             <Minus className="w-3.5 h-3.5 text-gray-400" />}
                            <span className="text-lg font-bold text-gray-800">{latest != null ? latest : "\u2014"}</span>
                          </div>
                          <p className="text-[10px] text-gray-400">latest</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mb-2">
                        <div className="flex-1">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${clampedPct}%`, backgroundColor: clampedPct >= 80 ? "#10b981" : clampedPct >= 50 ? "#f59e0b" : "#ef4444" }}
                            />
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">{clampedPct}% toward goal</p>
                        </div>
                      </div>
                      {trendData.length > 1 && (
                        <div>
                          <div className="flex items-center justify-end mb-1">
                            <button
                              onClick={() => setGoalAbaView(prev => ({ ...prev, [`beh-${bt.id}`]: !prev[`beh-${bt.id}`] }))}
                              className={`text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
                                showAba ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                              }`}
                            >
                              {showAba ? "ABA View" : "Standard View"} — click to switch
                            </button>
                          </div>
                          {showAba ? (
                            <AbaGraph
                              target={bt}
                              data={behaviorTrends}
                              phaseChanges={phaseChangesByTarget[bt.id] || []}
                              onPhaseChangesUpdate={loadPhaseChanges}
                            />
                          ) : (
                            <InteractiveChart
                              data={trendData}
                              color={trendColor}
                              gradientId={`grad-nonIep-beh-${bt.id}`}
                              title={bt.name}
                              yLabel={bt.measurementType}
                              baselineLine={baseline}
                              goalLine={goal}
                              targetDirection={bt.targetDirection}
                              phaseLines={behaviorPhaseLines[bt.id] || []}
                              onPhaseLinesChange={(lines) => setBehaviorPhaseLines(prev => ({ ...prev, [bt.id]: lines }))}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {nonIepProgramTargets.map((pt: any) => {
                  const trendData = getProgramTrendData(pt.id);
                  const latest = trendData[trendData.length - 1]?.value;
                  const direction = getTrendDirection(trendData);
                  const masteryPct = pt.masteryCriterionPercent || 80;
                  const isGoodTrend = direction === "up";
                  const trendColor = direction === "flat" ? "#9ca3af" : isGoodTrend ? "#059669" : "#f97316";
                  const atMastery = latest != null && latest >= masteryPct;
                  const showAba = goalAbaView[`prog-${pt.id}`];

                  return (
                    <div key={`prog-${pt.id}`} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">Program</span>
                            <p className="text-[13px] font-semibold text-gray-700">{pt.name}</p>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                              {pt.domain || pt.programType?.replace(/_/g, " ")}
                            </span>
                            {pt.currentPromptLevel && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                {pt.currentPromptLevel}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {pt.targetCriterion || `${masteryPct}% mastery`}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <div className="flex items-center gap-1">
                            {direction === "up" ? <ArrowUpRight className="w-3.5 h-3.5" style={{ color: trendColor }} /> :
                             direction === "down" ? <ArrowDownRight className="w-3.5 h-3.5" style={{ color: trendColor }} /> :
                             <Minus className="w-3.5 h-3.5 text-gray-400" />}
                            <span className="text-lg font-bold text-gray-800">{latest != null ? `${Math.round(latest)}%` : "\u2014"}</span>
                          </div>
                          <p className="text-[10px] text-gray-400">latest accuracy</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mb-2">
                        <div className="flex-1">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, latest ?? 0)}%`, backgroundColor: atMastery ? "#10b981" : (latest ?? 0) >= 60 ? "#059669" : "#f97316" }}
                            />
                            <div
                              className="absolute top-0 h-full w-0.5 bg-gray-400/60"
                              style={{ left: `${masteryPct}%` }}
                              title={`Mastery: ${masteryPct}%`}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-[10px] text-gray-400">{atMastery ? "At mastery criterion" : `${masteryPct}% mastery criterion`}</p>
                            {atMastery && <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> Mastered</span>}
                          </div>
                        </div>
                      </div>
                      {trendData.length > 1 && (
                        <div>
                          <div className="flex items-center justify-end mb-1">
                            <button
                              onClick={() => setGoalAbaView(prev => ({ ...prev, [`prog-${pt.id}`]: !prev[`prog-${pt.id}`] }))}
                              className={`text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
                                showAba ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                              }`}
                            >
                              {showAba ? "ABA View" : "Standard View"} — click to switch
                            </button>
                          </div>
                          {showAba ? (
                            <AbaGraph
                              target={{
                                id: pt.id,
                                name: pt.name,
                                measurementType: "percentage",
                                targetDirection: "increase",
                                baselineValue: null,
                                goalValue: String(masteryPct),
                              }}
                              data={programTrends.filter((d: any) => d.programTargetId === pt.id).map((d: any) => ({
                                ...d,
                                behaviorTargetId: pt.id,
                                value: d.percentCorrect ?? "0",
                                targetName: d.targetName,
                                measurementType: "percentage",
                              }))}
                              phaseChanges={[]}
                              onPhaseChangesUpdate={() => {}}
                            />
                          ) : (
                            <InteractiveChart
                              data={trendData}
                              color={trendColor}
                              gradientId={`grad-nonIep-prog-${pt.id}`}
                              title={pt.name}
                              yLabel="Accuracy"
                              masteryLine={masteryPct}
                              targetDirection="increase"
                              valueFormatter={(v) => `${Math.round(v)}%`}
                              phaseLines={programPhaseLines[pt.id] || []}
                              onPhaseLinesChange={(lines) => setProgramPhaseLines(prev => ({ ...prev, [pt.id]: lines }))}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

      <div id="sessions" ref={setSectionRef("sessions")} className="scroll-mt-16" />
      {(dataSessions.length > 0 || dataLoading) && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Recent Data Sessions</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {dataLoading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="w-full h-12" />)}</div>
            ) : dataSessions.length > 0 ? (
              <div className="space-y-1">
                {dataSessions.map((ds: any) => {
                  const isExpanded = expandedDataSessionId === ds.id;
                  const detail = isExpanded ? expandedDataDetail : null;
                  return (
                    <Fragment key={ds.id}>
                      <button
                        onClick={() => toggleDataSession(ds.id)}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50/50 hover:bg-gray-100/50 transition-colors text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-gray-700">{formatDate(ds.sessionDate)}</p>
                          <p className="text-[11px] text-gray-400">
                            {ds.staffName || "Staff"} · {ds.startTime && ds.endTime ? `${formatTime(ds.startTime)}\u2013${formatTime(ds.endTime)}` : "No time recorded"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            <Activity className="w-3 h-3" /> Data
                          </span>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="ml-3 mr-3 mb-2 p-4 bg-white border border-gray-200 rounded-lg space-y-4">
                          {expandedDataLoading ? (
                            <div className="flex items-center gap-2 text-sm text-gray-400"><Clock className="w-4 h-4 animate-spin" /> Loading details...</div>
                          ) : detail ? (
                            <>
                              {detail.notes && (
                                <div>
                                  <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Session Notes</h5>
                                  <p className="text-[13px] text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 leading-relaxed">{detail.notes}</p>
                                </div>
                              )}
                              {detail.behaviorData?.length > 0 && (
                                <div>
                                  <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <Activity className="w-3.5 h-3.5 text-red-500" /> Behavior Data ({detail.behaviorData.length})
                                  </h5>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {detail.behaviorData.map((bd: any) => (
                                      <div key={bd.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[12px] font-medium text-gray-700">{bd.targetName || `Target #${bd.behaviorTargetId}`}</span>
                                          <span className="text-[13px] font-bold text-gray-800">{bd.value}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                                          <span>{bd.measurementType}</span>
                                          {bd.intervalCount != null && <span>· {bd.intervalsWith}/{bd.intervalCount} intervals</span>}
                                          {bd.hourBlock && <span>· Hour: {bd.hourBlock}</span>}
                                        </div>
                                        {bd.notes && <p className="text-[11px] text-gray-500 mt-1 italic">{bd.notes}</p>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {detail.programData?.length > 0 && (
                                <div>
                                  <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <BookOpen className="w-3.5 h-3.5 text-emerald-600" /> Program Data ({detail.programData.length})
                                  </h5>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {detail.programData.map((pd: any) => (
                                      <div key={pd.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[12px] font-medium text-gray-700">{pd.targetName || `Program #${pd.programTargetId}`}</span>
                                          <span className="text-[13px] font-bold text-gray-800">
                                            {pd.percentCorrect != null ? `${Math.round(parseFloat(pd.percentCorrect))}%` : "\u2014"}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                                          {pd.trialsCorrect != null && pd.trialsTotal != null && <span>{pd.trialsCorrect}/{pd.trialsTotal} trials</span>}
                                          {pd.promptLevelUsed && <span>· {pd.promptLevelUsed.replace(/_/g, " ")}</span>}
                                          {pd.stepNumber != null && <span>· Step {pd.stepNumber}</span>}
                                          {pd.programType && <span>· {pd.programType.replace(/_/g, " ")}</span>}
                                        </div>
                                        {pd.notes && <p className="text-[11px] text-gray-500 mt-1 italic">{pd.notes}</p>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {(!detail.behaviorData?.length && !detail.programData?.length && !detail.notes) && (
                                <p className="text-[12px] text-gray-400 italic">No detailed data recorded for this session.</p>
                              )}
                            </>
                          ) : (
                            <p className="text-[12px] text-gray-400 italic">Failed to load session details.</p>
                          )}
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-gray-400">No data sessions recorded yet.</div>
            )}
          </CardContent>
        </Card>
      )}

      <div id="safety" ref={setSectionRef("safety")} className="scroll-mt-16" />
      {protectiveData && protectiveData.incidents.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-500" />
                Protective Measures
              </CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {protectiveData.summary.totalIncidents} incident{protectiveData.summary.totalIncidents !== 1 ? "s" : ""}
                  {protectiveData.summary.thisMonth > 0 && (
                    <span className="text-red-600 font-semibold ml-1">({protectiveData.summary.thisMonth} this month)</span>
                  )}
                </span>
                <Link href="/protective-measures" className="text-xs text-emerald-700 hover:text-emerald-800 font-medium">View All</Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {protectiveData.summary.pendingReview > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-800 font-medium">{protectiveData.summary.pendingReview} incident{protectiveData.summary.pendingReview !== 1 ? "s" : ""} pending admin review</p>
              </div>
            )}
            <div className="space-y-2">
              {protectiveData.incidents.slice(0, 5).map((inc: any) => (
                <div key={inc.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50/50 hover:bg-gray-100/50 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${inc.incidentType === "physical_restraint" ? "bg-red-50" : inc.incidentType === "seclusion" ? "bg-amber-50" : "bg-gray-100"}`}>
                    <Shield className={`w-4 h-4 ${inc.incidentType === "physical_restraint" ? "text-red-600" : inc.incidentType === "seclusion" ? "text-amber-600" : "text-gray-600"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${inc.incidentType === "physical_restraint" ? "bg-red-50 text-red-700" : inc.incidentType === "seclusion" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-700"}`}>
                        {inc.incidentType === "physical_restraint" ? "Restraint" : inc.incidentType === "seclusion" ? "Seclusion" : "Time-Out"}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${inc.status === "pending_review" ? "bg-amber-100 text-amber-700" : inc.status === "reviewed" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                        {inc.status === "pending_review" ? "Pending" : inc.status === "reviewed" ? "Reviewed" : "Closed"}
                      </span>
                      {(inc.studentInjury || inc.staffInjury) && <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Injury reported" />}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">{inc.behaviorDescription}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-gray-700">{formatDate(inc.incidentDate)}</p>
                    <p className="text-[10px] text-gray-400">{inc.durationMinutes ? `${inc.durationMinutes} min` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-gray-600">Recent Service Sessions</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {recentSessions.length > 0 ? (
            <div className="space-y-1">
              {recentSessions.map((se: any) => {
                const isExpanded = expandedServiceSessionId === se.id;
                const detail = isExpanded ? expandedServiceDetail : null;
                return (
                  <Fragment key={se.id}>
                    <button
                      onClick={() => toggleServiceSession(se.id)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50/50 hover:bg-gray-100/50 transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-gray-700 truncate">{se.serviceTypeName ?? "\u2014"}</p>
                        <p className="text-[11px] text-gray-400">{formatDate(se.sessionDate)} · {se.durationMinutes ?? "\u2014"} min · {se.staffName ?? "\u2014"}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          se.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                          se.status === "missed" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                        }`}>
                          {se.status === "completed" ? <CheckCircle className="w-3 h-3" /> : se.status === "missed" ? <XCircle className="w-3 h-3" /> : null}
                          {se.isMakeup ? "Makeup" : se.status}
                        </span>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="ml-3 mr-3 mb-2 p-4 bg-white border border-gray-200 rounded-lg space-y-4">
                        {expandedServiceLoading ? (
                          <div className="flex items-center gap-2 text-sm text-gray-400"><Clock className="w-4 h-4 animate-spin" /> Loading details...</div>
                        ) : detail ? (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Session Info</h5>
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-[11px] text-gray-400 min-w-[60px]">Duration</span>
                                    <span className="text-[13px] text-gray-700">{detail.durationMinutes} min</span>
                                  </div>
                                  {(detail.startTime || detail.endTime) && (
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                                      <span className="text-[11px] text-gray-400 min-w-[60px]">Time</span>
                                      <span className="text-[13px] text-gray-700">{formatTime(detail.startTime) || "\u2014"} — {formatTime(detail.endTime) || "\u2014"}</span>
                                    </div>
                                  )}
                                  {detail.location && (
                                    <div className="flex items-center gap-2">
                                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                      <span className="text-[11px] text-gray-400 min-w-[60px]">Location</span>
                                      <span className="text-[13px] text-gray-700">{detail.location}</span>
                                    </div>
                                  )}
                                  {detail.deliveryMode && (
                                    <div className="flex items-center gap-2">
                                      <Monitor className="w-3.5 h-3.5 text-gray-400" />
                                      <span className="text-[11px] text-gray-400 min-w-[60px]">Mode</span>
                                      <span className="text-[13px] text-gray-700">{detail.deliveryMode === "in_person" ? "In Person" : detail.deliveryMode === "remote" ? "Remote/Telehealth" : detail.deliveryMode}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="md:col-span-2 space-y-2">
                                <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Session Notes</h5>
                                {detail.notes ? (
                                  <p className="text-[13px] text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 leading-relaxed">{detail.notes}</p>
                                ) : (
                                  <p className="text-[11px] text-gray-400 italic">No session notes recorded.</p>
                                )}
                                {detail.missedReasonLabel && (
                                  <div className="flex items-center gap-1.5 text-[12px] text-red-600">
                                    <XCircle className="w-3.5 h-3.5" /> Missed: {detail.missedReasonLabel}
                                  </div>
                                )}
                              </div>
                            </div>
                            {detail.linkedGoals?.length > 0 && (
                              <div className="space-y-2">
                                <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                  <Target className="w-3.5 h-3.5 text-emerald-600" /> IEP Goals Addressed ({detail.linkedGoals.length})
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {detail.linkedGoals.map((g: any) => (
                                    <div key={g.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                                      <div className="flex items-start gap-2">
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 flex-shrink-0 mt-0.5">{g.goalArea}</span>
                                        <p className="text-[12px] text-gray-700 leading-snug line-clamp-2">{g.annualGoal}</p>
                                      </div>
                                      {g.targetCriterion && <p className="text-[10px] text-gray-400 mt-1 ml-0.5">Target: {g.targetCriterion}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-[12px] text-gray-400 italic">Failed to load session details.</p>
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-gray-400">No sessions recorded yet.</div>
          )}
        </CardContent>
      </Card>

      {transitionData?.isTransitionAge && (
        <Card className="border-gray-200/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Sprout className="w-4 h-4 text-emerald-600" /> Transition Planning
                <span className="text-[10px] font-normal text-gray-400 ml-1">Age {transitionData.age}+</span>
              </CardTitle>
              <Link href="/transitions" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800">
                Manage Transitions →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {transitionData.plans.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-[12px] text-amber-600 font-medium">No transition plan on file</p>
                <p className="text-[11px] text-gray-400 mt-1">IDEA requires transition planning for students aged 14+</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transitionData.plans.slice(0, 2).map(plan => (
                  <div key={plan.id} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] font-medium text-gray-800">Plan dated {plan.planDate}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${plan.status === "active" ? "bg-emerald-50 text-emerald-700" : plan.status === "draft" ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-700"}`}>{plan.status}</span>
                    </div>
                    {plan.goals && plan.goals.length > 0 && (
                      <div className="space-y-1">
                        {plan.goals.slice(0, 3).map(g => (
                          <div key={g.id} className="flex items-center gap-2 text-[11px]">
                            <span className={`w-1.5 h-1.5 rounded-full ${g.domain === "education" ? "bg-emerald-400" : g.domain === "employment" ? "bg-blue-400" : "bg-purple-400"}`} />
                            <span className="text-gray-600 truncate">{g.goalStatement}</span>
                          </div>
                        ))}
                        {plan.goals.length > 3 && <p className="text-[10px] text-gray-400 ml-3.5">+{plan.goals.length - 3} more</p>}
                      </div>
                    )}
                    {plan.agencyReferrals && plan.agencyReferrals.length > 0 && (
                      <p className="text-[11px] text-gray-400 mt-1">{plan.agencyReferrals.length} agency referral{plan.agencyReferrals.length !== 1 ? "s" : ""}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <BipManagement studentId={studentId} readOnly={bipReadOnly} />

      <StudentDocuments studentId={studentId} />

      <StudentGuardians studentId={studentId} isEditable={isEditable} />

      {/* Emergency Contacts */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-600" />
              <CardTitle className="text-sm font-semibold text-gray-600">Emergency Contacts</CardTitle>
            </div>
            {isEditable && (
              <button onClick={openAddEc} className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Contact
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {emergencyContactsLoading ? (
            <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : emergencyContacts.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No emergency contacts on file.</p>
          ) : (
            <div className="space-y-2">
              {emergencyContacts.map((contact: EmergencyContactRecord, idx: number) => (
                <div key={contact.id} className={`flex items-start gap-3 p-3 rounded-lg border ${idx === 0 ? "border-emerald-200 bg-emerald-50/50" : "border-gray-100 bg-white"}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${idx === 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    <span className="text-[12px] font-bold">{contact.firstName?.[0]}{contact.lastName?.[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-gray-800">{contact.firstName} {contact.lastName}</span>
                      <span className="text-[11px] text-gray-500 capitalize">{contact.relationship}</span>
                      {contact.isAuthorizedForPickup && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-medium rounded">Authorized Pickup</span>
                      )}
                      {idx === 0 && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded">Primary</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-[12px] text-emerald-700 hover:underline">
                        <Phone className="w-3 h-3" />{contact.phone}
                      </a>
                      {contact.phoneSecondary && (
                        <a href={`tel:${contact.phoneSecondary}`} className="flex items-center gap-1 text-[12px] text-gray-500 hover:underline">
                          <Phone className="w-3 h-3" />{contact.phoneSecondary}
                        </a>
                      )}
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-[12px] text-gray-500 hover:underline">
                          <Mail className="w-3 h-3" />{contact.email}
                        </a>
                      )}
                    </div>
                    {contact.notes && <p className="text-[11px] text-gray-400 mt-0.5">{contact.notes}</p>}
                  </div>
                  {isEditable && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEditEc(contact)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeletingEc(contact)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Medical Alerts */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-red-500" />
              <CardTitle className="text-sm font-semibold text-gray-600">Medical Alerts</CardTitle>
              {medicalAlerts.some((a: MedicalAlertRecord) => a.severity === "life_threatening") && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-md uppercase tracking-wide">
                  <ShieldAlert className="w-3 h-3" /> Life-Threatening
                </span>
              )}
            </div>
            {isEditable && (
              <button onClick={openAddMa} className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Alert
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {medicalAlertsLoading ? (
            <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : medicalAlerts.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No medical alerts on file.</p>
          ) : (
            <div className="space-y-2">
              {medicalAlerts.map((alert: MedicalAlertRecord) => {
                const severityConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
                  mild: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-100", label: "Mild" },
                  moderate: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Moderate" },
                  severe: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", label: "Severe" },
                  life_threatening: { bg: "bg-red-50", text: "text-red-700", border: "border-red-300", label: "Life-Threatening" },
                };
                const alertTypeLabels: Record<string, string> = {
                  allergy: "Allergy", medication: "Medication", condition: "Condition", seizure: "Seizure", other: "Other",
                };
                const sc = severityConfig[alert.severity] ?? { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-100", label: alert.severity };
                return (
                  <div key={alert.id} className={`p-3 rounded-lg border ${sc.border} ${sc.bg}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wide ${sc.bg} ${sc.text} border ${sc.border}`}>{sc.label}</span>
                          <span className="text-[11px] font-medium text-gray-600">{alertTypeLabels[alert.alertType] ?? alert.alertType}</span>
                          {alert.epiPenOnFile && <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-medium rounded">EpiPen On File</span>}
                          {alert.notifyAllStaff && <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded"><ShieldAlert className="w-3 h-3" /> Notify All Staff</span>}
                        </div>
                        <p className="text-[13px] font-semibold text-gray-800 mt-1">{alert.description}</p>
                        {alert.treatmentNotes && <p className="text-[12px] text-gray-600 mt-0.5">{alert.treatmentNotes}</p>}
                      </div>
                      {isEditable && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => openEditMa(alert)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/70 rounded transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeletingMa(alert)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-100 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div id="messages" ref={setSectionRef("messages")} className="scroll-mt-16" />
      <StudentMessages
        studentId={studentId}
        studentName={student ? `${student.firstName} ${student.lastName}` : ""}
        guardians={messageGuardians}
      />

      <div id="enrollment" ref={setSectionRef("enrollment")} className="scroll-mt-16" />
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-600" />
              <CardTitle className="text-sm font-semibold text-gray-600">Enrollment History</CardTitle>
            </div>
            {(role === "admin" || role === "case_manager") && (
              <button
                onClick={() => { setAddEventForm({ eventType: "note", eventDate: new Date().toISOString().slice(0, 10), reasonCode: "", reason: "", notes: "" }); setAddEventDialogOpen(true); }}
                className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Event
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {enrollmentLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : enrollmentHistory.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No enrollment events recorded.</p>
          ) : (
            <div className="relative pl-5">
              <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-100" />
              <div className="space-y-4">
                {enrollmentHistory.map((ev: any, idx: number) => {
                  const typeConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
                    enrolled: { label: "Enrolled", color: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" },
                    reactivated: { label: "Reactivated", color: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-400" },
                    withdrawn: { label: "Withdrawn", color: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500" },
                    transferred_in: { label: "Transferred In", color: "text-blue-700", bg: "bg-blue-50", dot: "bg-blue-500" },
                    transferred_out: { label: "Transferred Out", color: "text-sky-700", bg: "bg-sky-50", dot: "bg-sky-400" },
                    program_change: { label: "Program Change", color: "text-indigo-700", bg: "bg-indigo-50", dot: "bg-indigo-400" },
                    graduated: { label: "Graduated", color: "text-purple-700", bg: "bg-purple-50", dot: "bg-purple-500" },
                    suspended: { label: "Suspended", color: "text-red-700", bg: "bg-red-50", dot: "bg-red-500" },
                    leave_of_absence: { label: "Leave of Absence", color: "text-orange-700", bg: "bg-orange-50", dot: "bg-orange-400" },
                    note: { label: "Note", color: "text-gray-700", bg: "bg-gray-50", dot: "bg-gray-400" },
                  };
                  const cfg = typeConfig[ev.eventType] ?? { label: ev.eventType.replace(/_/g, " "), color: "text-gray-700", bg: "bg-gray-50", dot: "bg-gray-400" };
                  return (
                    <div key={ev.id ?? idx} className="relative flex items-start gap-3">
                      <div className={`absolute -left-3.5 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${cfg.dot} flex-shrink-0`} />
                      <div className={`flex-1 rounded-lg p-3 ${cfg.bg}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className={`text-[12px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                          <span className="text-[11px] text-gray-400">{ev.eventDate}</span>
                        </div>
                        {ev.reasonCode && <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">{ev.reasonCode}</p>}
                        {ev.reason && <p className="text-[12px] text-gray-600 mt-0.5">{ev.reason}</p>}
                        {ev.notes && <p className="text-[11px] text-gray-500 mt-0.5">{ev.notes}</p>}
                        {(ev.performedByFirst || ev.performedByLast) && (
                          <p className="text-[11px] text-gray-400 mt-0.5">By: {ev.performedByFirst} {ev.performedByLast}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Enrollment Event Dialog */}
      <Dialog open={addEventDialogOpen} onOpenChange={v => { if (!v) setAddEventDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800 flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-600" /> Log Enrollment Event
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Event Type</Label>
                <Select value={addEventForm.eventType} onValueChange={v => setAddEventForm(f => ({ ...f, eventType: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      { value: "enrolled", label: "Enrolled" },
                      { value: "reactivated", label: "Reactivated" },
                      { value: "withdrawn", label: "Withdrawn" },
                      { value: "transferred_in", label: "Transferred In" },
                      { value: "transferred_out", label: "Transferred Out" },
                      { value: "program_change", label: "Program Change" },
                      { value: "graduated", label: "Graduated" },
                      { value: "suspended", label: "Suspended" },
                      { value: "leave_of_absence", label: "Leave of Absence" },
                      { value: "note", label: "Note" },
                    ].map(o => <SelectItem key={o.value} value={o.value} className="text-[13px]">{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Event Date</Label>
                <Input type="date" value={addEventForm.eventDate} onChange={e => setAddEventForm(f => ({ ...f, eventDate: e.target.value }))} className="h-9 text-[13px]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Reason Code <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Select value={addEventForm.reasonCode} onValueChange={v => setAddEventForm(f => ({ ...f, reasonCode: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Select reason…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-[13px] text-gray-400">None</SelectItem>
                  <SelectItem value="graduation" className="text-[13px]">Graduation</SelectItem>
                  <SelectItem value="transfer" className="text-[13px]">Transfer</SelectItem>
                  <SelectItem value="family_move" className="text-[13px]">Family Move</SelectItem>
                  <SelectItem value="program_completion" className="text-[13px]">Program Completion</SelectItem>
                  <SelectItem value="other" className="text-[13px]">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Reason <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input value={addEventForm.reason} onChange={e => setAddEventForm(f => ({ ...f, reason: e.target.value }))} className="h-9 text-[13px]" placeholder="Brief description of reason" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Notes <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input value={addEventForm.notes} onChange={e => setAddEventForm(f => ({ ...f, notes: e.target.value }))} className="h-9 text-[13px]" placeholder="Any additional context" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddEventDialogOpen(false)} disabled={addEventSaving}>Cancel</Button>
            <Button size="sm" onClick={handleAddEvent} disabled={addEventSaving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {addEventSaving ? "Saving…" : "Log Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Emergency Contact Dialog */}
      <Dialog open={ecDialogOpen} onOpenChange={v => { if (!v) { setEcDialogOpen(false); setEditingEc(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800 flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-600" />
              {editingEc ? "Edit Emergency Contact" : "Add Emergency Contact"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">First Name *</Label>
                <Input value={ecForm.firstName} onChange={e => setEcForm(f => ({ ...f, firstName: e.target.value }))} className="h-9 text-[13px]" placeholder="First name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Last Name *</Label>
                <Input value={ecForm.lastName} onChange={e => setEcForm(f => ({ ...f, lastName: e.target.value }))} className="h-9 text-[13px]" placeholder="Last name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Relationship *</Label>
                <Input value={ecForm.relationship} onChange={e => setEcForm(f => ({ ...f, relationship: e.target.value }))} className="h-9 text-[13px]" placeholder="e.g. Parent, Guardian" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Priority</Label>
                <Input type="number" min={1} value={ecForm.priority} onChange={e => setEcForm(f => ({ ...f, priority: Number(e.target.value) }))} className="h-9 text-[13px]" placeholder="1 = Primary" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Primary Phone *</Label>
                <Input value={ecForm.phone} onChange={e => setEcForm(f => ({ ...f, phone: e.target.value }))} className="h-9 text-[13px]" placeholder="(555) 000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Secondary Phone</Label>
                <Input value={ecForm.phoneSecondary} onChange={e => setEcForm(f => ({ ...f, phoneSecondary: e.target.value }))} className="h-9 text-[13px]" placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Email</Label>
              <Input type="email" value={ecForm.email} onChange={e => setEcForm(f => ({ ...f, email: e.target.value }))} className="h-9 text-[13px]" placeholder="Optional" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ecPickup" checked={ecForm.isAuthorizedForPickup} onChange={e => setEcForm(f => ({ ...f, isAuthorizedForPickup: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              <Label htmlFor="ecPickup" className="text-[13px] font-medium text-gray-700 cursor-pointer">Authorized for student pickup</Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Notes</Label>
              <Input value={ecForm.notes} onChange={e => setEcForm(f => ({ ...f, notes: e.target.value }))} className="h-9 text-[13px]" placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setEcDialogOpen(false); setEditingEc(null); }} disabled={ecSaving}>Cancel</Button>
            <Button size="sm" onClick={handleSaveEc} disabled={ecSaving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {ecSaving ? "Saving…" : editingEc ? "Save Changes" : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Emergency Contact Confirm */}
      <Dialog open={!!deletingEc} onOpenChange={v => { if (!v) setDeletingEc(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">Remove Emergency Contact?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-gray-500 py-1">
            Remove <strong>{deletingEc?.firstName} {deletingEc?.lastName}</strong> from this student's emergency contacts?
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeletingEc(null)}>Cancel</Button>
            <Button size="sm" onClick={() => deletingEc && handleDeleteEc(deletingEc)} className="bg-red-600 hover:bg-red-700 text-white">Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Medical Alert Dialog */}
      <Dialog open={maDialogOpen} onOpenChange={v => { if (!v) { setMaDialogOpen(false); setEditingMa(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-red-500" />
              {editingMa ? "Edit Medical Alert" : "Add Medical Alert"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Alert Type *</Label>
                <Select value={maForm.alertType} onValueChange={v => setMaForm(f => ({ ...f, alertType: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[{ value: "allergy", label: "Allergy" }, { value: "medication", label: "Medication" }, { value: "condition", label: "Condition" }, { value: "seizure", label: "Seizure" }, { value: "other", label: "Other" }].map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-[13px]">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Severity *</Label>
                <Select value={maForm.severity} onValueChange={v => setMaForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[{ value: "mild", label: "Mild" }, { value: "moderate", label: "Moderate" }, { value: "severe", label: "Severe" }, { value: "life_threatening", label: "Life-Threatening" }].map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-[13px]">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Description *</Label>
              <Input value={maForm.description} onChange={e => setMaForm(f => ({ ...f, description: e.target.value }))} className="h-9 text-[13px]" placeholder="e.g. Severe peanut allergy" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Treatment Notes</Label>
              <Input value={maForm.treatmentNotes} onChange={e => setMaForm(f => ({ ...f, treatmentNotes: e.target.value }))} className="h-9 text-[13px]" placeholder="What to do in an emergency" />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="maEpiPen" checked={maForm.epiPenOnFile} onChange={e => setMaForm(f => ({ ...f, epiPenOnFile: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <Label htmlFor="maEpiPen" className="text-[13px] font-medium text-gray-700 cursor-pointer">EpiPen on file</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="maNotify" checked={maForm.notifyAllStaff} onChange={e => setMaForm(f => ({ ...f, notifyAllStaff: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                <Label htmlFor="maNotify" className="text-[13px] font-medium text-gray-700 cursor-pointer">Notify all staff</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setMaDialogOpen(false); setEditingMa(null); }} disabled={maSaving}>Cancel</Button>
            <Button size="sm" onClick={handleSaveMa} disabled={maSaving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {maSaving ? "Saving…" : editingMa ? "Save Changes" : "Add Alert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Medical Alert Confirm */}
      <Dialog open={!!deletingMa} onOpenChange={v => { if (!v) setDeletingMa(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">Remove Medical Alert?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-gray-500 py-1">
            Remove the alert for <strong>{deletingMa?.description}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeletingMa(null)}>Cancel</Button>
            <Button size="sm" onClick={() => deletingMa && handleDeleteMa(deletingMa)} className="bg-red-600 hover:bg-red-700 text-white">Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={v => { if (!v) { setArchiveDialogOpen(false); setArchiveReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800 flex items-center gap-2">
              <Archive className="w-4 h-4 text-amber-600" /> Archive Student
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-[13px] text-gray-500">
              Archiving marks this student as inactive. They will no longer appear in the default student list, but their records are preserved.
            </p>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Reason (optional)</Label>
              <Input
                value={archiveReason}
                onChange={e => setArchiveReason(e.target.value)}
                placeholder="e.g. Moved districts, graduated early…"
                className="h-9 text-[13px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setArchiveDialogOpen(false); setArchiveReason(""); }} disabled={archiveSaving}>Cancel</Button>
            <Button size="sm" onClick={handleArchive} disabled={archiveSaving} className="bg-amber-600 hover:bg-amber-700 text-white">
              {archiveSaving ? "Archiving…" : "Archive Student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate Dialog */}
      <Dialog open={reactivateDialogOpen} onOpenChange={v => { if (!v) setReactivateDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800 flex items-center gap-2">
              <ArchiveRestore className="w-4 h-4 text-emerald-600" /> Reactivate Student
            </DialogTitle>
          </DialogHeader>
          <div className="py-1">
            <p className="text-[13px] text-gray-500">
              This will mark the student as active and log a re-enrollment event. Their previous records and service history will be restored to the active view.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReactivateDialogOpen(false)} disabled={reactivateSaving}>Cancel</Button>
            <Button size="sm" onClick={handleReactivate} disabled={reactivateSaving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {reactivateSaving ? "Reactivating…" : "Reactivate Student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={svcDialogOpen} onOpenChange={v => { if (!v) setSvcDialogOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">
              {editingSvc ? "Edit Service Requirement" : "Add Service Requirement"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Service Type</Label>
                <Select value={svcForm.serviceTypeId} onValueChange={v => setSvcForm(f => ({ ...f, serviceTypeId: v }))} disabled={!!editingSvc}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {serviceTypesList.map((st: any) => (
                      <SelectItem key={st.id} value={String(st.id)} className="text-[13px]">{st.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Provider</Label>
                <Select value={svcForm.providerId} onValueChange={v => setSvcForm(f => ({ ...f, providerId: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none" className="text-[13px]">Unassigned</SelectItem>
                    {staffList.map((st: any) => (
                      <SelectItem key={st.id} value={String(st.id)} className="text-[13px]">{st.firstName} {st.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Required Minutes</Label>
                <Input type="number" value={svcForm.requiredMinutes} onChange={e => setSvcForm(f => ({ ...f, requiredMinutes: e.target.value }))} className="h-9 text-[13px]" placeholder="e.g. 120" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Interval</Label>
                <Select value={svcForm.intervalType} onValueChange={v => setSvcForm(f => ({ ...f, intervalType: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly" className="text-[13px]">Weekly</SelectItem>
                    <SelectItem value="monthly" className="text-[13px]">Monthly</SelectItem>
                    <SelectItem value="daily" className="text-[13px]">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Delivery Type</Label>
                <Select value={svcForm.deliveryType} onValueChange={v => setSvcForm(f => ({ ...f, deliveryType: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct" className="text-[13px]">Direct</SelectItem>
                    <SelectItem value="consult" className="text-[13px]">Consult</SelectItem>
                    <SelectItem value="indirect" className="text-[13px]">Indirect</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Start Date</Label>
                <input type="date" value={svcForm.startDate} onChange={e => setSvcForm(f => ({ ...f, startDate: e.target.value }))} className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">End Date</Label>
                <input type="date" value={svcForm.endDate} onChange={e => setSvcForm(f => ({ ...f, endDate: e.target.value }))} className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Priority</Label>
                <Select value={svcForm.priority} onValueChange={v => setSvcForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low" className="text-[13px]">Low</SelectItem>
                    <SelectItem value="medium" className="text-[13px]">Medium</SelectItem>
                    <SelectItem value="high" className="text-[13px]">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSvcDialogOpen(false)} disabled={svcSaving}>Cancel</Button>
            <Button size="sm" onClick={handleSaveSvc} disabled={svcSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {svcSaving ? "Saving…" : editingSvc ? "Update" : "Add Requirement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingSvc} onOpenChange={v => { if (!v) setDeletingSvc(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">Delete Service Requirement</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-gray-600 py-2">
            Are you sure you want to delete the service requirement for <strong>{deletingSvc?.serviceTypeName || "this service"}</strong>? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeletingSvc(null)} disabled={svcSaving}>Cancel</Button>
            <Button size="sm" onClick={handleDeleteSvc} disabled={svcSaving} className="bg-red-600 hover:bg-red-700 text-white">
              {svcSaving ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={v => { if (!v) setAssignDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">Assign Staff</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Staff Member</Label>
              <Select value={assignForm.staffId} onValueChange={v => setAssignForm(f => ({ ...f, staffId: v }))}>
                <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Select staff..." /></SelectTrigger>
                <SelectContent>
                  {staffList.map((st: any) => (
                    <SelectItem key={st.id} value={String(st.id)} className="text-[13px]">{st.firstName} {st.lastName} ({st.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Assignment Type</Label>
              <Select value={assignForm.assignmentType} onValueChange={v => setAssignForm(f => ({ ...f, assignmentType: v }))}>
                <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="service_provider" className="text-[13px]">Service Provider</SelectItem>
                  <SelectItem value="case_manager" className="text-[13px]">Case Manager</SelectItem>
                  <SelectItem value="supervisor" className="text-[13px]">Supervisor</SelectItem>
                  <SelectItem value="consultant" className="text-[13px]">Consultant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Start Date</Label>
                <input type="date" value={assignForm.startDate} onChange={e => setAssignForm(f => ({ ...f, startDate: e.target.value }))} className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">End Date</Label>
                <input type="date" value={assignForm.endDate} onChange={e => setAssignForm(f => ({ ...f, endDate: e.target.value }))} className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAssignDialogOpen(false)} disabled={assignSaving}>Cancel</Button>
            <Button size="sm" onClick={handleAddAssignment} disabled={assignSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {assignSaving ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showShareModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-600" /> Share Progress Summary
              </h2>
              <button onClick={() => setShowShareModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <XCircle className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-600">Report Period:</label>
                <select
                  value={shareDays}
                  onChange={e => { setShareDays(Number(e.target.value)); }}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                >
                  <option value={30}>Last 30 days</option>
                  <option value={60}>Last 60 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
                <button
                  onClick={handleShareProgress}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Refresh
                </button>
              </div>

              {shareLoading ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="w-full h-16" />
                  <Skeleton className="w-full h-32" />
                  <Skeleton className="w-full h-24" />
                </div>
              ) : shareSummary ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">IEP Goals ({shareSummary.goals.length})</h3>
                    {shareSummary.goals.length > 0 ? (
                      <div className="space-y-1.5">
                        {shareSummary.goals.map((g: any) => (
                          <div key={g.id} className="flex items-center gap-2 text-xs bg-white p-2 rounded-lg">
                            <span className="font-medium text-gray-700">{g.goalArea} #{g.goalNumber}</span>
                            <span className="text-gray-400 flex-1 truncate">{g.annualGoal}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{g.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-xs text-gray-400">No active goals</p>}
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Service Delivery</h3>
                    {shareSummary.serviceDelivery.length > 0 ? (
                      <div className="space-y-1.5">
                        {shareSummary.serviceDelivery.map((d: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-white p-2 rounded-lg">
                            <span className="font-medium text-gray-700 min-w-[120px]">{d.serviceType}</span>
                            <span className="text-gray-500">{d.deliveredMinutes}/{d.requiredMinutes} min</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, d.percentComplete)}%` }} />
                            </div>
                            <span className="font-bold text-gray-700 w-10 text-right">{d.percentComplete}%</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-xs text-gray-400">No service requirements</p>}
                  </div>

                  {shareSummary.behaviorData.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Behavior Data Trends</h3>
                      <div className="space-y-1.5">
                        {shareSummary.behaviorData.map((b: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-white p-2 rounded-lg">
                            <span className="font-medium text-gray-700">{b.targetName}</span>
                            <span className="text-gray-400">Avg: {b.average ?? "\u2014"}</span>
                            <span className="text-gray-400">Recent: {b.recentAverage ?? "\u2014"}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              b.trend === "increasing" ? "bg-emerald-50 text-emerald-600" :
                              b.trend === "decreasing" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                            }`}>{b.trend.replace(/_/g, " ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {shareSummary.programData.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Program Progress</h3>
                      <div className="space-y-1.5">
                        {shareSummary.programData.map((p: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-white p-2 rounded-lg">
                            <span className="font-medium text-gray-700">{p.targetName}</span>
                            <span className="text-gray-400">Avg: {p.averagePercent ?? "\u2014"}%</span>
                            <span className="text-gray-400">Recent: {p.recentAveragePercent ?? "\u2014"}%</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              p.trend === "increasing" ? "bg-emerald-50 text-emerald-600" :
                              p.trend === "decreasing" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                            }`}>{p.trend.replace(/_/g, " ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">Failed to load summary</p>
              )}

              {shareSummary && (
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <button
                    onClick={handlePrintSummary}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                  >
                    Print / Export PDF
                  </button>
                  <button
                    onClick={generateShareLink}
                    className="px-4 py-2 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-50"
                  >
                    Generate Share Link
                  </button>
                  {shareLink && (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="text"
                        readOnly
                        value={shareLink}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-gray-50 text-gray-600"
                      />
                      <button
                        onClick={() => { navigator.clipboard.writeText(shareLink); toast.success("Link copied"); }}
                        className="p-1.5 hover:bg-gray-100 rounded-lg"
                        title="Copy link"
                      >
                        <Copy className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
