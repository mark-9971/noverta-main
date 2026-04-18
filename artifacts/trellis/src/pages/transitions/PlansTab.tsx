import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, Pencil, Sprout, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { TransitionPlan } from "./types";
import { STATUS_STYLES } from "./constants";
import { TransitionPlanBadge } from "@/components/transition-plan-badge";

export function PlansTab({ plans, onView, onEdit, onDelete }: {
  plans: TransitionPlan[];
  onView: (p: TransitionPlan) => void;
  onEdit: (p: TransitionPlan) => void;
  onDelete: (id: number) => void;
}) {
  if (plans.length === 0) return (
    <EmptyState
      icon={GraduationCap}
      title="No transition plans yet"
      description="Transition plans document post-secondary goals, services, and agency referrals required by IDEA for students age 14+."
      compact
    />
  );

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
            <div className="flex items-center gap-3 flex-shrink-0">
              <TransitionPlanBadge plan={plan} />
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_STYLES[plan.status] ?? "bg-gray-100 text-gray-600"}`}>{plan.status}</span>
              <div className="flex items-center gap-1">
                <button onClick={e => { e.stopPropagation(); onEdit(plan); }} className="p-1.5 rounded hover:bg-gray-100"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
                <button onClick={e => { e.stopPropagation(); onDelete(plan.id); }} className="p-1.5 rounded hover:bg-gray-100"><Trash2 className="w-3.5 h-3.5 text-gray-400" /></button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
