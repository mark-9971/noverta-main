import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Building2 } from "lucide-react";
import { Conflict, WEEKDAY_LABELS, formatTime } from "./types";

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  conflicts: Conflict[];
}

export function ConflictsDialog({ open, setOpen, conflicts }: Props) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-4 h-4" /> Scheduling Conflicts ({conflicts.length})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {conflicts.map((c, i) => (
            <Card key={i} className="p-3 border-red-200 bg-red-50/50">
              <div className="font-semibold text-sm text-gray-900">{c.staffFirstName} {c.staffLastName}</div>
              <div className="text-xs text-gray-500 capitalize mt-0.5">{WEEKDAY_LABELS[c.dayOfWeek]}</div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <Building2 className="w-3 h-3 text-gray-400" />
                  <span className="font-medium">{c.aSchoolName}</span>
                  <span className="text-gray-400">{formatTime(c.aStartTime)}–{formatTime(c.aEndTime)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Building2 className="w-3 h-3 text-gray-400" />
                  <span className="font-medium">{c.bSchoolName}</span>
                  <span className="text-gray-400">{formatTime(c.bStartTime)}–{formatTime(c.bEndTime)}</span>
                </div>
              </div>
              {c.suggestions && c.suggestions.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-red-200">
                  <p className="text-[10px] font-semibold text-red-700 mb-1">Suggested fixes:</p>
                  <ul className="space-y-0.5">
                    {c.suggestions.map((s, si) => (
                      <li key={si} className="text-[10px] text-red-600 flex items-start gap-1">
                        <span className="text-red-400 mt-0.5">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
