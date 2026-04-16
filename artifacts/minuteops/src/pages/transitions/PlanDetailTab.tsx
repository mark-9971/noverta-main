import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Mail, Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import type { AgencyReferral, TransitionGoal, TransitionPlan } from "./types";
import { DOMAIN_META, STATUS_STYLES } from "./constants";

export function PlanDetailTab({ plan, onEditPlan, onDeletePlan, onNewGoal, onEditGoal, onDeleteGoal, onNewReferral, onEditReferral, onDeleteReferral }: {
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
