import { CheckCircle, Circle } from "lucide-react";
import { STEPS, type OnboardingStatus } from "./constants";

export function StepIndicator({ currentStep, status, onStepClick }: {
  currentStep: number;
  status: OnboardingStatus | null;
  onStepClick: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((step, i) => {
        const done = i < currentStep || (status && [
          status.sisConnected,
          status.districtConfirmed && status.schoolsConfigured,
          status.serviceTypesConfigured,
          status.staffInvited,
        ][i]);
        const active = i === currentStep;
        return (
          <button key={step.id} onClick={() => onStepClick(i)} className="flex-1 group">
            <div className={`h-1.5 rounded-full mb-2 transition-colors ${
              done ? "bg-emerald-500" : active ? "bg-emerald-300" : "bg-gray-200"
            }`} />
            <div className="flex items-center gap-1.5">
              {done ? (
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              ) : (
                <Circle className={`w-4 h-4 flex-shrink-0 ${active ? "text-emerald-500" : "text-gray-300"}`} />
              )}
              <span className={`text-xs font-medium truncate ${
                active ? "text-gray-900" : done ? "text-emerald-600" : "text-gray-400"
              }`}>
                {step.label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
