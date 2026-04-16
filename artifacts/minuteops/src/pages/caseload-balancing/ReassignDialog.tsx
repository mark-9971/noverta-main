import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProviderCaseload, ProviderStudent } from "./types";

interface Props {
  reassignDialog: { student: ProviderStudent; fromProvider: ProviderCaseload } | null;
  onClose: () => void;
  reassignTarget: string;
  setReassignTarget: (v: string) => void;
  eligibleTargets: ProviderCaseload[];
  reassigning: boolean;
  onConfirm: () => void;
}

export function ReassignDialog({
  reassignDialog, onClose, reassignTarget, setReassignTarget, eligibleTargets, reassigning, onConfirm,
}: Props) {
  return (
    <Dialog open={!!reassignDialog} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign Student</DialogTitle>
        </DialogHeader>
        {reassignDialog && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium">{reassignDialog.student.firstName} {reassignDialog.student.lastName}</p>
              <p className="text-xs text-gray-500">{reassignDialog.student.grade ? `Grade ${reassignDialog.student.grade}` : "No grade"}</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">From:</span>
              <span className="font-medium">{reassignDialog.fromProvider.firstName} {reassignDialog.fromProvider.lastName}</span>
              <Badge variant="outline" className="text-xs bg-red-50 text-red-600">
                {reassignDialog.fromProvider.studentCount}/{reassignDialog.fromProvider.threshold}
              </Badge>
            </div>
            <div>
              <Label className="text-sm">Reassign to:</Label>
              <Select value={reassignTarget} onValueChange={setReassignTarget}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select provider" /></SelectTrigger>
                <SelectContent>
                  {eligibleTargets.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.firstName} {t.lastName} ({t.studentCount}/{t.threshold}) — {t.schoolName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!reassignTarget || reassigning}>
            {reassigning ? "Reassigning..." : "Confirm Reassignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
