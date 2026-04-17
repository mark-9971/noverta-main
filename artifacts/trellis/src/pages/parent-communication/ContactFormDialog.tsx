import { X } from "lucide-react";
import { FormData } from "./types";

interface Props {
  open: boolean;
  editing: boolean;
  formData: FormData;
  setFormData: (updater: (f: FormData) => FormData) => void;
  students: { id: number; firstName: string; lastName: string }[];
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function ContactFormDialog({ open, editing, formData, setFormData, students, onClose, onSubmit }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">{editing ? "Edit Contact" : "Log Parent Contact"}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Student *</label>
              <select value={formData.studentId} onChange={e => setFormData(f => ({ ...f, studentId: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required>
                <option value="">Select student...</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Contact Type</label>
              <select value={formData.contactType} onChange={e => setFormData(f => ({ ...f, contactType: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="progress_update">Progress Update</option>
                <option value="missed_service_notification">Missed Service Notification</option>
                <option value="iep_meeting">IEP Meeting</option>
                <option value="general">General</option>
                <option value="concern">Concern</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Method</label>
              <select value={formData.contactMethod} onChange={e => setFormData(f => ({ ...f, contactMethod: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="phone">Phone</option>
                <option value="email">Email</option>
                <option value="in-person">In-Person</option>
                <option value="letter">Letter</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Date *</label>
              <input type="date" value={formData.contactDate} onChange={e => setFormData(f => ({ ...f, contactDate: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Parent Name</label>
              <input type="text" value={formData.parentName} onChange={e => setFormData(f => ({ ...f, parentName: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Parent/Guardian name" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Subject *</label>
              <input type="text" value={formData.subject} onChange={e => setFormData(f => ({ ...f, subject: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Brief subject of contact" required />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
              <textarea value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" rows={3} placeholder="Details of the conversation..." />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Outcome</label>
              <input type="text" value={formData.outcome} onChange={e => setFormData(f => ({ ...f, outcome: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Result or next steps" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Follow-up Needed?</label>
              <select value={formData.followUpNeeded} onChange={e => setFormData(f => ({ ...f, followUpNeeded: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            {formData.followUpNeeded === "yes" && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Follow-up Date</label>
                <input type="date" value={formData.followUpDate} onChange={e => setFormData(f => ({ ...f, followUpDate: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Contacted By</label>
              <input type="text" value={formData.contactedBy} onChange={e => setFormData(f => ({ ...f, contactedBy: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Your name" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="notifReq" checked={formData.notificationRequired} onChange={e => setFormData(f => ({ ...f, notificationRequired: e.target.checked }))} className="rounded border-gray-300" />
              <label htmlFor="notifReq" className="text-xs text-gray-600">This is a required compliance notification</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
              {editing ? "Update" : "Log Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
