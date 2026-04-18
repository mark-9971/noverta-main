import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { ProviderCaseload, ProviderStudent } from "./types";

interface IncompatibleService { serviceTypeId: number; serviceTypeName: string; }

interface Props {
  reassignDialog: { student: ProviderStudent; fromProvider: ProviderCaseload } | null;
  onClose: () => void;
  reassignTarget: string;
  setReassignTarget: (v: string) => void;
  eligibleTargets: ProviderCaseload[];
  reassigning: boolean;
  onConfirm: () => void;
  incompatibleServices: IncompatibleService[];
  isAdmin: boolean;
  onOverrideConfirm: () => void;
}

export function ReassignDialog({
  reassignDialog, onClose, reassignTarget, setReassignTarget, eligibleTargets, reassigning,
  onConfirm, incompatibleServices, isAdmin, onOverrideConfirm,
}: Props) {
  const hasIncompatibility = incompatibleServices.length > 0;

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

            {hasIncompatibility && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium">Service type mismatch</span>
                </div>
                <p className="text-xs text-amber-700">
                  The selected provider does not currently cover the following service
                  {incompatibleServices.length > 1 ? "s" : ""} required by this student:
                </p>
                <ul className="text-xs text-amber-800 space-y-0.5 pl-1">
                  {incompatibleServices.map(s => (
                    <li key={s.serviceTypeId} className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-amber-600 inline-block flex-shrink-0" />
                      {s.serviceTypeName}
                    </li>
                  ))}
                </ul>
                {isAdmin ? (
                  <p className="text-xs text-amber-600 pt-1">
                    As an admin, you can override this warning and proceed with the reassignment.
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 pt-1">
                    Please select a different provider who covers these service types.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {hasIncompatibility ? (
            isAdmin ? (
              <Button
                variant="destructive"
                onClick={onOverrideConfirm}
                disabled={!reassignTarget || reassigning}
              >
                {reassigning ? "Reassigning..." : "Override & Reassign"}
              </Button>
            ) : null
          ) : (
            <Button onClick={onConfirm} disabled={!reassignTarget || reassigning}>
              {reassigning ? "Reassigning..." : "Confirm Reassignment"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
