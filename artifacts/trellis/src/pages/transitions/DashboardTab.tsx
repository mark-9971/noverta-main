import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Clock, Plus, Users } from "lucide-react";
import type { DashboardData, TransitionPlan } from "./types";
import { TransitionPlanBadge } from "@/components/transition-plan-badge";

export function DashboardTab({ dashboard, onCreatePlan }: { dashboard: DashboardData | null; onCreatePlan: (studentId?: number) => void }) {
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
              {dashboard.incompletePlanStudents.map(s => {
                const syntheticPlan = {
                  id: 0,
                  studentId: s.id,
                  planDate: "",
                  ageOfMajorityNotified: false,
                  ageOfMajorityDate: null,
                  graduationPathway: s.planSummary.graduationPathway,
                  expectedGraduationDate: null,
                  diplomaType: null,
                  creditsEarned: null,
                  creditsRequired: null,
                  assessmentsUsed: s.planSummary.assessmentsUsed,
                  studentVisionStatement: s.planSummary.studentVisionStatement,
                  coordinatorId: null,
                  status: "",
                  notes: null,
                  goalsCount: s.planSummary.goalsCount,
                  referralsCount: s.planSummary.referralsCount,
                  createdAt: "",
                  updatedAt: "",
                } satisfies TransitionPlan;
                return (
                  <div key={s.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/students/${s.id}`} className="text-[13px] font-medium text-emerald-700 hover:text-emerald-800">{s.name}</Link>
                      <p className="text-[11px] text-gray-500">
                        Age {s.age ?? "?"} · Grade {s.grade ?? "?"}
                        {s.missingDomains.length > 0 && ` · Missing: ${s.missingDomains.map(d => d.replace(/_/g, " ")).join(", ")}`}
                        {s.missingGraduationPathway && ` · No graduation pathway`}
                      </p>
                    </div>
                    <TransitionPlanBadge plan={syntheticPlan} />
                  </div>
                );
              })}
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
