import { Button } from "@/components/ui/button";
import { formatDate } from "./utils";
import type { MarkMissedTarget } from "./types";

type Props = {
  target: MarkMissedTarget;
  reason: string;
  notes: string;
  saving: boolean;
  missedReasonsList: any[];
  onReasonChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MarkMissedDialog({ target, reason, notes, saving, missedReasonsList, onReasonChange, onNotesChange, onCancel, onConfirm }: Props) {
  if (!target) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Mark Session as Missed</h3>
          <p className="text-sm text-gray-500 mt-1">
            {target.studentName} · {formatDate(target.sessionDate)}
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Missed Reason <span className="text-red-500">*</span></label>
          <select value={reason} onChange={e => onReasonChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
            <option value="">Select reason...</option>
            {missedReasonsList.map((r: any) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
          <textarea
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            rows={2}
            placeholder="Additional context about why this session was missed..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={onConfirm} disabled={saving || !reason}>
            {saving ? "Saving..." : "Mark as Missed"}
          </Button>
        </div>
      </div>
    </div>
  );
}
