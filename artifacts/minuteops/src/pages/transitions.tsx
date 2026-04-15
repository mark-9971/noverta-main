import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Link } from "wouter";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import {
  Sprout, Plus, GraduationCap, Briefcase, Home, Building2,
  Calendar, AlertTriangle, ChevronDown, ChevronUp, Phone, Mail,
  Pencil, Trash2, Users, Clock, CheckCircle, XCircle,
} from "lucide-react";

interface TransitionPlan {
  id: number;
  studentId: number;
  planDate: string;
  ageOfMajorityNotified: boolean;
  ageOfMajorityDate: string | null;
  graduationPathway: string | null;
  expectedGraduationDate: string | null;
  diplomaType: string | null;
  creditsEarned: string | null;
  creditsRequired: string | null;
  assessmentsUsed: string | null;
  studentVisionStatement: string | null;
  coordinatorId: number | null;
  status: string;
  notes: string | null;
  studentName?: string;
  studentAge?: number | null;
  studentGrade?: string | null;
  coordinatorName?: string | null;
  goals?: TransitionGoal[];
  agencyReferrals?: AgencyReferral[];
  createdAt: string;
  updatedAt: string;
}

interface TransitionGoal {
  id: number;
  transitionPlanId: number;
  domain: string;
  goalStatement: string;
  measurableCriteria: string | null;
  activities: string | null;
  responsibleParty: string | null;
  targetDate: string | null;
  status: string;
  progressNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AgencyReferral {
  id: number;
  transitionPlanId: number;
  agencyName: string;
  agencyType: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  referralDate: string;
  status: string;
  followUpDate: string | null;
  outcome: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DashboardData {
  totalTransitionAge: number;
  approachingTransitionAge: number;
  withPlan: number;
  missingPlan: number;
  incompletePlans: number;
  missingPlanStudents: { id: number; name: string; age: number | null; grade: string | null }[];
  incompletePlanStudents: { id: number; name: string; age: number | null; grade: string | null; missingDomains: string[] }[];
  approachingStudents: { id: number; name: string; age: number | null; grade: string | null }[];
  pendingAgencyReferrals: number;
  overdueFollowups: number;
}

interface StudentOption {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  grade?: string;
}

const DOMAIN_META: Record<string, { label: string; icon: typeof GraduationCap; color: string }> = {
  education: { label: "Post-Secondary Education", icon: GraduationCap, color: "emerald" },
  employment: { label: "Employment", icon: Briefcase, color: "blue" },
  independent_living: { label: "Independent Living", icon: Home, color: "purple" },
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-emerald-50 text-emerald-700",
  completed: "bg-blue-50 text-blue-700",
  archived: "bg-gray-50 text-gray-500",
  pending: "bg-amber-50 text-amber-700",
  contacted: "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
  in_progress: "bg-blue-50 text-blue-700",
};

type Tab = "dashboard" | "plans" | "plan-detail";

export default function TransitionsPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [plans, setPlans] = useState<TransitionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<TransitionPlan | null>(null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [showReferralDialog, setShowReferralDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TransitionPlan | null>(null);
  const [editingGoal, setEditingGoal] = useState<TransitionGoal | null>(null);
  const [editingReferral, setEditingReferral] = useState<AgencyReferral | null>(null);

  const [planForm, setPlanForm] = useState({
    studentId: "", planDate: new Date().toISOString().slice(0, 10), graduationPathway: "",
    expectedGraduationDate: "", diplomaType: "", creditsEarned: "", creditsRequired: "",
    assessmentsUsed: "", studentVisionStatement: "", status: "draft", notes: "",
    ageOfMajorityNotified: false, ageOfMajorityDate: "",
  });

  const [goalForm, setGoalForm] = useState({
    domain: "education", goalStatement: "", measurableCriteria: "", activities: "",
    responsibleParty: "", targetDate: "", status: "active", progressNotes: "",
  });

  const [referralForm, setReferralForm] = useState({
    agencyName: "", agencyType: "", contactName: "", contactPhone: "", contactEmail: "",
    referralDate: new Date().toISOString().slice(0, 10), status: "pending",
    followUpDate: "", outcome: "", notes: "",
  });

  async function loadDashboard() {
    try {
      const d = await authFetch("/api/transitions/dashboard") as DashboardData;
      setDashboard(d);
    } catch { /* ignore */ }
  }

  async function loadPlans() {
    try {
      const p = await authFetch("/api/transitions/plans") as TransitionPlan[];
      setPlans(p);
    } catch { /* ignore */ }
  }

  async function loadPlanDetail(id: number) {
    try {
      const p = await authFetch(`/api/transitions/plans/${id}`) as TransitionPlan;
      setSelectedPlan(p);
    } catch { toast.error("Failed to load plan details"); }
  }

  async function loadStudents() {
    try {
      const s = await authFetch("/api/students") as StudentOption[];
      setStudents(Array.isArray(s) ? s : []);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    Promise.all([loadDashboard(), loadPlans(), loadStudents()]).finally(() => setLoading(false));
  }, []);

  function openNewPlan(studentId?: number) {
    setEditingPlan(null);
    setPlanForm({
      studentId: studentId ? String(studentId) : "", planDate: new Date().toISOString().slice(0, 10),
      graduationPathway: "", expectedGraduationDate: "", diplomaType: "", creditsEarned: "",
      creditsRequired: "", assessmentsUsed: "", studentVisionStatement: "", status: "draft",
      notes: "", ageOfMajorityNotified: false, ageOfMajorityDate: "",
    });
    setShowPlanDialog(true);
  }

  function openEditPlan(plan: TransitionPlan) {
    setEditingPlan(plan);
    setPlanForm({
      studentId: String(plan.studentId), planDate: plan.planDate,
      graduationPathway: plan.graduationPathway ?? "", expectedGraduationDate: plan.expectedGraduationDate ?? "",
      diplomaType: plan.diplomaType ?? "", creditsEarned: plan.creditsEarned ?? "",
      creditsRequired: plan.creditsRequired ?? "", assessmentsUsed: plan.assessmentsUsed ?? "",
      studentVisionStatement: plan.studentVisionStatement ?? "", status: plan.status,
      notes: plan.notes ?? "", ageOfMajorityNotified: plan.ageOfMajorityNotified ?? false,
      ageOfMajorityDate: plan.ageOfMajorityDate ?? "",
    });
    setShowPlanDialog(true);
  }

  async function savePlan() {
    try {
      const payload: Record<string, unknown> = {
        ...planForm,
        studentId: Number(planForm.studentId),
        coordinatorId: null,
        ageOfMajorityDate: planForm.ageOfMajorityDate || null,
        expectedGraduationDate: planForm.expectedGraduationDate || null,
        graduationPathway: planForm.graduationPathway || null,
        diplomaType: planForm.diplomaType || null,
        creditsEarned: planForm.creditsEarned || null,
        creditsRequired: planForm.creditsRequired || null,
        assessmentsUsed: planForm.assessmentsUsed || null,
        studentVisionStatement: planForm.studentVisionStatement || null,
        notes: planForm.notes || null,
      };

      if (editingPlan) {
        await authFetch(`/api/transitions/plans/${editingPlan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Plan updated");
        if (selectedPlan?.id === editingPlan.id) await loadPlanDetail(editingPlan.id);
      } else {
        const created = await authFetch("/api/transitions/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }) as TransitionPlan;
        toast.success("Plan created");
        setSelectedPlan(null);
        setTab("plans");
      }
      setShowPlanDialog(false);
      await Promise.all([loadPlans(), loadDashboard()]);
    } catch { toast.error("Failed to save plan"); }
  }

  async function deletePlan(id: number) {
    if (!confirm("Delete this transition plan?")) return;
    try {
      await authFetch(`/api/transitions/plans/${id}`, { method: "DELETE" });
      toast.success("Plan deleted");
      if (selectedPlan?.id === id) { setSelectedPlan(null); setTab("plans"); }
      await Promise.all([loadPlans(), loadDashboard()]);
    } catch { toast.error("Failed to delete plan"); }
  }

  function openNewGoal() {
    setEditingGoal(null);
    setGoalForm({ domain: "education", goalStatement: "", measurableCriteria: "", activities: "", responsibleParty: "", targetDate: "", status: "active", progressNotes: "" });
    setShowGoalDialog(true);
  }

  function openEditGoal(g: TransitionGoal) {
    setEditingGoal(g);
    setGoalForm({
      domain: g.domain, goalStatement: g.goalStatement, measurableCriteria: g.measurableCriteria ?? "",
      activities: g.activities ?? "", responsibleParty: g.responsibleParty ?? "",
      targetDate: g.targetDate ?? "", status: g.status, progressNotes: g.progressNotes ?? "",
    });
    setShowGoalDialog(true);
  }

  async function saveGoal() {
    if (!selectedPlan) return;
    try {
      const payload = { ...goalForm, transitionPlanId: selectedPlan.id, measurableCriteria: goalForm.measurableCriteria || null, activities: goalForm.activities || null, responsibleParty: goalForm.responsibleParty || null, targetDate: goalForm.targetDate || null, progressNotes: goalForm.progressNotes || null };
      if (editingGoal) {
        await authFetch(`/api/transitions/goals/${editingGoal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Goal updated");
      } else {
        await authFetch("/api/transitions/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Goal created");
      }
      setShowGoalDialog(false);
      await loadPlanDetail(selectedPlan.id);
    } catch { toast.error("Failed to save goal"); }
  }

  async function deleteGoal(id: number) {
    if (!confirm("Delete this goal?")) return;
    try {
      await authFetch(`/api/transitions/goals/${id}`, { method: "DELETE" });
      toast.success("Goal deleted");
      if (selectedPlan) await loadPlanDetail(selectedPlan.id);
    } catch { toast.error("Failed to delete goal"); }
  }

  function openNewReferral() {
    setEditingReferral(null);
    setReferralForm({ agencyName: "", agencyType: "", contactName: "", contactPhone: "", contactEmail: "", referralDate: new Date().toISOString().slice(0, 10), status: "pending", followUpDate: "", outcome: "", notes: "" });
    setShowReferralDialog(true);
  }

  function openEditReferral(r: AgencyReferral) {
    setEditingReferral(r);
    setReferralForm({
      agencyName: r.agencyName, agencyType: r.agencyType ?? "", contactName: r.contactName ?? "",
      contactPhone: r.contactPhone ?? "", contactEmail: r.contactEmail ?? "", referralDate: r.referralDate,
      status: r.status, followUpDate: r.followUpDate ?? "", outcome: r.outcome ?? "", notes: r.notes ?? "",
    });
    setShowReferralDialog(true);
  }

  async function saveReferral() {
    if (!selectedPlan) return;
    try {
      const payload = { ...referralForm, transitionPlanId: selectedPlan.id, agencyType: referralForm.agencyType || null, contactName: referralForm.contactName || null, contactPhone: referralForm.contactPhone || null, contactEmail: referralForm.contactEmail || null, followUpDate: referralForm.followUpDate || null, outcome: referralForm.outcome || null, notes: referralForm.notes || null };
      if (editingReferral) {
        await authFetch(`/api/transitions/agency-referrals/${editingReferral.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Referral updated");
      } else {
        await authFetch("/api/transitions/agency-referrals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Referral created");
      }
      setShowReferralDialog(false);
      await loadPlanDetail(selectedPlan.id);
    } catch { toast.error("Failed to save referral"); }
  }

  async function deleteReferral(id: number) {
    if (!confirm("Delete this agency referral?")) return;
    try {
      await authFetch(`/api/transitions/agency-referrals/${id}`, { method: "DELETE" });
      toast.success("Referral deleted");
      if (selectedPlan) await loadPlanDetail(selectedPlan.id);
    } catch { toast.error("Failed to delete referral"); }
  }

  function viewPlan(plan: TransitionPlan) {
    loadPlanDetail(plan.id);
    setTab("plan-detail");
  }

  if (loading) return <div className="p-8"><div className="h-8 w-48 bg-gray-100 rounded animate-pulse" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Sprout className="w-6 h-6 text-emerald-600" /> Transition Planning
          </h1>
          <p className="text-[13px] text-gray-500 mt-0.5">IDEA post-secondary transition planning for students aged 14+</p>
        </div>
        <Button onClick={() => openNewPlan()} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[13px]">
          <Plus className="w-4 h-4 mr-1" /> New Plan
        </Button>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        <button onClick={() => setTab("dashboard")} className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === "dashboard" ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>Dashboard</button>
        <button onClick={() => setTab("plans")} className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === "plans" ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>All Plans</button>
        {selectedPlan && (
          <button onClick={() => setTab("plan-detail")} className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === "plan-detail" ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            Plan Detail
          </button>
        )}
      </div>

      {tab === "dashboard" && <DashboardTab dashboard={dashboard} onCreatePlan={openNewPlan} />}
      {tab === "plans" && <PlansTab plans={plans} onView={viewPlan} onEdit={openEditPlan} onDelete={deletePlan} />}
      {tab === "plan-detail" && selectedPlan && (
        <PlanDetailTab
          plan={selectedPlan}
          onEditPlan={() => openEditPlan(selectedPlan)}
          onDeletePlan={() => deletePlan(selectedPlan.id)}
          onNewGoal={openNewGoal}
          onEditGoal={openEditGoal}
          onDeleteGoal={deleteGoal}
          onNewReferral={openNewReferral}
          onEditReferral={openEditReferral}
          onDeleteReferral={deleteReferral}
        />
      )}

      <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingPlan ? "Edit Transition Plan" : "New Transition Plan"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!editingPlan && (
              <div>
                <Label className="text-[12px]">Student</Label>
                <Select value={planForm.studentId} onValueChange={v => setPlanForm(f => ({ ...f, studentId: v }))}>
                  <SelectTrigger className="form-select"><SelectValue placeholder="Select student..." /></SelectTrigger>
                  <SelectContent>
                    {students.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}{s.grade ? ` (${s.grade})` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Plan Date</Label>
                <Input type="date" className="form-input" value={planForm.planDate} onChange={e => setPlanForm(f => ({ ...f, planDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-[12px]">Status</Label>
                <Select value={planForm.status} onValueChange={v => setPlanForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="form-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Student Vision Statement</Label>
              <textarea className="form-textarea w-full" rows={2} value={planForm.studentVisionStatement} onChange={e => setPlanForm(f => ({ ...f, studentVisionStatement: e.target.value }))} placeholder="Student's own words about their future..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Graduation Pathway</Label>
                <Select value={planForm.graduationPathway || "__none"} onValueChange={v => setPlanForm(f => ({ ...f, graduationPathway: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="form-select"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not specified</SelectItem>
                    <SelectItem value="standard_diploma">Standard Diploma</SelectItem>
                    <SelectItem value="certificate_of_attainment">Certificate of Attainment</SelectItem>
                    <SelectItem value="certificate_of_completion">Certificate of Completion</SelectItem>
                    <SelectItem value="ged">GED</SelectItem>
                    <SelectItem value="vocational">Vocational Pathway</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[12px]">Expected Graduation</Label>
                <Input type="date" className="form-input" value={planForm.expectedGraduationDate} onChange={e => setPlanForm(f => ({ ...f, expectedGraduationDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Credits Earned</Label>
                <Input className="form-input" value={planForm.creditsEarned} onChange={e => setPlanForm(f => ({ ...f, creditsEarned: e.target.value }))} />
              </div>
              <div>
                <Label className="text-[12px]">Credits Required</Label>
                <Input className="form-input" value={planForm.creditsRequired} onChange={e => setPlanForm(f => ({ ...f, creditsRequired: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Assessments Used</Label>
              <Input className="form-input" value={planForm.assessmentsUsed} onChange={e => setPlanForm(f => ({ ...f, assessmentsUsed: e.target.value }))} placeholder="e.g., Career Interest Inventory, ASVAB" />
            </div>
            <div>
              <Label className="text-[12px]">Notes</Label>
              <textarea className="form-textarea w-full" rows={2} value={planForm.notes} onChange={e => setPlanForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanDialog(false)} className="text-[13px]">Cancel</Button>
            <Button onClick={savePlan} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[13px]" disabled={!planForm.studentId || !planForm.planDate}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showGoalDialog} onOpenChange={setShowGoalDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingGoal ? "Edit Transition Goal" : "New Transition Goal"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px]">Domain</Label>
              <Select value={goalForm.domain} onValueChange={v => setGoalForm(f => ({ ...f, domain: v }))}>
                <SelectTrigger className="form-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="education">Post-Secondary Education</SelectItem>
                  <SelectItem value="employment">Employment</SelectItem>
                  <SelectItem value="independent_living">Independent Living</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">Goal Statement</Label>
              <textarea className="form-textarea w-full" rows={3} value={goalForm.goalStatement} onChange={e => setGoalForm(f => ({ ...f, goalStatement: e.target.value }))} placeholder="Within one year of graduation, the student will..." />
            </div>
            <div>
              <Label className="text-[12px]">Measurable Criteria</Label>
              <textarea className="form-textarea w-full" rows={2} value={goalForm.measurableCriteria} onChange={e => setGoalForm(f => ({ ...f, measurableCriteria: e.target.value }))} placeholder="How will progress be measured?" />
            </div>
            <div>
              <Label className="text-[12px]">Activities / Steps</Label>
              <textarea className="form-textarea w-full" rows={2} value={goalForm.activities} onChange={e => setGoalForm(f => ({ ...f, activities: e.target.value }))} placeholder="Transition activities to support this goal..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Responsible Party</Label>
                <Input className="form-input" value={goalForm.responsibleParty} onChange={e => setGoalForm(f => ({ ...f, responsibleParty: e.target.value }))} placeholder="e.g., Student, Teacher, VR" />
              </div>
              <div>
                <Label className="text-[12px]">Target Date</Label>
                <Input type="date" className="form-input" value={goalForm.targetDate} onChange={e => setGoalForm(f => ({ ...f, targetDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Status</Label>
                <Select value={goalForm.status} onValueChange={v => setGoalForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="form-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Progress Notes</Label>
              <textarea className="form-textarea w-full" rows={2} value={goalForm.progressNotes} onChange={e => setGoalForm(f => ({ ...f, progressNotes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGoalDialog(false)} className="text-[13px]">Cancel</Button>
            <Button onClick={saveGoal} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[13px]" disabled={!goalForm.goalStatement}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReferralDialog} onOpenChange={setShowReferralDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingReferral ? "Edit Agency Referral" : "New Agency Referral"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Agency Name</Label>
                <Input className="form-input" value={referralForm.agencyName} onChange={e => setReferralForm(f => ({ ...f, agencyName: e.target.value }))} placeholder="e.g., MA Rehabilitation Commission" />
              </div>
              <div>
                <Label className="text-[12px]">Agency Type</Label>
                <Select value={referralForm.agencyType || "__none"} onValueChange={v => setReferralForm(f => ({ ...f, agencyType: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="form-select"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not specified</SelectItem>
                    <SelectItem value="vocational_rehabilitation">Vocational Rehabilitation</SelectItem>
                    <SelectItem value="adult_services">Adult Services</SelectItem>
                    <SelectItem value="mental_health">Mental Health</SelectItem>
                    <SelectItem value="housing">Housing</SelectItem>
                    <SelectItem value="employment">Employment Services</SelectItem>
                    <SelectItem value="post_secondary_education">Post-Secondary Education</SelectItem>
                    <SelectItem value="social_security">Social Security</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[12px]">Contact Name</Label>
                <Input className="form-input" value={referralForm.contactName} onChange={e => setReferralForm(f => ({ ...f, contactName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-[12px]">Contact Phone</Label>
                <Input className="form-input" value={referralForm.contactPhone} onChange={e => setReferralForm(f => ({ ...f, contactPhone: e.target.value }))} />
              </div>
              <div>
                <Label className="text-[12px]">Contact Email</Label>
                <Input className="form-input" value={referralForm.contactEmail} onChange={e => setReferralForm(f => ({ ...f, contactEmail: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Referral Date</Label>
                <Input type="date" className="form-input" value={referralForm.referralDate} onChange={e => setReferralForm(f => ({ ...f, referralDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-[12px]">Status</Label>
                <Select value={referralForm.status} onValueChange={v => setReferralForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="form-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="declined">Declined</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Follow-Up Date</Label>
              <Input type="date" className="form-input" value={referralForm.followUpDate} onChange={e => setReferralForm(f => ({ ...f, followUpDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[12px]">Outcome</Label>
              <textarea className="form-textarea w-full" rows={2} value={referralForm.outcome} onChange={e => setReferralForm(f => ({ ...f, outcome: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[12px]">Notes</Label>
              <textarea className="form-textarea w-full" rows={2} value={referralForm.notes} onChange={e => setReferralForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReferralDialog(false)} className="text-[13px]">Cancel</Button>
            <Button onClick={saveReferral} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[13px]" disabled={!referralForm.agencyName || !referralForm.referralDate}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DashboardTab({ dashboard, onCreatePlan }: { dashboard: DashboardData | null; onCreatePlan: (studentId?: number) => void }) {
  if (!dashboard) return <div className="text-[13px] text-gray-500 py-8 text-center">Loading transition data...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-gray-200/60">
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50"><Users className="w-5 h-5 text-emerald-600" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{dashboard.totalTransitionAge}</p>
                <p className="text-[11px] text-gray-500">Transition-age students</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-200/60">
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50"><CheckCircle className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{dashboard.withPlan}</p>
                <p className="text-[11px] text-gray-500">With active plans</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={dashboard.missingPlan > 0 ? "border-red-200 bg-red-50/20" : "border-gray-200/60"}>
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${dashboard.missingPlan > 0 ? "bg-red-50" : "bg-gray-50"}`}><AlertTriangle className={`w-5 h-5 ${dashboard.missingPlan > 0 ? "text-red-500" : "text-gray-400"}`} /></div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{dashboard.missingPlan}</p>
                <p className="text-[11px] text-gray-500">Missing plan</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={dashboard.incompletePlans > 0 ? "border-amber-200 bg-amber-50/20" : "border-gray-200/60"}>
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${dashboard.incompletePlans > 0 ? "bg-amber-50" : "bg-gray-50"}`}><Clock className={`w-5 h-5 ${dashboard.incompletePlans > 0 ? "text-amber-600" : "text-gray-400"}`} /></div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{dashboard.incompletePlans}</p>
                <p className="text-[11px] text-gray-500">Incomplete plans</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {dashboard.overdueFollowups > 0 && (
        <Card className="border-red-200 bg-red-50/20">
          <CardContent className="py-3 px-5 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-[13px] text-red-700 font-medium">{dashboard.overdueFollowups} agency referral follow-up{dashboard.overdueFollowups !== 1 ? "s" : ""} overdue</p>
          </CardContent>
        </Card>
      )}

      {dashboard.missingPlanStudents.length > 0 && (
        <Card className="border-gray-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" /> Students Needing Transition Plans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-gray-100">
              {dashboard.missingPlanStudents.map(s => (
                <div key={s.id} className="py-2 flex items-center justify-between">
                  <div>
                    <Link href={`/students/${s.id}`} className="text-[13px] font-medium text-emerald-700 hover:text-emerald-800">{s.name}</Link>
                    <p className="text-[11px] text-gray-500">Age {s.age ?? "?"} · Grade {s.grade ?? "?"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onCreatePlan(s.id)} className="text-[11px] h-7">
                    <Plus className="w-3 h-3 mr-1" /> Create Plan
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {dashboard.incompletePlanStudents.length > 0 && (
        <Card className="border-gray-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Incomplete Transition Plans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-gray-100">
              {dashboard.incompletePlanStudents.map(s => (
                <div key={s.id} className="py-2 flex items-center justify-between">
                  <div>
                    <Link href={`/students/${s.id}`} className="text-[13px] font-medium text-emerald-700 hover:text-emerald-800">{s.name}</Link>
                    <p className="text-[11px] text-gray-500">
                      Age {s.age ?? "?"} · Grade {s.grade ?? "?"}
                      {s.missingDomains.length > 0 && ` · Missing: ${s.missingDomains.map(d => d.replace(/_/g, " ")).join(", ")}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {dashboard.approachingStudents.length > 0 && (
        <Card className="border-gray-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> Approaching Transition Age (Age 13)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-gray-100">
              {dashboard.approachingStudents.map(s => (
                <div key={s.id} className="py-2 flex items-center justify-between">
                  <div>
                    <Link href={`/students/${s.id}`} className="text-[13px] font-medium text-gray-700">{s.name}</Link>
                    <p className="text-[11px] text-gray-500">Age {s.age ?? "?"} · Grade {s.grade ?? "?"}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PlansTab({ plans, onView, onEdit, onDelete }: {
  plans: TransitionPlan[];
  onView: (p: TransitionPlan) => void;
  onEdit: (p: TransitionPlan) => void;
  onDelete: (id: number) => void;
}) {
  if (plans.length === 0) return <div className="text-[13px] text-gray-500 py-12 text-center">No transition plans yet. Click "New Plan" to create one.</div>;

  return (
    <div className="space-y-2">
      {plans.map(plan => (
        <Card key={plan.id} className="border-gray-200/60 hover:border-gray-300 transition-colors cursor-pointer" onClick={() => onView(plan)}>
          <CardContent className="py-3 px-5 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-emerald-50"><Sprout className="w-5 h-5 text-emerald-600" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-900">{plan.studentName ?? `Student #${plan.studentId}`}</p>
              <p className="text-[11px] text-gray-500">
                Age {plan.studentAge ?? "?"} · Plan date: {plan.planDate}
                {plan.graduationPathway ? ` · ${plan.graduationPathway.replace(/_/g, " ")}` : ""}
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_STYLES[plan.status] ?? "bg-gray-100 text-gray-600"}`}>{plan.status}</span>
            <div className="flex items-center gap-1">
              <button onClick={e => { e.stopPropagation(); onEdit(plan); }} className="p-1.5 rounded hover:bg-gray-100"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
              <button onClick={e => { e.stopPropagation(); onDelete(plan.id); }} className="p-1.5 rounded hover:bg-gray-100"><Trash2 className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PlanDetailTab({ plan, onEditPlan, onDeletePlan, onNewGoal, onEditGoal, onDeleteGoal, onNewReferral, onEditReferral, onDeleteReferral }: {
  plan: TransitionPlan;
  onEditPlan: () => void;
  onDeletePlan: () => void;
  onNewGoal: () => void;
  onEditGoal: (g: TransitionGoal) => void;
  onDeleteGoal: (id: number) => void;
  onNewReferral: () => void;
  onEditReferral: (r: AgencyReferral) => void;
  onDeleteReferral: (id: number) => void;
}) {
  const goals = plan.goals ?? [];
  const referrals = plan.agencyReferrals ?? [];
  const domainGroups: Record<string, TransitionGoal[]> = {};
  for (const g of goals) {
    if (!domainGroups[g.domain]) domainGroups[g.domain] = [];
    domainGroups[g.domain].push(g);
  }

  return (
    <div className="space-y-6">
      <Card className="border-gray-200/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">Plan Overview</CardTitle>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={onEditPlan} className="text-[11px] h-7"><Pencil className="w-3 h-3 mr-1" /> Edit</Button>
              <Button size="sm" variant="outline" onClick={onDeletePlan} className="text-[11px] h-7 text-red-600 hover:text-red-700"><Trash2 className="w-3 h-3 mr-1" /> Delete</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-[12px]">
            <div>
              <p className="text-gray-500">Student</p>
              <p className="font-medium text-gray-900">{plan.studentName ?? `#${plan.studentId}`}</p>
            </div>
            <div>
              <p className="text-gray-500">Age / Grade</p>
              <p className="font-medium text-gray-900">{plan.studentAge ?? "?"} / {plan.studentGrade ?? "?"}</p>
            </div>
            <div>
              <p className="text-gray-500">Status</p>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_STYLES[plan.status] ?? "bg-gray-100"}`}>{plan.status}</span>
            </div>
            <div>
              <p className="text-gray-500">Plan Date</p>
              <p className="font-medium text-gray-900">{plan.planDate}</p>
            </div>
          </div>
          {plan.studentVisionStatement && (
            <div className="mt-4 p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg">
              <p className="text-[11px] text-emerald-700 font-semibold mb-1">Student Vision</p>
              <p className="text-[12px] text-gray-700 italic">"{plan.studentVisionStatement}"</p>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 text-[12px]">
            {plan.graduationPathway && (
              <div><p className="text-gray-500">Graduation Pathway</p><p className="font-medium text-gray-900">{plan.graduationPathway.replace(/_/g, " ")}</p></div>
            )}
            {plan.expectedGraduationDate && (
              <div><p className="text-gray-500">Expected Graduation</p><p className="font-medium text-gray-900">{plan.expectedGraduationDate}</p></div>
            )}
            {(plan.creditsEarned || plan.creditsRequired) && (
              <div><p className="text-gray-500">Credits</p><p className="font-medium text-gray-900">{plan.creditsEarned ?? "?"} / {plan.creditsRequired ?? "?"}</p></div>
            )}
            {plan.assessmentsUsed && (
              <div><p className="text-gray-500">Assessments</p><p className="font-medium text-gray-900">{plan.assessmentsUsed}</p></div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-200/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">Post-Secondary Goals</CardTitle>
            <Button size="sm" variant="outline" onClick={onNewGoal} className="text-[11px] h-7">
              <Plus className="w-3 h-3 mr-1" /> Add Goal
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {goals.length === 0 ? (
            <p className="text-[12px] text-gray-400 py-4 text-center">No goals added yet. Add goals across education, employment, and independent living domains.</p>
          ) : (
            <div className="space-y-4">
              {(["education", "employment", "independent_living"] as const).map(domain => {
                const meta = DOMAIN_META[domain];
                const domainGoals = domainGroups[domain] ?? [];
                if (domainGoals.length === 0) return null;
                const Icon = meta.icon;
                return (
                  <div key={domain}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`w-4 h-4 text-${meta.color}-600`} />
                      <h4 className="text-[12px] font-semibold text-gray-700">{meta.label}</h4>
                    </div>
                    <div className="space-y-2 ml-6">
                      {domainGoals.map(g => (
                        <div key={g.id} className="border border-gray-100 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-[12px] text-gray-800 font-medium">{g.goalStatement}</p>
                              {g.measurableCriteria && <p className="text-[11px] text-gray-500 mt-1">Criteria: {g.measurableCriteria}</p>}
                              {g.activities && <p className="text-[11px] text-gray-500">Activities: {g.activities}</p>}
                              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                                {g.responsibleParty && <span>Responsible: {g.responsibleParty}</span>}
                                {g.targetDate && <span>Target: {g.targetDate}</span>}
                                <span className={`px-1.5 py-0.5 rounded ${STATUS_STYLES[g.status] ?? "bg-gray-100"}`}>{g.status}</span>
                              </div>
                              {g.progressNotes && <p className="text-[11px] text-gray-500 mt-1 italic">{g.progressNotes}</p>}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => onEditGoal(g)} className="p-1 rounded hover:bg-gray-100"><Pencil className="w-3 h-3 text-gray-400" /></button>
                              <button onClick={() => onDeleteGoal(g.id)} className="p-1 rounded hover:bg-gray-100"><Trash2 className="w-3 h-3 text-gray-400" /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-gray-200/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">Agency Referrals</CardTitle>
            <Button size="sm" variant="outline" onClick={onNewReferral} className="text-[11px] h-7">
              <Plus className="w-3 h-3 mr-1" /> Add Referral
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <p className="text-[12px] text-gray-400 py-4 text-center">No agency referrals yet. Log referrals to VR, adult services, and other agencies.</p>
          ) : (
            <div className="space-y-2">
              {referrals.map(r => {
                const isOverdue = r.followUpDate && r.followUpDate < new Date().toISOString().slice(0, 10) && r.status === "pending";
                return (
                  <div key={r.id} className={`border rounded-lg p-3 ${isOverdue ? "border-red-200 bg-red-50/20" : "border-gray-100"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          <p className="text-[12px] font-medium text-gray-800">{r.agencyName}</p>
                          {r.agencyType && <span className="text-[10px] text-gray-400">({r.agencyType.replace(/_/g, " ")})</span>}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_STYLES[r.status] ?? "bg-gray-100"}`}>{r.status}</span>
                          {isOverdue && <span className="text-[10px] text-red-600 font-semibold">Follow-up overdue</span>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-500">
                          <span>Referred: {r.referralDate}</span>
                          {r.followUpDate && <span>Follow-up: {r.followUpDate}</span>}
                          {r.contactName && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {r.contactName}</span>}
                          {r.contactPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {r.contactPhone}</span>}
                          {r.contactEmail && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {r.contactEmail}</span>}
                        </div>
                        {r.outcome && <p className="text-[11px] text-gray-600 mt-1">Outcome: {r.outcome}</p>}
                        {r.notes && <p className="text-[11px] text-gray-400 mt-0.5 italic">{r.notes}</p>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => onEditReferral(r)} className="p-1 rounded hover:bg-gray-100"><Pencil className="w-3 h-3 text-gray-400" /></button>
                        <button onClick={() => onDeleteReferral(r.id)} className="p-1 rounded hover:bg-gray-100"><Trash2 className="w-3 h-3 text-gray-400" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
