import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDataT, StaffOption, SchoolOption, ServiceTypeOption, WEEKDAYS, WEEKDAY_LABELS } from "./types";

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  editing: boolean;
  formData: FormDataT;
  setFormData: (updater: (p: FormDataT) => FormDataT) => void;
  staffList: StaffOption[];
  schoolList: SchoolOption[];
  serviceTypeList: ServiceTypeOption[];
  saving: boolean;
  onSave: () => void;
}

export function ScheduleFormDialog({ open, setOpen, editing, formData, setFormData, staffList, schoolList, serviceTypeList, saving, onSave }: Props) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Schedule" : "Add Schedule Entry"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Staff Member</Label>
            <Select value={formData.staffId} onValueChange={v => setFormData(p => ({ ...p, staffId: v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select staff..." /></SelectTrigger>
              <SelectContent>
                {staffList.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName} ({s.role})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">School / Building</Label>
            <Select value={formData.schoolId} onValueChange={v => setFormData(p => ({ ...p, schoolId: v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select school..." /></SelectTrigger>
              <SelectContent>
                {schoolList.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Service Type</Label>
            <Select value={formData.serviceTypeId || "none"} onValueChange={v => setFormData(p => ({ ...p, serviceTypeId: v === "none" ? "" : v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select service type..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {serviceTypeList.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Day of Week</Label>
            <Select value={formData.dayOfWeek} onValueChange={v => setFormData(p => ({ ...p, dayOfWeek: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map(d => <SelectItem key={d} value={d}>{WEEKDAY_LABELS[d]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start Time</Label>
              <Input type="time" value={formData.startTime} onChange={e => setFormData(p => ({ ...p, startTime: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">End Time</Label>
              <Input type="time" value={formData.endTime} onChange={e => setFormData(p => ({ ...p, endTime: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Label (optional)</Label>
            <Input value={formData.label} onChange={e => setFormData(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Morning Block" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Effective From (optional)</Label>
              <Input type="date" value={formData.effectiveFrom} onChange={e => setFormData(p => ({ ...p, effectiveFrom: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Effective To (optional)</Label>
              <Input type="date" value={formData.effectiveTo} onChange={e => setFormData(p => ({ ...p, effectiveTo: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional notes..." className="mt-1" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving..." : editing ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
