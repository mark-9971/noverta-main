import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Gift, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { STATUS_CONFIG, formatDate } from "./types";
import type { Obligation } from "./types";
import { LogCompSessionForm } from "./LogCompSessionForm";

export function ObligationList({
  obligations,
  loading,
  expandedId,
  expandedDetail,
  expandedLoading,
  showLogSession,
  onToggleExpanded,
  onUpdateStatus,
  onShowLog,
  onCloseLog,
  onLogged,
}: {
  obligations: Obligation[];
  loading: boolean;
  expandedId: number | null;
  expandedDetail: any;
  expandedLoading: boolean;
  showLogSession: number | null;
  onToggleExpanded: (id: number) => void;
  onUpdateStatus: (id: number, status: string) => void;
  onShowLog: (id: number) => void;
  onCloseLog: () => void;
  onLogged: (id: number) => void;
}) {
  if (loading) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="w-full h-20" />)}</div>;
  }

  if (obligations.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Gift className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No compensatory obligations found</p>
          <p className="text-gray-400 text-sm mt-1">Use the calculator to identify shortfalls or add obligations manually</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {obligations.map(ob => {
        const cfg = STATUS_CONFIG[ob.status] || STATUS_CONFIG.pending;
        const Icon = cfg.icon;
        const pct = ob.minutesOwed > 0 ? Math.round((ob.minutesDelivered / ob.minutesOwed) * 100) : 0;
        const isExpanded = expandedId === ob.id;

        return (
          <Card key={ob.id} className="overflow-hidden">
            <div
              className="p-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
              onClick={() => onToggleExpanded(ob.id)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cfg.bg}`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/students/${ob.studentId}`} onClick={(e: any) => e.stopPropagation()} className="text-sm font-semibold text-gray-800 hover:text-emerald-700">
                      {ob.studentName || `Student #${ob.studentId}`}
                    </Link>
                    {ob.serviceTypeName && (
                      <span className="text-xs text-gray-400">{ob.serviceTypeName}</span>
                    )}
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(ob.periodStart)} - {formatDate(ob.periodEnd)}
                    {ob.source === "auto_calculated" && " · Auto-generated"}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-800">{ob.minutesRemaining} <span className="text-xs font-normal text-gray-400">min remaining</span></p>
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{ob.minutesDelivered}/{ob.minutesOwed} delivered</p>
                </div>
                <div className="flex-shrink-0">
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-gray-100 p-4 bg-gray-50/30 space-y-4">
                {expandedLoading ? (
                  <Skeleton className="w-full h-32" />
                ) : expandedDetail ? (
                  <>
                    {expandedDetail.notes && (
                      <p className="text-xs text-gray-500 bg-white p-3 rounded-lg border border-gray-100">{expandedDetail.notes}</p>
                    )}
                    {(expandedDetail.agreedDate || expandedDetail.agreedWith) && (
                      <div className="flex gap-4 text-xs text-gray-500">
                        {expandedDetail.agreedDate && <span>Agreed: {formatDate(expandedDetail.agreedDate)}</span>}
                        {expandedDetail.agreedWith && <span>With: {expandedDetail.agreedWith}</span>}
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      {ob.status !== "completed" && ob.status !== "waived" && (
                        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => onShowLog(ob.id)}>
                          <Plus className="w-3 h-3" /> Log Comp Session
                        </Button>
                      )}
                      {ob.status === "pending" && (
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => onUpdateStatus(ob.id, "in_progress")}>
                          Mark In Progress
                        </Button>
                      )}
                      {ob.status !== "waived" && ob.status !== "completed" && (
                        <Button size="sm" variant="outline" className="text-xs text-gray-400" onClick={() => onUpdateStatus(ob.id, "waived")}>
                          Waive
                        </Button>
                      )}
                    </div>

                    {showLogSession === ob.id && (
                      <LogCompSessionForm
                        obligationId={ob.id}
                        onClose={onCloseLog}
                        onLogged={() => onLogged(ob.id)}
                      />
                    )}

                    {expandedDetail.sessions && expandedDetail.sessions.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">Comp Sessions Logged</p>
                        <div className="space-y-1">
                          {expandedDetail.sessions.map((sess: any) => (
                            <div key={sess.id} className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-gray-100">
                              <div>
                                <span className="font-medium text-gray-700">{formatDate(sess.sessionDate)}</span>
                                {sess.staffName && <span className="text-gray-400 ml-2">{sess.staffName}</span>}
                                {sess.serviceTypeName && <span className="text-gray-400 ml-2">· {sess.serviceTypeName}</span>}
                              </div>
                              <span className="font-bold text-emerald-700">{sess.durationMinutes} min</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400">Failed to load details</p>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
