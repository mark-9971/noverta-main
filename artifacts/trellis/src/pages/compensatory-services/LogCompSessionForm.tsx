import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logCompensatorySession } from "@workspace/api-client-react";

export function LogCompSessionForm({ obligationId, onClose, onLogged, staffList = [] }: {
  obligationId: number;
  onClose: () => void;
  onLogged: () => void;
  staffList?: { id: number; firstName: string; lastName: string; role?: string }[];
}) {
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().substring(0, 10));
  const [durationMinutes, setDurationMinutes] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [staffId, setStaffId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionDate || !durationMinutes) {
      toast.error("Date and duration are required");
      return;
    }
    setSubmitting(true);
    try {
      await logCompensatorySession(obligationId, {
          sessionDate,
          durationMinutes: Number(durationMinutes),
          staffId: staffId ? Number(staffId) : null,
          startTime: startTime || null,
          endTime: endTime || null,
          notes: notes || null,
        } as any);
      toast.success("Comp session logged");
      onLogged();
    } catch {
      toast.error("Failed to log session");
    }
    setSubmitting(false);
  }

  return (
    <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-3">
      <p className="text-xs font-semibold text-gray-600">Log Compensatory Session</p>
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Date *</label>
            <Input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} className="text-xs h-8" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Duration (min) *</label>
            <Input type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} className="text-xs h-8" min={1} />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Start Time</label>
            <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="text-xs h-8" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">End Time</label>
            <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="text-xs h-8" />
          </div>
        </div>
        {staffList.length > 0 && (
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Provider</label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger className="text-xs h-8">
                <SelectValue placeholder="Select provider (optional)" />
              </SelectTrigger>
              <SelectContent>
                {staffList.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.firstName} {s.lastName}{s.role ? ` — ${s.role}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes..." className="text-xs h-8" />
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={submitting} className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white">
            {submitting ? "Logging..." : "Log Session"}
          </Button>
        </div>
      </form>
    </div>
  );
}
