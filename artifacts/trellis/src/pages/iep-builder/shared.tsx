import { CheckCircle2 } from "lucide-react";
import type { Step } from "./types";

export function Textarea({ value, onChange, placeholder, rows = 3, className = "" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; className?: string;
}) {
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows}
      className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none bg-white ${className}`}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-gray-700 mb-1">{label}</label>
      {hint && <p className="text-[11px] text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

export function StepIndicator({ step, currentStep }: { step: number; currentStep: Step }) {
  const done = step < currentStep;
  const active = step === currentStep;
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all ${
      done ? "bg-emerald-600 border-emerald-600 text-white" :
      active ? "bg-white border-emerald-600 text-emerald-600" :
      "bg-white border-gray-200 text-gray-400"
    }`}>
      {done ? <CheckCircle2 className="w-4 h-4" /> : step}
    </div>
  );
}
