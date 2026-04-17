import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import type { FormData, StaffOption } from "./types";

export function SessionForm({
  formData,
  setFormData,
  bcbas,
  superviseeStaff,
  editingId,
  onSubmit,
  onCancel,
}: {
  formData: FormData;
  setFormData: (updater: (d: FormData) => FormData) => void;
  bcbas: StaffOption[];
  superviseeStaff: StaffOption[];
  editingId: number | null;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-700">
            {editingId ? "Edit Supervision Session" : "Log Supervision Session"}
          </CardTitle>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label className="text-[12px] text-gray-500">Supervisor (BCBA)</Label>
            <select
              value={formData.supervisorId}
              onChange={e => setFormData(d => ({ ...d, supervisorId: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-white"
              required
            >
              <option value="">Select supervisor...</option>
              {bcbas.map(s => (
                <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[12px] text-gray-500">Supervisee</Label>
            <select
              value={formData.superviseeId}
              onChange={e => setFormData(d => ({ ...d, superviseeId: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-white"
              required
            >
              <option value="">Select supervisee...</option>
              {superviseeStaff.map(s => (
                <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.role})</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[12px] text-gray-500">Date</Label>
            <Input
              type="date"
              value={formData.sessionDate}
              onChange={e => setFormData(d => ({ ...d, sessionDate: e.target.value }))}
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label className="text-[12px] text-gray-500">Duration (minutes)</Label>
            <Input
              type="number"
              min="1"
              max="480"
              value={formData.durationMinutes}
              onChange={e => setFormData(d => ({ ...d, durationMinutes: e.target.value }))}
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label className="text-[12px] text-gray-500">Type</Label>
            <select
              value={formData.supervisionType}
              onChange={e => setFormData(d => ({ ...d, supervisionType: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-white"
            >
              <option value="individual">Individual</option>
              <option value="group">Group</option>
              <option value="direct_observation">Direct Observation</option>
            </select>
          </div>
          <div>
            <Label className="text-[12px] text-gray-500">Status</Label>
            <select
              value={formData.status}
              onChange={e => setFormData(d => ({ ...d, status: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-white"
            >
              <option value="completed">Completed</option>
              <option value="scheduled">Scheduled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <Label className="text-[12px] text-gray-500">Topics Covered</Label>
            <textarea
              value={formData.topics}
              onChange={e => setFormData(d => ({ ...d, topics: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border rounded-md text-sm resize-none"
              rows={2}
              placeholder="Topics discussed during supervision..."
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <Label className="text-[12px] text-gray-500">Feedback Notes</Label>
            <textarea
              value={formData.feedbackNotes}
              onChange={e => setFormData(d => ({ ...d, feedbackNotes: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border rounded-md text-sm resize-none"
              rows={2}
              placeholder="Feedback and recommendations..."
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3 flex gap-2">
            <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {editingId ? "Update Session" : "Log Session"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
