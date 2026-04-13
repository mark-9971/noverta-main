import { useState } from "react";
import { useListAlerts, useResolveAlert } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, RefreshCw } from "lucide-react";

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  critical: { color: "text-red-700", bg: "bg-red-50 border-red-200", dot: "bg-red-500" },
  high: { color: "text-orange-700", bg: "bg-orange-50 border-orange-200", dot: "bg-orange-500" },
  medium: { color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200", dot: "bg-yellow-500" },
  low: { color: "text-blue-700", bg: "bg-blue-50 border-blue-200", dot: "bg-blue-400" },
};

export default function Alerts() {
  const [showResolved, setShowResolved] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const { data: alerts, isLoading, refetch } = useListAlerts({ resolved: showResolved ? "true" : "false" } as any);
  const { mutateAsync: resolveAlert } = useResolveAlert();

  const alertList = (alerts as any[]) ?? [];
  const filtered = alertList.filter(a =>
    severityFilter === "all" || a.severity === severityFilter
  );

  const counts = alertList.reduce((acc: any, a: any) => {
    acc[a.severity] = (acc[a.severity] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  async function handleResolve(id: number) {
    await resolveAlert({ id, resolveAlertBody: { resolvedNote: "Resolved from dashboard" } } as any);
    refetch();
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Compliance Alerts</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {showResolved ? "Showing resolved alerts" : `${alertList.length} open alerts require attention`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button
            variant={showResolved ? "default" : "outline"}
            size="sm"
            onClick={() => setShowResolved(!showResolved)}
          >
            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            {showResolved ? "Show Open" : "Show Resolved"}
          </Button>
        </div>
      </div>

      {/* Severity summary cards */}
      {!showResolved && (
        <div className="grid grid-cols-4 gap-3">
          {["critical", "high", "medium", "low"].map(severity => {
            const cfg = SEVERITY_CONFIG[severity];
            return (
              <button
                key={severity}
                onClick={() => setSeverityFilter(severityFilter === severity ? "all" : severity)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  severityFilter === severity ? `${cfg.bg} border-current` : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{severity}</span>
                </div>
                <p className={`text-xl font-bold ${cfg.color}`}>{counts[severity] ?? 0}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Alerts list */}
      <div className="space-y-2">
        {isLoading ? (
          [...Array(6)].map((_, i) => <Skeleton key={i} className="w-full h-20" />)
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-300" />
            <p className="font-medium">No alerts found</p>
            <p className="text-sm mt-1">All compliance checks are passing!</p>
          </div>
        ) : filtered.map((a: any) => {
          const cfg = SEVERITY_CONFIG[a.severity] ?? SEVERITY_CONFIG.low;
          return (
            <div key={a.id} className={`flex items-start gap-3 p-3.5 rounded-lg border ${cfg.bg} transition-all`}>
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold uppercase tracking-wide ${cfg.color}`}>{a.severity}</span>
                  <span className="text-xs text-slate-500 bg-white/60 px-1.5 py-0.5 rounded border border-slate-200">{a.type?.replace(/_/g, " ")}</span>
                  {a.studentName && (
                    <span className="text-xs font-medium text-slate-700">{a.studentName}</span>
                  )}
                </div>
                <p className="text-sm text-slate-700 mt-0.5">{a.message}</p>
                {a.suggestedAction && (
                  <p className="text-xs text-slate-500 mt-0.5 italic">{a.suggestedAction}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
              {!a.resolved && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-shrink-0 h-7 text-xs border-slate-300 bg-white/80 hover:bg-white"
                  onClick={() => handleResolve(a.id)}
                >
                  Resolve
                </Button>
              )}
              {a.resolved && (
                <Badge className="bg-green-100 text-green-700 text-[10px] flex-shrink-0">Resolved</Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
