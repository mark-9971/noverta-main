import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { Plus, Sprout } from "lucide-react";
import { DashboardTab } from "./DashboardTab";
import { PlansTab } from "./PlansTab";
import { PlanDetailTab } from "./PlanDetailTab";
import { PlanFormDialog } from "./PlanFormDialog";
import { GoalFormDialog } from "./GoalFormDialog";
import { ReferralFormDialog } from "./ReferralFormDialog";
import type {
  AgencyReferral, DashboardData, GoalFormState, PlanFormState, ReferralFormState,
  StudentOption, Tab, TransitionGoal, TransitionPlan,
} from "./types";

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

  const [planForm, setPlanForm] = useState<PlanFormState>({
    studentId: "", planDate: new Date().toISOString().slice(0, 10), graduationPathway: "",
    expectedGraduationDate: "", diplomaType: "", creditsEarned: "", creditsRequired: "",
    assessmentsUsed: "", studentVisionStatement: "", status: "draft", notes: "",
    ageOfMajorityNotified: false, ageOfMajorityDate: "",
  });

  const [goalForm, setGoalForm] = useState<GoalFormState>({
    domain: "education", goalStatement: "", measurableCriteria: "", activities: "",
    responsibleParty: "", targetDate: "", status: "active", progressNotes: "",
  });

  const [referralForm, setReferralForm] = useState<ReferralFormState>({
    agencyName: "", agencyType: "", contactName: "", contactPhone: "", contactEmail: "",
    referralDate: new Date().toISOString().slice(0, 10), status: "pending",
    followUpDate: "", outcome: "", notes: "",
  });

  async function loadDashboard() {
    try {
      const res = await authFetch("/api/transitions/dashboard");
      if (!res.ok) throw new Error();
      setDashboard(await res.json());
    } catch { /* ignore */ }
  }

  async function loadPlans() {
    try {
      const res = await authFetch("/api/transitions/plans");
      if (!res.ok) throw new Error();
      setPlans(await res.json());
    } catch { /* ignore */ }
  }

  async function loadPlanDetail(id: number) {
    try {
      const res = await authFetch(`/api/transitions/plans/${id}`);
      if (!res.ok) throw new Error();
      setSelectedPlan(await res.json());
    } catch { toast.error("Failed to load plan details"); }
  }

  async function loadStudents() {
    try {
      const res = await authFetch("/api/students");
      if (!res.ok) throw new Error();
      const s = await res.json();
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
        await authFetch("/api/transitions/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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
      await Promise.all([loadPlanDetail(selectedPlan.id), loadPlans()]);
    } catch { toast.error("Failed to save goal"); }
  }

  async function deleteGoal(id: number) {
    if (!confirm("Delete this goal?")) return;
    try {
      await authFetch(`/api/transitions/goals/${id}`, { method: "DELETE" });
      toast.success("Goal deleted");
      if (selectedPlan) await Promise.all([loadPlanDetail(selectedPlan.id), loadPlans()]);
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
      await Promise.all([loadPlanDetail(selectedPlan.id), loadPlans()]);
    } catch { toast.error("Failed to save referral"); }
  }

  async function deleteReferral(id: number) {
    if (!confirm("Delete this agency referral?")) return;
    try {
      await authFetch(`/api/transitions/agency-referrals/${id}`, { method: "DELETE" });
      toast.success("Referral deleted");
      if (selectedPlan) await Promise.all([loadPlanDetail(selectedPlan.id), loadPlans()]);
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

      <PlanFormDialog
        open={showPlanDialog}
        onOpenChange={setShowPlanDialog}
        isEditing={!!editingPlan}
        students={students}
        form={planForm}
        setForm={setPlanForm}
        onSave={savePlan}
      />

      <GoalFormDialog
        open={showGoalDialog}
        onOpenChange={setShowGoalDialog}
        isEditing={!!editingGoal}
        form={goalForm}
        setForm={setGoalForm}
        onSave={saveGoal}
      />

      <ReferralFormDialog
        open={showReferralDialog}
        onOpenChange={setShowReferralDialog}
        isEditing={!!editingReferral}
        form={referralForm}
        setForm={setReferralForm}
        onSave={saveReferral}
      />
    </div>
  );
}
