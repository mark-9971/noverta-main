import { useState } from "react";
import { useListAlerts, useResolveAlert } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSchoolContext } from "@/lib/school-context";

const SEVERITY_CONFIG: Record<string, { dot: string; bg: string; color: string }> = {
  critical: { dot: "bg-red-500", bg: "bg-red-50/60 border-red-100", color: "text-red-700" },
  high: { dot: "bg-amber-400", bg: "bg-amber-50/60 border-amber-100", color: "text-amber-700" },
  medium: { dot: "bg-yellow-400", bg: "bg-yellow-50/60 border-yellow-100", color: "text-yellow-700" },
  low: { dot: "bg-blue-400", bg: "bg-blue-50/60 border-blue-100", color: "text-blue-600" },
};

export default function Alerts() {
  const [showResolved, setShowResolved] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [resolveConfirm, setResolveConfirm] = useState<any>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState(false);

  const { filterParams } = useSchoolContext();
  const { data: alerts, isLoading, isError, refetch } = useListAlerts({ resolved: showResolved ? "true" : "false", ...filterParams } as any);
  const { mutateAsync: resolveAlert } = useResolveAlert();

  const alertList = (alerts as any[]) ?? [];
  const filtered = alertList.filter(a => severityFilter === "all" || a.severity === severityFilter);

  const counts = alertList.reduce((acc: any, a: any) => {
    acc[a.severity] = (acc[a.severity] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  async function handleResolveConfirmed() {
    if (!resolveConfirm) return;
    setResolving(true);
    try {
      await resolveAlert({ id: resolveConfirm.id, resolveAlertBody: { resolvedNote: resolveNote || "Resolved from dashboard" } } as any);
      toast.success("Alert resolved");
      setResolveConfirm(null);
      setResolveNote("");
      refetch();
    } catch {
      toast.error("Failed to resolve alert");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4 md:space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Alerts</h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            {showResolved ? "Resolved alerts" : `${alertList.length} open alerts`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-[12px] h-8" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant={showResolved ? "default" : "outline"} size="sm" className="text-[12px] h-8" onClick={() => setShowResolved(!showResolved)}>
            <CheckCircle className="w-3.5 h-3.5 mr-1" />
            {showResolved ? "Open" : "Resolved"}
          </Button>
        </div>
      </div>

      {!showResolved && (
        <div className="flex gap-2 flex-wrap">
          <button
            aria-pressed={severityFilter === "all"}
            onClick={() => setSeverityFilter("all")}
            className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              severityFilter === "all" ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200"
            }`}
          >All ({alertList.length})</button>
          {["critical", "high", "medium", "low"].map(sev => {
            const cfg = SEVERITY_CONFIG[sev];
            return (
              <button
                key={sev}
                aria-pressed={severityFilter === sev}
                onClick={() => setSeverityFilter(severityFilter === sev ? "all" : sev)}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all flex items-center gap-1.5 ${
                  severityFilter === sev ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${severityFilter === sev ? "bg-white" : cfg.dot}`} />
                {sev.charAt(0).toUpperCase() + sev.slice(1)} ({counts[sev] ?? 0})
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        {isError ? (
          <ErrorBanner message="Failed to load alerts." onRetry={() => refetch()} />
        ) : isLoading ? (
          [...Array(6)].map((_, i) => <Skeleton key={i} className="w-full h-20 rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-300" />
            <p className="font-medium">No alerts found</p>
            <p className="text-sm mt-1">All compliance checks are passing</p>
          </div>
        ) : filtered.map((a: any) => {
          const cfg = SEVERITY_CONFIG[a.severity] ?? SEVERITY_CONFIG.low;
          return (
            <Card key={a.id} className={`border ${cfg.bg} transition-all`}>
              <div className="flex items-start gap-3 p-4">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${cfg.color}`}>{a.severity}</span>
                    <span className="text-[11px] text-slate-400 bg-white/60 px-1.5 py-0.5 rounded">{a.type?.replace(/_/g, " ")}</span>
                    {a.studentName && <span className="text-[12px] font-medium text-slate-700">{a.studentName}</span>}
                  </div>
                  <p className="text-[13px] text-slate-700 mt-1">{a.message}</p>
                  {a.suggestedAction && <p className="text-[12px] text-slate-400 mt-0.5 italic">{a.suggestedAction}</p>}
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                {!a.resolved && (
                  <Button size="sm" variant="outline" className="flex-shrink-0 text-[11px] h-7 bg-white/80 hover:bg-white" onClick={() => { setResolveConfirm(a); setResolveNote(""); }}>
                    Resolve
                  </Button>
                )}
                {a.resolved && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 flex-shrink-0">Resolved</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={resolveConfirm !== null} onOpenChange={(open) => { if (!open) setResolveConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve Alert</AlertDialogTitle>
            <AlertDialogDescription>
              {resolveConfirm && <>
                <span className="font-medium text-slate-700">{resolveConfirm.severity?.toUpperCase()}</span>
                {" — "}
                {resolveConfirm.message}
              </>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-slate-500">Resolution note (optional)</Label>
            <Textarea className="text-[13px] resize-none" rows={2} value={resolveNote} onChange={e => setResolveNote(e.target.value)} placeholder="What was done to resolve this..." />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolveConfirmed} disabled={resolving}>
              {resolving ? "Resolving..." : "Confirm Resolve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
