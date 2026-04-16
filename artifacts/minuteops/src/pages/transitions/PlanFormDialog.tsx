import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PlanFormState, StudentOption } from "./types";

export function PlanFormDialog({
  open, onOpenChange, isEditing, students, form, setForm, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isEditing: boolean;
  students: StudentOption[];
  form: PlanFormState;
  setForm: React.Dispatch<React.SetStateAction<PlanFormState>>;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEditing ? "Edit Transition Plan" : "New Transition Plan"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!isEditing && (
            <div>
              <Label className="text-[12px]">Student</Label>
              <Select value={form.studentId} onValueChange={v => setForm(f => ({ ...f, studentId: v }))}>
                <SelectTrigger className="form-select"><SelectValue placeholder="Select student..." /></SelectTrigger>
                <SelectContent>
                  {students.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}{s.grade ? ` (${s.grade})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Plan Date</Label>
              <Input type="date" className="form-input" value={form.planDate} onChange={e => setForm(f => ({ ...f, planDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[12px]">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="form-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-[12px]">Student Vision Statement</Label>
            <textarea className="form-textarea w-full" rows={2} value={form.studentVisionStatement} onChange={e => setForm(f => ({ ...f, studentVisionStatement: e.target.value }))} placeholder="Student's own words about their future..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Graduation Pathway</Label>
              <Select value={form.graduationPathway || "__none"} onValueChange={v => setForm(f => ({ ...f, graduationPathway: v === "__none" ? "" : v }))}>
                <SelectTrigger className="form-select"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not specified</SelectItem>
                  <SelectItem value="standard_diploma">Standard Diploma</SelectItem>
                  <SelectItem value="certificate_of_attainment">Certificate of Attainment</SelectItem>
                  <SelectItem value="certificate_of_completion">Certificate of Completion</SelectItem>
                  <SelectItem value="ged">GED</SelectItem>
                  <SelectItem value="vocational">Vocational Pathway</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">Expected Graduation</Label>
              <Input type="date" className="form-input" value={form.expectedGraduationDate} onChange={e => setForm(f => ({ ...f, expectedGraduationDate: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Credits Earned</Label>
              <Input className="form-input" value={form.creditsEarned} onChange={e => setForm(f => ({ ...f, creditsEarned: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[12px]">Credits Required</Label>
              <Input className="form-input" value={form.creditsRequired} onChange={e => setForm(f => ({ ...f, creditsRequired: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-[12px]">Assessments Used</Label>
            <Input className="form-input" value={form.assessmentsUsed} onChange={e => setForm(f => ({ ...f, assessmentsUsed: e.target.value }))} placeholder="e.g., Career Interest Inventory, ASVAB" />
          </div>
          <div>
            <Label className="text-[12px]">Notes</Label>
            <textarea className="form-textarea w-full" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-[13px]">Cancel</Button>
          <Button onClick={onSave} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[13px]" disabled={!form.studentId || !form.planDate}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
