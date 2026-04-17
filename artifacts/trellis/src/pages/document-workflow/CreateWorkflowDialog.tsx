import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, UserPlus, Plus, XCircle } from "lucide-react";
import { ReviewerAssignment, ALL_STAGES } from "./types";

interface CreateForm {
  documentType: string;
  documentId: string;
  studentId: string;
  title: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CreateForm;
  onFormChange: (f: CreateForm) => void;
  stages: string[];
  onStagesChange: (s: string[]) => void;
  reviewers: ReviewerAssignment[];
  onReviewersChange: (r: ReviewerAssignment[]) => void;
  onSubmit: () => void;
}

export function CreateWorkflowDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  stages,
  onStagesChange,
  reviewers,
  onReviewersChange,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start Approval Workflow</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Document Type</Label>
            <Select value={form.documentType} onValueChange={v => onFormChange({ ...form, documentType: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="iep">IEP</SelectItem>
                <SelectItem value="evaluation">Evaluation</SelectItem>
                <SelectItem value="progress_report">Progress Report</SelectItem>
                <SelectItem value="prior_written_notice">Prior Written Notice</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Document ID</Label>
            <Input className="mt-1" type="number" value={form.documentId} onChange={e => onFormChange({ ...form, documentId: e.target.value })} placeholder="Enter document ID" />
          </div>
          <div>
            <Label>Student ID</Label>
            <Input className="mt-1" type="number" value={form.studentId} onChange={e => onFormChange({ ...form, studentId: e.target.value })} placeholder="Enter student ID" />
          </div>
          <div>
            <Label>Title</Label>
            <Input className="mt-1" value={form.title} onChange={e => onFormChange({ ...form, title: e.target.value })} placeholder="e.g. Annual IEP Review — Jane Doe" />
          </div>

          <div className="border-t pt-3">
            <Label className="flex items-center gap-1.5 mb-2">
              <Settings className="w-3.5 h-3.5" />
              Workflow Stages
            </Label>
            <p className="text-xs text-gray-400 mb-2">Select which stages this workflow should go through. At least one stage is required.</p>
            <div className="flex flex-wrap gap-2">
              {ALL_STAGES.map(stage => {
                const active = stages.includes(stage.value);
                return (
                  <button
                    key={stage.value}
                    type="button"
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300"}`}
                    onClick={() => {
                      if (active && stages.length <= 1) return;
                      onStagesChange(active ? stages.filter(v => v !== stage.value) : [...stages, stage.value]);
                    }}
                  >
                    {active ? "✓ " : ""}{stage.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                Stage Reviewers
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                onClick={() => onReviewersChange([...reviewers, { stage: "draft", userId: "", name: "" }])}
              >
                <Plus className="w-3 h-3 mr-1" /> Add Reviewer
              </Button>
            </div>
            {reviewers.length === 0 ? (
              <p className="text-xs text-gray-400">No reviewers assigned — any privileged staff can act on each stage.</p>
            ) : (
              <div className="space-y-2">
                {reviewers.map((rev, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <Select value={rev.stage} onValueChange={v => onReviewersChange(reviewers.map((item, i) => i === idx ? { ...item, stage: v } : item))}>
                      <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="team_review">Team Review</SelectItem>
                        <SelectItem value="director_signoff">Director Sign-off</SelectItem>
                        <SelectItem value="parent_delivery">Parent Delivery</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-7 text-xs flex-1"
                      value={rev.name}
                      onChange={e => onReviewersChange(reviewers.map((item, i) => i === idx ? { ...item, name: e.target.value } : item))}
                      placeholder="Reviewer name"
                    />
                    <Input
                      className="h-7 text-xs w-[100px]"
                      value={rev.userId}
                      onChange={e => onReviewersChange(reviewers.map((item, i) => i === idx ? { ...item, userId: e.target.value } : item))}
                      placeholder="User ID"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                      onClick={() => onReviewersChange(reviewers.filter((_, i) => i !== idx))}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={!form.documentId || !form.studentId || !form.title}>
            Start Workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
