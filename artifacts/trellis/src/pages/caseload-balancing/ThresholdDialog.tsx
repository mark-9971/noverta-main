import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editThresholds: Record<string, number>;
  setEditThresholds: (t: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  onApply: () => void;
  saving?: boolean;
}

export function ThresholdDialog({ open, onOpenChange, editThresholds, setEditThresholds, onApply, saving }: Props) {
  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure Caseload Thresholds</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Set the maximum number of students per provider for each role. Changes are saved to the database and persist across sessions.</p>
          {Object.entries(editThresholds).map(([role, value]) => (
            <div key={role} className="flex items-center gap-3">
              <Label className="w-32 text-sm">{ROLE_LABELS[role] || role}</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={value}
                onChange={e => setEditThresholds(t => ({ ...t, [role]: parseInt(e.target.value, 10) || 1 }))}
                className="w-24"
                disabled={saving}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={onApply} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
