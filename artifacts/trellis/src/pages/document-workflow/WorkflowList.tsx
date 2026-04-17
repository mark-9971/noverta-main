import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, ArrowRight } from "lucide-react";
import { Workflow } from "./types";
import { AgingBadge, StatusBadge, StageProgress, daysAgo, formatDate } from "./shared";

interface Props {
  workflows: Workflow[];
  loading: boolean;
  filterStatus: string;
  filterStage: string;
  onFilterStatusChange: (v: string) => void;
  onFilterStageChange: (v: string) => void;
  onOpenDetail: (wf: Workflow) => void;
}

export function WorkflowList({
  workflows,
  loading,
  filterStatus,
  filterStage,
  onFilterStatusChange,
  onFilterStageChange,
  onOpenDetail,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Approval Workflows</CardTitle>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={onFilterStatusChange}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStage} onValueChange={onFilterStageChange}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="team_review">Team Review</SelectItem>
                <SelectItem value="director_signoff">Director Sign-off</SelectItem>
                <SelectItem value="parent_delivery">Parent Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No workflows found</p>
            <p className="text-sm text-gray-400 mt-1">Start a workflow to route a document through review and approval</p>
          </div>
        ) : (
          <div className="divide-y">
            {workflows.map(wf => {
              const days = wf.status === "in_progress" ? daysAgo(wf.updatedAt) : 0;
              return (
                <button
                  key={wf.id}
                  onClick={() => onOpenDetail(wf)}
                  className="w-full text-left py-3 px-2 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{wf.title}</span>
                        <StatusBadge status={wf.status} />
                        {days >= 3 && <AgingBadge days={days} />}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{wf.studentFirstName} {wf.studentLastName}</span>
                        <span className="text-gray-300">|</span>
                        <span className="capitalize">{wf.documentType.replace(/_/g, " ")}</span>
                        <span className="text-gray-300">|</span>
                        <span>Started {formatDate(wf.createdAt)} by {wf.createdByName}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-4">
                      <StageProgress stages={wf.stages} currentStage={wf.currentStage} status={wf.status} />
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
