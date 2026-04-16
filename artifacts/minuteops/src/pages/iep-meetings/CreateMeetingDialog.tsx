import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { StudentOption } from "./types";
import { MEETING_TYPES, FORMAT_LABELS } from "./constants";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: StudentOption[];
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function CreateMeetingDialog({ open, onOpenChange, students, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Schedule IEP Meeting</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Student</Label>
            <Select name="studentId">
              <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
              <SelectContent>
                {students.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}{s.grade ? ` (${s.grade})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Meeting Type</Label>
              <Select name="meetingType" defaultValue="annual_review">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MEETING_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Format</Label>
              <Select name="meetingFormat" defaultValue="in_person">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date</Label><Input type="date" name="scheduledDate" required /></div>
            <div><Label>Time</Label><Input type="time" name="scheduledTime" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Duration (min)</Label><Input type="number" name="duration" placeholder="60" /></div>
            <div><Label>Location</Label><Input name="location" placeholder="Room 204" /></div>
          </div>
          <div><Label>Notes</Label><Textarea name="notes" rows={2} placeholder="Meeting agenda or notes..." /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Schedule</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
