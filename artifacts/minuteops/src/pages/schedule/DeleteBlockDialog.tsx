import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WEEKDAY_LABELS } from "./constants";

interface Props {
  block: any | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteBlockDialog({ block, saving, onClose, onConfirm }: Props) {
  return (
    <Dialog open={!!block} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-gray-800">Delete Schedule Block</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-gray-600 py-2">
          Delete {block?.serviceTypeName || "this"} block for {block?.studentName || "student"} on {WEEKDAY_LABELS[block?.dayOfWeek] || block?.dayOfWeek}?
        </p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={onConfirm} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
            {saving ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
