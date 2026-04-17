import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CONSENT_TYPES } from "./constants";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function ConsentDialog({ open, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Consent</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Consent Type</Label>
            <Select name="consentType" defaultValue="iep_implementation">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CONSENT_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Decision</Label>
            <Select name="decision" defaultValue="consent_given">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="consent_given">Consent Given</SelectItem>
                <SelectItem value="consent_refused">Consent Refused</SelectItem>
                <SelectItem value="partial_consent">Partial Consent</SelectItem>
                <SelectItem value="revoked">Consent Revoked</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Respondent Name</Label><Input name="respondentName" placeholder="Parent/Guardian name" /></div>
            <div><Label>Relationship</Label><Input name="respondentRelationship" placeholder="e.g., Mother" /></div>
          </div>
          <div><Label>Decision Date</Label><Input type="date" name="decisionDate" /></div>
          <div><Label>Notes</Label><Textarea name="notes" rows={2} placeholder="Additional notes..." /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Record</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
