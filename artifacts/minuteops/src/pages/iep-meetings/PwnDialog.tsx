import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { NOTICE_TYPES } from "./constants";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function PwnDialog({ open, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Prior Written Notice (N1/N2)</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Notice Type</Label>
            <Select name="noticeType" defaultValue="propose_action">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(NOTICE_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Action Proposed/Refused</Label><Textarea name="actionProposed" required rows={2} placeholder="Describe the action..." /></div>
          <div><Label>Reason for Action</Label><Textarea name="reasonForAction" rows={2} placeholder="Why is this action proposed?" /></div>
          <div><Label>Options Considered</Label><Textarea name="optionsConsidered" rows={2} placeholder="Other options considered..." /></div>
          <div><Label>Why Options Rejected</Label><Textarea name="reasonOptionsRejected" rows={2} placeholder="Reason other options were rejected..." /></div>
          <div><Label>Evaluation Info</Label><Textarea name="evaluationInfo" rows={2} placeholder="Evaluation procedures, assessments, records..." /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Create Notice</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
