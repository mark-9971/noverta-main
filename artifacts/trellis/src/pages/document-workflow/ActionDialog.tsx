import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { ActionType } from "./types";

interface Props {
  actionDialog: { type: ActionType; workflowId: number } | null;
  actionComment: string;
  actionLoading: boolean;
  onCommentChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function ActionDialog({ actionDialog, actionComment, actionLoading, onCommentChange, onClose, onSubmit }: Props) {
  return (
    <Dialog open={!!actionDialog} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {actionDialog?.type === "approve" ? "Approve Stage" : actionDialog?.type === "reject" ? "Reject Workflow" : "Request Changes"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {actionDialog?.type === "reject" && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">Rejecting will stop the entire workflow. The document will need a new workflow to proceed.</p>
            </div>
          )}
          <div>
            <Label>Comment {actionDialog?.type === "request_changes" && <span className="text-red-500">*</span>}</Label>
            <textarea
              className="w-full mt-1 border rounded-lg p-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={actionComment}
              onChange={e => onCommentChange(e.target.value)}
              placeholder={actionDialog?.type === "request_changes" ? "Describe the changes needed..." : "Optional comment..."}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={onSubmit}
            disabled={actionLoading || (actionDialog?.type === "request_changes" && !actionComment.trim())}
            className={actionDialog?.type === "reject" ? "bg-red-600 hover:bg-red-700" : actionDialog?.type === "request_changes" ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}
          >
            {actionLoading ? "Processing..." : actionDialog?.type === "approve" ? "Approve" : actionDialog?.type === "reject" ? "Reject" : "Request Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
