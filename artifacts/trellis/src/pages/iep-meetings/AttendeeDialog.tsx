import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function AttendeeDialog({ open, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Attendee</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div><Label>Name</Label><Input name="name" required placeholder="Full name" /></div>
          <div>
            <Label>Role</Label>
            <Select name="role" defaultValue="team_member">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lea_representative">LEA Representative</SelectItem>
                <SelectItem value="special_education_teacher">Special Ed Teacher</SelectItem>
                <SelectItem value="general_education_teacher">General Ed Teacher</SelectItem>
                <SelectItem value="parent_guardian">Parent/Guardian</SelectItem>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="school_psychologist">School Psychologist</SelectItem>
                <SelectItem value="slp">SLP</SelectItem>
                <SelectItem value="ot">OT</SelectItem>
                <SelectItem value="pt">PT</SelectItem>
                <SelectItem value="bcba">BCBA</SelectItem>
                <SelectItem value="counselor">Counselor</SelectItem>
                <SelectItem value="interpreter">Interpreter</SelectItem>
                <SelectItem value="advocate">Advocate</SelectItem>
                <SelectItem value="team_member">Team Member</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Email</Label><Input name="email" type="email" placeholder="Optional" /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
