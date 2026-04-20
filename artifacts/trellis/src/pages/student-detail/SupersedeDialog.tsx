import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { SupersedeFlow } from "./supersede-flow";

export type SupersedeDialogProps = {
  flow: SupersedeFlow;
  onConfirm: () => void;
};

export default function SupersedeDialog({ flow, onConfirm }: SupersedeDialogProps) {
  const {
    isOpen,
    isSaving,
    creditedCount,
    pendingEdits,
    effectiveDate,
    setEffectiveDate,
    close,
  } = flow;

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v && !isSaving) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-gray-800">
            This requirement has delivered minutes
          </DialogTitle>
          <DialogDescription className="text-[13px] text-gray-600">
            {creditedCount > 0
              ? `${creditedCount} session${creditedCount === 1 ? " has" : "s have"} already been credited to this requirement, so it can't be edited in place. Start a new requirement that takes effect on the date below — the existing one will be end-dated automatically.`
              : "This requirement has credited minutes, so it can't be edited in place. Start a new requirement that takes effect on the date below — the existing one will be end-dated automatically."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-[12px] font-medium text-gray-600">New requirement effective date</Label>
            <input
              type="date"
              aria-label="New requirement effective date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          {pendingEdits ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] text-gray-700 space-y-0.5">
              <div className="font-medium text-gray-600 mb-1">Pending changes</div>
              <div>Minutes: <span className="font-medium">{pendingEdits.requiredMinutes ?? "—"}</span></div>
              <div>Interval: <span className="font-medium">{pendingEdits.intervalType ?? "—"}</span></div>
              <div>Delivery: <span className="font-medium">{pendingEdits.deliveryType ?? "—"}</span></div>
              <div>Priority: <span className="font-medium">{pendingEdits.priority ?? "—"}</span></div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            size="sm"
            variant="outline"
            onClick={close}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isSaving || !effectiveDate}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isSaving ? "Starting…" : "Start new requirement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
