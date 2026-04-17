import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReferralFormState } from "./types";

export function ReferralFormDialog({
  open, onOpenChange, isEditing, form, setForm, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isEditing: boolean;
  form: ReferralFormState;
  setForm: React.Dispatch<React.SetStateAction<ReferralFormState>>;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEditing ? "Edit Agency Referral" : "New Agency Referral"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Agency Name</Label>
              <Input className="form-input" value={form.agencyName} onChange={e => setForm(f => ({ ...f, agencyName: e.target.value }))} placeholder="e.g., MA Rehabilitation Commission" />
            </div>
            <div>
              <Label className="text-[12px]">Agency Type</Label>
              <Select value={form.agencyType || "__none"} onValueChange={v => setForm(f => ({ ...f, agencyType: v === "__none" ? "" : v }))}>
                <SelectTrigger className="form-select"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not specified</SelectItem>
                  <SelectItem value="vocational_rehabilitation">Vocational Rehabilitation</SelectItem>
                  <SelectItem value="adult_services">Adult Services</SelectItem>
                  <SelectItem value="mental_health">Mental Health</SelectItem>
                  <SelectItem value="housing">Housing</SelectItem>
                  <SelectItem value="employment">Employment Services</SelectItem>
                  <SelectItem value="post_secondary_education">Post-Secondary Education</SelectItem>
                  <SelectItem value="social_security">Social Security</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[12px]">Contact Name</Label>
              <Input className="form-input" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[12px]">Contact Phone</Label>
              <Input className="form-input" value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[12px]">Contact Email</Label>
              <Input className="form-input" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Referral Date</Label>
              <Input type="date" className="form-input" value={form.referralDate} onChange={e => setForm(f => ({ ...f, referralDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[12px]">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="form-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-[12px]">Follow-Up Date</Label>
            <Input type="date" className="form-input" value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))} />
          </div>
          <div>
            <Label className="text-[12px]">Outcome</Label>
            <textarea className="form-textarea w-full" rows={2} value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} />
          </div>
          <div>
            <Label className="text-[12px]">Notes</Label>
            <textarea className="form-textarea w-full" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-[13px]">Cancel</Button>
          <Button onClick={onSave} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[13px]" disabled={!form.agencyName || !form.referralDate}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
