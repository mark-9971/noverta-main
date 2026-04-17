import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { updateSchoolScheduleSettings } from "@workspace/api-client-react";
import {
  ScheduleType, SchoolScheduleConfig,
  SCHEDULE_TYPE_LABELS, SCHEDULE_TYPE_DESCRIPTIONS,
} from "./constants";

export function ScheduleSettingsDialog({
  open,
  onClose,
  school,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  school: SchoolScheduleConfig;
  onSaved: (updated: SchoolScheduleConfig) => void;
}) {
  const [scheduleType, setScheduleType] = useState<ScheduleType>(school.scheduleType);
  const [rotationStartDate, setRotationStartDate] = useState(school.rotationStartDate ?? "");
  const [scheduleNotes, setScheduleNotes] = useState(school.scheduleNotes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setScheduleType(school.scheduleType);
    setRotationStartDate(school.rotationStartDate ?? "");
    setScheduleNotes(school.scheduleNotes ?? "");
  }, [school, open]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateSchoolScheduleSettings(school.id, {
        scheduleType,
        rotationStartDate: rotationStartDate || null,
        scheduleNotes: scheduleNotes || null,
      });
      onSaved(updated as any);
      toast.success("Schedule settings saved");
      onClose();
    } catch {
      toast.error("Failed to save schedule settings");
    } finally {
      setSaving(false);
    }
  }

  const needsStartDate = scheduleType !== "standard";

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-gray-800">
            Schedule Settings — {school.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-gray-600">Schedule Type</Label>
            <Select value={scheduleType} onValueChange={v => setScheduleType(v as ScheduleType)}>
              <SelectTrigger className="h-9 text-[13px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["standard", "ab_day", "rotating_4", "rotating_6"] as ScheduleType[]).map(t => (
                  <SelectItem key={t} value={t} className="text-[13px]">
                    {SCHEDULE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              {SCHEDULE_TYPE_DESCRIPTIONS[scheduleType]}
            </p>
          </div>

          {needsStartDate && (
            <div className="space-y-2">
              <Label className="text-[12px] font-medium text-gray-600">
                Rotation Start Date
                <span className="text-gray-400 font-normal ml-1">— the date of Day A / Day 1</span>
              </Label>
              <input
                type="date"
                value={rotationStartDate}
                onChange={e => setRotationStartDate(e.target.value)}
                className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-gray-400">
                The system uses this date to calculate which rotation day "today" falls on.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-gray-600">
              Notes
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </Label>
            <Textarea
              value={scheduleNotes}
              onChange={e => setScheduleNotes(e.target.value)}
              placeholder="e.g. Cycle resets after school vacation weeks. Contact main office for overrides."
              className="text-[13px] min-h-[72px] resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
