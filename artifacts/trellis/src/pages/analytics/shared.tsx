import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export const COLORS = {
  indigo: "#059669",
  emerald: "#10b981",
  amber: "#f59e0b",
  orange: "#f97316",
  red: "#ef4444",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  pink: "#ec4899",
  teal: "#14b8a6",
  lime: "#84cc16",
  cyan: "#06b6d4",
  rose: "#f43f5e",
};

export const RISK_COLORS = [COLORS.emerald, COLORS.amber, COLORS.orange, COLORS.red];
export const RISK_LABELS = ["On Track", "Slightly Behind", "At Risk", "Out of Compliance"];
export const CHART_PALETTE = [
  COLORS.indigo, COLORS.emerald, COLORS.amber, COLORS.sky,
  COLORS.violet, COLORS.pink, COLORS.teal, COLORS.orange,
];

export const PM_TYPE_COLORS: Record<string, string> = {
  physical_restraint: "#ef4444",
  seclusion: "#f97316",
  time_out: "#f59e0b",
  emergency_escort: "#8b5cf6",
};
export const PM_TYPE_LABELS: Record<string, string> = {
  physical_restraint: "Physical Restraint",
  seclusion: "Seclusion",
  time_out: "Time-Out",
  emergency_escort: "Emergency Escort",
};
export const ANTECEDENT_LABELS: Record<string, string> = {
  academic_demand: "Academic Demand",
  transition: "Transition",
  unstructured_time: "Unstructured Time",
  sensory_overload: "Sensory Overload",
  social_conflict: "Social Conflict",
  peer_interaction: "Peer Interaction",
  staff_redirection: "Staff Redirection",
  denied_access: "Denied Access",
};

export function KPICard({ title, value, icon: Icon, accent, subtitle, trend }: {
  title: string; value: string | number; icon: any; accent: string; subtitle?: string; trend?: { value: number; positive: boolean };
}) {
  const accents: Record<string, string> = {
    indigo: "bg-emerald-50 text-emerald-700",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    sky: "bg-gray-50 text-gray-500",
    violet: "bg-gray-50 text-gray-600",
  };
  return (
    <Card className="hover:shadow-md transition-all duration-200 border-gray-200/80">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${accents[accent] || accents.indigo}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-gray-500 font-medium uppercase tracking-wider">{title}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-gray-800">{value}</span>
              {trend && (
                <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${trend.positive ? "text-emerald-600" : "text-red-500"}`}>
                  {trend.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(trend.value)}%
                </span>
              )}
            </div>
            {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

export function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-700">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function formatWeek(w: string) {
  const d = new Date(w + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
