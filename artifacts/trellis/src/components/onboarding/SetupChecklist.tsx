import { useState, useEffect } from "react";
import { Link } from "wouter";
import { authFetch } from "@/lib/auth-fetch";
import { CheckCircle, Circle, ChevronUp, ChevronDown, Database, Building2, Settings2, UserPlus, Rocket } from "lucide-react";

interface OnboardingStatus {
  sisConnected: boolean;
  districtConfirmed: boolean;
  schoolsConfigured: boolean;
  serviceTypesConfigured: boolean;
  staffInvited: boolean;
  isComplete: boolean;
  completedCount: number;
  totalSteps: number;
}

const STEPS = [
  { key: "sisConnected" as const, label: "Connect your SIS", icon: Database, step: 0 },
  { key: "districtConfirmed" as const, label: "Confirm district & schools", icon: Building2, step: 1 },
  { key: "serviceTypesConfigured" as const, label: "Configure service types", icon: Settings2, step: 2 },
  { key: "staffInvited" as const, label: "Invite staff members", icon: UserPlus, step: 3 },
];

export function SetupChecklist() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    authFetch("/api/onboarding/status")
      .then(res => {
        if (!res.ok) throw new Error("Status fetch failed");
        return res.json();
      })
      .then(data => setStatus(data))
      .catch(() => setFetchError(true));
  }, []);

  if (fetchError || !status || status.isComplete) return null;

  const pct = Math.round((status.completedCount / status.totalSteps) * 100);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Rocket className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-gray-800">Setup Progress</span>
          <span className="text-xs text-gray-400">{status.completedCount}/{status.totalSteps}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-20 bg-gray-200 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 space-y-1.5">
          {STEPS.map(step => {
            const done = status[step.key];
            return (
              <Link
                key={step.key}
                href={`/setup?step=${step.step}`}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  done
                    ? "text-gray-400"
                    : "text-gray-700 hover:bg-emerald-50 hover:text-emerald-700"
                }`}
              >
                {done ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                )}
                <step.icon className={`w-3.5 h-3.5 flex-shrink-0 ${done ? "text-gray-300" : "text-gray-400"}`} />
                <span className={done ? "line-through" : ""}>{step.label}</span>
              </Link>
            );
          })}
          <div className="pt-2 px-1">
            <Link
              href="/setup"
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Continue setup
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
