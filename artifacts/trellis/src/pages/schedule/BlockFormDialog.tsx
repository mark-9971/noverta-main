import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WEEKDAYS, WEEKDAY_LABELS } from "./constants";

export type BlockForm = {
  staffId: string; studentId: string; serviceTypeId: string;
  dayOfWeek: string; startTime: string; endTime: string;
  location: string; blockLabel?: string; notes: string;
  blockType: string; isRecurring: boolean; rotationDay: string;
  recurrenceType?: string; effectiveFrom?: string; effectiveTo?: string;
  /** T02 — non-user-editable carrier for the originating Action
   *  Center / Risk Report handling-row id when this form was opened
   *  from a Schedule Makeup deep-link. Persisted on
   *  schedule_blocks.source_action_item_id when the block is
   *  created. Null for ordinary block creation. */
  sourceActionItemId?: string | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  editingBlock: any | null;
  blockForm: BlockForm;
  setBlockForm: (updater: (f: BlockForm) => BlockForm) => void;
  staffList: any[];
  studentList: any[];
  serviceTypesList: any[];
  saving: boolean;
  onSave: () => void;
}

export function BlockFormDialog({
  open, onClose, editingBlock, blockForm, setBlockForm,
  staffList, studentList, serviceTypesList, saving, onSave,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-gray-800">
            {editingBlock ? "Edit Schedule Block" : "Add Schedule Block"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Staff</Label>
              <Select value={blockForm.staffId} onValueChange={v => setBlockForm(f => ({ ...f, staffId: v }))} disabled={!!editingBlock}>
                <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Select staff..." /></SelectTrigger>
                <SelectContent>
                  {staffList.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)} className="text-[13px]">{s.firstName} {s.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Student</Label>
              <Select value={blockForm.studentId} onValueChange={v => setBlockForm(f => ({ ...f, studentId: v }))}>
                <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Select student..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none" className="text-[13px]">None</SelectItem>
                  {studentList.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)} className="text-[13px]">{s.firstName} {s.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Service Type</Label>
              <Select value={blockForm.serviceTypeId} onValueChange={v => setBlockForm(f => ({ ...f, serviceTypeId: v }))} disabled={!!editingBlock}>
                <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {serviceTypesList.map((st: any) => (
                    <SelectItem key={st.id} value={String(st.id)} className="text-[13px]">{st.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">
                Day
                {editingBlock && <span className="text-[10px] text-emerald-600 ml-1 font-normal">editable</span>}
              </Label>
              <Select value={blockForm.dayOfWeek} onValueChange={v => setBlockForm(f => ({ ...f, dayOfWeek: v }))}>
                <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map(d => (
                    <SelectItem key={d} value={d} className="text-[13px]">{WEEKDAY_LABELS[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Start Time</Label>
              <Input type="time" value={blockForm.startTime} onChange={e => setBlockForm(f => ({ ...f, startTime: e.target.value }))} className="h-9 text-[13px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">End Time</Label>
              <Input type="time" value={blockForm.endTime} onChange={e => setBlockForm(f => ({ ...f, endTime: e.target.value }))} className="h-9 text-[13px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Location</Label>
              <Input value={blockForm.location} onChange={e => setBlockForm(f => ({ ...f, location: e.target.value }))} className="h-9 text-[13px]" placeholder="Room 101" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Block Label <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input value={blockForm.blockLabel ?? ""} onChange={e => setBlockForm(f => ({ ...f, blockLabel: e.target.value }))} className="h-9 text-[13px]" placeholder="e.g. Speech pullout" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Notes</Label>
              <Input value={blockForm.notes} onChange={e => setBlockForm(f => ({ ...f, notes: e.target.value }))} className="h-9 text-[13px]" placeholder="Optional notes..." />
            </div>
          </div>
          {editingBlock && blockForm.isRecurring && (() => {
            let sessionPreview = "";
            if (blockForm.effectiveFrom && blockForm.effectiveTo) {
              const from = new Date(blockForm.effectiveFrom + "T12:00:00");
              const to = new Date(blockForm.effectiveTo + "T12:00:00");
              const weeks = Math.max(0, Math.round((to.getTime() - from.getTime()) / (7 * 24 * 3600 * 1000)));
              const count = blockForm.recurrenceType === "biweekly" ? Math.ceil(weeks / 2) : weeks;
              sessionPreview = count > 0 ? `~${count} session${count !== 1 ? "s" : ""} in range` : "No sessions in range";
            } else if (blockForm.effectiveFrom && !blockForm.effectiveTo) {
              sessionPreview = `Ongoing from ${blockForm.effectiveFrom}`;
            } else if (!blockForm.effectiveFrom && blockForm.effectiveTo) {
              sessionPreview = `Until ${blockForm.effectiveTo}`;
            }
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[12px] font-medium text-gray-600">Recurrence</Label>
                  {sessionPreview && (
                    <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2 py-0.5">
                      {sessionPreview}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-gray-400">Frequency</Label>
                    <Select value={blockForm.recurrenceType ?? "weekly"} onValueChange={v => setBlockForm(f => ({ ...f, recurrenceType: v }))}>
                      <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly" className="text-[13px]">Weekly</SelectItem>
                        <SelectItem value="biweekly" className="text-[13px]">Biweekly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-gray-400">Effective From</Label>
                    <Input type="date" value={blockForm.effectiveFrom ?? ""} onChange={e => setBlockForm(f => ({ ...f, effectiveFrom: e.target.value }))} className="h-8 text-[13px]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-gray-400">Effective To</Label>
                    <Input type="date" value={blockForm.effectiveTo ?? ""} onChange={e => setBlockForm(f => ({ ...f, effectiveTo: e.target.value }))} className="h-8 text-[13px]" />
                  </div>
                </div>
              </div>
            );
          })()}
          {editingBlock && editingBlock.dayOfWeek !== blockForm.dayOfWeek && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-100 rounded-lg text-[12px] text-emerald-700">
              <span className="font-medium">Day change:</span> This recurring block will move from <span className="font-semibold">{WEEKDAY_LABELS[editingBlock.dayOfWeek] ?? editingBlock.dayOfWeek}</span> to <span className="font-semibold">{WEEKDAY_LABELS[blockForm.dayOfWeek] ?? blockForm.dayOfWeek}</span>. The change applies going forward.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? "Saving…" : editingBlock ? "Update Block" : "Create Block"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
