import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Target } from "lucide-react";
import type { EditForm, GoalFormEntry } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  editForm: EditForm;
  setEditForm: React.Dispatch<React.SetStateAction<EditForm>>;
  missedReasonsList: any[];
  editGoalEntries: GoalFormEntry[];
  setEditGoalEntries: React.Dispatch<React.SetStateAction<GoalFormEntry[]>>;
  editGoalsLoading: boolean;
  editSaving: boolean;
  onSave: () => void;
};

export function EditSessionDialog({
  open, onClose, editForm, setEditForm, missedReasonsList,
  editGoalEntries, setEditGoalEntries, editGoalsLoading, editSaving, onSave,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Edit Session</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Duration (min)</Label>
              <Input type="number" className="h-9 text-[13px]" value={editForm.durationMinutes} onChange={e => setEditForm(p => ({ ...p, durationMinutes: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Status</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {editForm.status === "missed" && (
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Missed Reason *</Label>
              <Select value={editForm.missedReasonId} onValueChange={v => setEditForm(p => ({ ...p, missedReasonId: v }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {missedReasonsList.map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-[12px] text-gray-500">Location</Label>
            <Input className="h-9 text-[13px]" value={editForm.location} onChange={e => setEditForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Room 204" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-gray-500">Notes</Label>
            <Textarea className="text-[13px] resize-none" rows={3} value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          {editGoalsLoading ? (
            <div className="text-[12px] text-slate-400 py-2">Loading IEP goals...</div>
          ) : editGoalEntries.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[12px] text-slate-500 flex items-center gap-1"><Target className="w-3.5 h-3.5" /> IEP Goals Addressed</Label>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {editGoalEntries.map((g, idx) => (
                  <div key={g.iepGoalId} className={`border rounded-lg p-2 ${g.selected ? "border-indigo-300 bg-indigo-50/30" : "border-slate-200"}`}>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={g.selected} onChange={() => setEditGoalEntries(prev => prev.map((ge, i) => i === idx ? { ...ge, selected: !ge.selected } : ge))} className="mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-slate-700 truncate">{g.goalArea}</div>
                        <div className="text-[11px] text-slate-500 truncate">{g.annualGoal}</div>
                        {g.linkedTarget && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${g.linkedTarget.type === "behavior" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{g.linkedTarget.type}: {g.linkedTarget.name}</span>}
                      </div>
                    </label>
                    {g.selected && g.behaviorData && (
                      <div className="mt-2 pl-6 grid grid-cols-2 gap-2">
                        <div><Label className="text-[10px] text-amber-600">Value *</Label><Input type="number" className="h-7 text-[12px]" value={g.behaviorData.value} onChange={e => setEditGoalEntries(prev => prev.map((ge, i) => i === idx ? { ...ge, behaviorData: { ...ge.behaviorData!, value: e.target.value } } : ge))} /></div>
                        <div><Label className="text-[10px] text-amber-600">Intervals</Label><Input type="number" className="h-7 text-[12px]" value={g.behaviorData.intervalCount} onChange={e => setEditGoalEntries(prev => prev.map((ge, i) => i === idx ? { ...ge, behaviorData: { ...ge.behaviorData!, intervalCount: e.target.value } } : ge))} /></div>
                      </div>
                    )}
                    {g.selected && g.programData && (
                      <div className="mt-2 pl-6 grid grid-cols-3 gap-2">
                        <div><Label className="text-[10px] text-blue-600">Correct</Label><Input type="number" className="h-7 text-[12px]" value={g.programData.trialsCorrect} onChange={e => setEditGoalEntries(prev => prev.map((ge, i) => i === idx ? { ...ge, programData: { ...ge.programData!, trialsCorrect: e.target.value } } : ge))} /></div>
                        <div><Label className="text-[10px] text-blue-600">Total</Label><Input type="number" className="h-7 text-[12px]" value={g.programData.trialsTotal} onChange={e => setEditGoalEntries(prev => prev.map((ge, i) => i === idx ? { ...ge, programData: { ...ge.programData!, trialsTotal: e.target.value } } : ge))} /></div>
                        <div><Label className="text-[10px] text-blue-600">Prompt</Label><Input className="h-7 text-[12px]" value={g.programData.promptLevelUsed} onChange={e => setEditGoalEntries(prev => prev.map((ge, i) => i === idx ? { ...ge, programData: { ...ge.programData!, promptLevelUsed: e.target.value } } : ge))} /></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="text-[12px]" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] gap-1" disabled={editSaving} onClick={onSave}>
            <Save className="w-3.5 h-3.5" /> {editSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
