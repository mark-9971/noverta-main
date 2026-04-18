import { useState } from "react";
import { toast } from "sonner";
import { useTransitionIncidentStatus } from "@workspace/api-client-react";
import { STATUS_COLORS, STATUS_LABELS, VALID_TRANSITIONS } from "@/pages/protective-measures/constants";

export function IncidentTransitionDialog({
  incident,
  onClose,
  onTransitioned,
}: {
  incident: { id: number; status: string; studentFirstName: string; studentLastName: string };
  onClose: () => void;
  onTransitioned: () => void;
}) {
  const transitions = VALID_TRANSITIONS[incident.status] ?? [];
  const [toStatus, setToStatus] = useState(transitions[0]?.toStatus ?? "");
  const [note, setNote] = useState("");
  const selectedTransition = transitions.find(t => t.toStatus === toStatus);
  const isReturn = selectedTransition?.isReturn ?? false;

  const transitionMutation = useTransitionIncidentStatus({
    mutation: {
      onSuccess: () => {
        toast.success(`Status updated to "${STATUS_LABELS[toStatus]}"`);
        onTransitioned();
      },
      onError: (err: Error) => {
        toast.error(err.message || "Failed to transition status");
      },
    },
  });

  function handleSubmit() {
    if (!note.trim()) { toast.error("A note is required for this transition"); return; }
    if (!toStatus) { toast.error("Select a target status"); return; }
    transitionMutation.mutate({ id: incident.id, data: { toStatus, note: note.trim() } });
  }

  if (transitions.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-800">
            {isReturn ? "Return for Correction" : "Update Incident Status"}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {incident.studentFirstName} {incident.studentLastName} — currently{" "}
            <span className={`font-medium px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[incident.status]}`}>
              {STATUS_LABELS[incident.status]}
            </span>
          </p>
        </div>
        {transitions.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Move to</label>
            <div className="flex gap-2 flex-wrap">
              {transitions.map(t => (
                <button key={t.toStatus} onClick={() => setToStatus(t.toStatus)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border-2 transition-colors ${
                    toStatus === t.toStatus ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {toStatus === "resolved" || toStatus === "dese_reported" ? "Resolution Note" : "Transition Note"}{" "}
            <span className="text-red-500">*</span>
          </label>
          <textarea
            className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 resize-none"
            rows={3}
            placeholder={isReturn ? "Describe what needs to be corrected or clarified before this can proceed…" :
              toStatus === "resolved" ? "Describe how this incident was resolved and any follow-up taken…" :
              toStatus === "under_review" ? "Note the reason for escalation to admin review…" :
              "Add a note for this status change…"}
            value={note}
            onChange={e => setNote(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors" disabled={transitionMutation.isPending}>
            Cancel
          </button>
          <button onClick={handleSubmit}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${transitions.find(t => t.toStatus === toStatus)?.color || "bg-emerald-700 text-white"}`}
            disabled={transitionMutation.isPending}>
            {transitionMutation.isPending ? "Saving…" : (transitions.find(t => t.toStatus === toStatus)?.label ?? "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
