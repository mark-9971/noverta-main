import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useChecklistVisibility } from "./useChecklistVisibility";

export default function ChecklistVisibilityToggle() {
  const { checklistDismissed, isLoading, isDismissing, isShowing, dismiss, show } = useChecklistVisibility();

  const isBusy = isLoading || isDismissing || isShowing;

  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg border border-gray-100 bg-gray-50/60">
      <div className="flex items-center gap-3">
        {checklistDismissed
          ? <EyeOff className="w-4 h-4 text-gray-400 flex-shrink-0" />
          : <Eye className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        }
        <div>
          <p className="text-sm font-medium text-gray-800">Setup checklist</p>
          <p className="text-xs text-gray-500">
            {checklistDismissed
              ? "Hidden from the dashboard. Your setup progress is still being tracked."
              : "Visible on the dashboard until all steps are complete."}
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={isBusy}
        onClick={() => checklistDismissed ? show() : dismiss()}
        className={`ml-4 flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
          checklistDismissed
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-800"
        }`}
        data-testid="button-checklist-visibility-toggle"
      >
        {isBusy
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : checklistDismissed
            ? <><Eye className="w-3 h-3" /> Show on dashboard</>
            : <><EyeOff className="w-3 h-3" /> Hide from dashboard</>
        }
      </button>
    </div>
  );
}
