import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { WorkflowSummary, STAGE_LABELS } from "./types";
import { AgingBadge, StageBadge } from "./shared";

interface Props {
  summary: WorkflowSummary;
  agingExpanded: boolean;
  onToggleAging: () => void;
}

export function WorkflowSummaryPanel({ summary, agingExpanded, onToggleAging }: Props) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Active</p>
                <p className="text-2xl font-bold text-blue-900">{summary.totalActive}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-600 font-medium">Completed</p>
                <p className="text-2xl font-bold text-emerald-900">{summary.totalCompleted}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">Rejected</p>
                <p className="text-2xl font-bold text-red-900">{summary.totalRejected}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-gray-600 font-medium mb-2">By Stage</p>
            {Object.keys(summary.byStage).length === 0 ? (
              <p className="text-xs text-gray-400">No active workflows</p>
            ) : (
              <div className="space-y-1">
                {Object.entries(summary.byStage).map(([stage, count]) => (
                  <div key={stage} className="flex justify-between text-xs">
                    <span className="text-gray-600">{STAGE_LABELS[stage] || stage}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {summary.aging.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2 pt-3">
            <button onClick={onToggleAging} className="flex items-center gap-2 w-full">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <CardTitle className="text-sm text-amber-800">
                Aging Workflows ({summary.aging.length})
              </CardTitle>
              <span className="text-xs text-amber-600 ml-1">Stalled 3+ days in current stage</span>
              {agingExpanded ? <ChevronUp className="w-3 h-3 text-amber-500 ml-auto" /> : <ChevronDown className="w-3 h-3 text-amber-500 ml-auto" />}
            </button>
          </CardHeader>
          {agingExpanded && (
            <CardContent className="pt-0 pb-3">
              <div className="space-y-1.5">
                {summary.aging.map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs px-2 py-1.5 bg-white rounded border border-amber-100">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 truncate max-w-[200px]">{a.title}</span>
                      <StageBadge stage={a.currentStage} />
                    </div>
                    <AgingBadge days={a.daysInStage} />
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </>
  );
}
