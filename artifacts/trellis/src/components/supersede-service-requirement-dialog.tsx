import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ApiError,
  type RequiresSupersedeError,
  type UpdateServiceRequirementBody,
} from "@workspace/api-client-react";

export interface DetectedSupersedeError {
  creditedSessionCount: number;
}

/**
 * Detects the `409 REQUIRES_SUPERSEDE` response returned by
 * `PATCH /service-requirements/:id` when material edits are attempted on a
 * requirement that already has credited sessions.
 *
 * Centralised so every surface that PATCHes a service requirement (today the
 * student detail edit dialog, tomorrow other inline-edit affordances) can
 * uniformly detect the block and route the user to the supersede prompt
 * instead of swallowing it as a generic "Failed to save" toast.
 */
export function detectRequiresSupersedeError(err: unknown): DetectedSupersedeError | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status !== 409) return null;
  const data = err.data as RequiresSupersedeError | null;
  if (!data || data.code !== "REQUIRES_SUPERSEDE") return null;
  return { creditedSessionCount: data.credited_session_count ?? 0 };
}

export interface SupersedeServiceRequirementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many sessions were already credited to the requirement (drives the body copy). */
  creditedSessionCount: number;
  /** Effective date for the new requirement (controlled). */
  supersedeDate: string;
  setSupersedeDate: (value: string) => void;
  /** Pending edits the user attempted — shown as a "what will change" preview. */
  pendingEdits: UpdateServiceRequirementBody | null;
  saving: boolean;
  onConfirm: () => void;
}

/**
 * Reusable confirmation dialog shown when the API blocks an in-place edit of a
 * service requirement that has credited sessions. Identical UX regardless of
 * which surface initiated the edit.
 */
export function SupersedeServiceRequirementDialog({
  open,
  onOpenChange,
  creditedSessionCount,
  supersedeDate,
  setSupersedeDate,
  pendingEdits,
  saving,
  onConfirm,
}: SupersedeServiceRequirementDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && saving) return;
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-gray-800">
            This requirement has delivered minutes
          </DialogTitle>
          <DialogDescription className="text-[13px] text-gray-600">
            {creditedSessionCount > 0
              ? `${creditedSessionCount} session${creditedSessionCount === 1 ? " has" : "s have"} already been credited to this requirement, so it can't be edited in place. Start a new requirement that takes effect on the date below — the existing one will be end-dated automatically.`
              : "This requirement has credited minutes, so it can't be edited in place. Start a new requirement that takes effect on the date below — the existing one will be end-dated automatically."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-[12px] font-medium text-gray-600">
              New requirement effective date
            </Label>
            <input
              type="date"
              value={supersedeDate}
              onChange={(e) => setSupersedeDate(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          {pendingEdits ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] text-gray-700 space-y-0.5">
              <div className="font-medium text-gray-600 mb-1">Pending changes</div>
              <div>
                Minutes: <span className="font-medium">{pendingEdits.requiredMinutes ?? "—"}</span>
              </div>
              <div>
                Interval: <span className="font-medium">{pendingEdits.intervalType ?? "—"}</span>
              </div>
              <div>
                Delivery: <span className="font-medium">{pendingEdits.deliveryType ?? "—"}</span>
              </div>
              <div>
                Priority: <span className="font-medium">{pendingEdits.priority ?? "—"}</span>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={saving || !supersedeDate}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Starting…" : "Start new requirement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
