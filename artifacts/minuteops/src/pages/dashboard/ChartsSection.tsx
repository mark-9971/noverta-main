import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/ui/progress-ring";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Link } from "wouter";

export function ComplianceRingCard({ ro, riskPieData, onTrackPct }: { ro: any; riskPieData: any[]; onTrackPct: number }) {
  const colorMap: Record<string, string> = { "On Track": "#10b981", "Slightly Behind": "#f59e0b", "At Risk": "#f97316", "Out of Compliance": "#ef4444" };

  return (
    <Card className="lg:col-span-4 border-gray-200/60">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold text-gray-600">Overall Compliance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center py-6">
        {ro ? (
          <>
            <ProgressRing
              value={onTrackPct}
              size={140}
              strokeWidth={12}
              label={`${onTrackPct}%`}
              sublabel="On Track"
              color={onTrackPct >= 70 ? "#10b981" : onTrackPct >= 40 ? "#f59e0b" : "#ef4444"}
            />
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-6 w-full max-w-[240px]">
              {riskPieData.map((d: any) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorMap[d.name] }} />
                  <div>
                    <span className="text-xs text-gray-500">{d.name}</span>
                    <span className="text-xs font-bold text-gray-800 ml-1">{d.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Skeleton className="w-[140px] h-[140px] rounded-full" />
        )}
      </CardContent>
    </Card>
  );
}

export function SessionTrendCard({ trendData }: { trendData: any[] }) {
  return (
    <Card className="lg:col-span-8 border-gray-200/60">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold text-gray-600">Session Delivery · Last 8 Weeks</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}
              />
              <Bar dataKey="completedCount" name="Completed" fill="#059669" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar dataKey="missedCount" name="Missed" fill="#fbbf24" radius={[4, 4, 0, 0]} barSize={20} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Skeleton className="w-full h-[220px]" />
        )}
      </CardContent>
    </Card>
  );
}

export function ComplianceByServiceCard({ serviceData }: { serviceData: any[] }) {
  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold text-gray-600">Compliance by Service</CardTitle>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        {serviceData.length > 0 ? serviceData.slice(0, 7).map((svc: any) => {
          const pct = svc.totalRequirements > 0 ? Math.round((svc.onTrack / svc.totalRequirements) * 100) : 0;
          const atRiskCount = svc.atRisk + svc.outOfCompliance;
          return (
            <div key={svc.serviceTypeName} className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-[13px] font-medium text-gray-800">{svc.serviceTypeName}</span>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-gray-400">{svc.onTrack}/{svc.totalRequirements} on track</span>
                  {atRiskCount > 0 && <span className="text-red-500 font-medium">{atRiskCount} at risk</span>}
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444",
                  }}
                />
              </div>
            </div>
          );
        }) : (
          <Skeleton className="w-full h-40" />
        )}
      </CardContent>
    </Card>
  );
}

export function RecentAlertsCard({ recent }: { recent: any[] }) {
  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-0 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-gray-600">Recent Alerts</CardTitle>
        <Link href="/alerts" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View all</Link>
      </CardHeader>
      <CardContent className="pt-4 space-y-2">
        {recent.length > 0 ? recent.map((a: any) => (
          <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50/60 hover:bg-gray-50 transition-colors">
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
              a.severity === "critical" ? "bg-red-500" :
              a.severity === "high" ? "bg-amber-400" : "bg-gray-300"
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-gray-800 truncate">{a.studentName ?? "System Alert"}</p>
              <p className="text-[12px] text-gray-400 mt-0.5 line-clamp-1">{a.message}</p>
            </div>
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${
              a.severity === "critical" ? "bg-red-50 text-red-600" :
              a.severity === "high" ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-500"
            }`}>{a.severity}</span>
          </div>
        )) : (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="w-full h-14" />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
