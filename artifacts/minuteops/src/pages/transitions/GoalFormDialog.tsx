import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GoalFormState } from "./types";

export function GoalFormDialog({
  open, onOpenChange, isEditing, form, setForm, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isEditing: boolean;
  form: GoalFormState;
  setForm: React.Dispatch<React.SetStateAction<GoalFormState>>;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEditing ? "Edit Transition Goal" : "New Transition Goal"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">Domain</Label>
            <Select value={form.domain} onValueChange={v => setForm(f => ({ ...f, domain: v }))}>
              <SelectTrigger className="form-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="education">Post-Secondary Education</SelectItem>
                <SelectItem value="employment">Employment</SelectItem>
                <SelectItem value="independent_living">Independent Living</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[12px]">Goal Statement</Label>
            <textarea className="form-textarea w-full" rows={3} value={form.goalStatement} onChange={e => setForm(f => ({ ...f, goalStatement: e.target.value }))} placeholder="Within one year of graduation, the student will..." />
          </div>
          <div>
            <Label className="text-[12px]">Measurable Criteria</Label>
            <textarea className="form-textarea w-full" rows={2} value={form.measurableCriteria} onChange={e => setForm(f => ({ ...f, measurableCriteria: e.target.value }))} placeholder="How will progress be measured?" />
          </div>
          <div>
            <Label className="text-[12px]">Activities / Steps</Label>
            <textarea className="form-textarea w-full" rows={2} value={form.activities} onChange={e => setForm(f => ({ ...f, activities: e.target.value }))} placeholder="Transition activities to support this goal..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Responsible Party</Label>
              <Input className="form-input" value={form.responsibleParty} onChange={e => setForm(f => ({ ...f, responsibleParty: e.target.value }))} placeholder="e.g., Student, Teacher, VR" />
            </div>
            <div>
              <Label className="text-[12px]">Target Date</Label>
              <Input type="date" className="form-input" value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="form-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-[12px]">Progress Notes</Label>
            <textarea className="form-textarea w-full" rows={2} value={form.progressNotes} onChange={e => setForm(f => ({ ...f, progressNotes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-[13px]">Cancel</Button>
          <Button onClick={onSave} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[13px]" disabled={!form.goalStatement}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
