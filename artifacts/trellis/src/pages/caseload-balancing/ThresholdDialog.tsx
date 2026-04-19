import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS } from "./types";

export interface ThresholdLastModified {
  at: string;
  byUserId: string;
  byName: string | null;
  byRole: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editThresholds: Record<string, number>;
  setEditThresholds: (t: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  onApply: () => void;
  onReset?: () => void;
  saving?: boolean;
  resetting?: boolean;
  lastModified?: ThresholdLastModified | null;
}

function formatLastModified(lm: ThresholdLastModified): string {
  const date = new Date(lm.at);
  const when = date.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
  const who = lm.byName?.trim() || `User ${lm.byUserId.slice(-6)}`;
  return `Last updated ${when} by ${who}`;
}

export function ThresholdDialog({ open, onOpenChange, editThresholds, setEditThresholds, onApply, onReset, saving, resetting, lastModified }: Props) {
  const busy = saving || resetting;
  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure Caseload Thresholds</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Set the maximum number of students per provider for each role. Changes are saved to the database and persist across sessions.</p>
          {lastModified ? (
            <p className="text-xs text-gray-500 border-l-2 border-gray-200 pl-2" data-testid="threshold-last-modified">
              {formatLastModified(lastModified)}
            </p>
          ) : (
            <p className="text-xs text-gray-400 border-l-2 border-gray-200 pl-2" data-testid="threshold-last-modified-none">
              No changes recorded yet — using system defaults.
            </p>
          )}
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
                disabled={busy}
              />
            </div>
          ))}
        </div>
        <DialogFooter className="sm:justify-between">
          {onReset ? (
            <Button variant="ghost" onClick={onReset} disabled={busy}>
              {resetting ? "Resetting..." : "Reset to defaults"}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={onApply} disabled={busy}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
