import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PwnForm {
  studentId: string;
  meetingId: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: PwnForm;
  onFormChange: (f: PwnForm) => void;
  loading: boolean;
  onSubmit: () => void;
}

export function GeneratePwnDialog({ open, onOpenChange, form, onFormChange, loading, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Prior Written Notice</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500">
          Auto-generate a PWN from a student's IEP meeting data. The notice will be pre-populated with goals, team decisions, and required fields per 603 CMR 28.07(1).
        </p>
        <div className="space-y-3">
          <div>
            <Label>Student ID <span className="text-red-500">*</span></Label>
            <Input className="mt-1" type="number" value={form.studentId} onChange={e => onFormChange({ ...form, studentId: e.target.value })} placeholder="Enter student ID" />
          </div>
          <div>
            <Label>Meeting ID (optional)</Label>
            <Input className="mt-1" type="number" value={form.meetingId} onChange={e => onFormChange({ ...form, meetingId: e.target.value })} placeholder="Link to a specific IEP meeting" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={loading || !form.studentId}>
            {loading ? "Generating..." : "Generate PWN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
