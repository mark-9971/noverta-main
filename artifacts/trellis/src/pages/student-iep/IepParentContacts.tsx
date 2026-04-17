import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Mail, MessageSquare, Phone, Plus, Save, Users } from "lucide-react";
import { createParentContact, listParentContacts } from "@workspace/api-client-react";

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ParentContactsSection({ studentId }: { studentId: number }) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    contactType: "progress_update", contactDate: new Date().toISOString().split("T")[0],
    contactMethod: "phone", subject: "", notes: "", outcome: "",
    followUpNeeded: "", followUpDate: "", parentName: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listParentContacts({ studentId }).catch(() => []).then(d => setContacts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [studentId]);

  async function addContact() {
    if (!form.subject.trim()) return;
    setSaving(true);
    try {
      const res = await createParentContact({ ...form, studentId });
      setContacts(prev => [res, ...prev]);
      setShowAdd(false);
      setForm({ contactType: "progress_update", contactDate: new Date().toISOString().split("T")[0],
        contactMethod: "phone", subject: "", notes: "", outcome: "",
        followUpNeeded: "", followUpDate: "", parentName: "" });
    } catch (e) { console.error("Failed to add contact:", e); }
    setSaving(false);
  }

  const CONTACT_TYPES: Record<string, string> = {
    progress_update: "Progress Update", concern: "Concern", meeting_notice: "Meeting Notice",
    consent_request: "Consent Request", iep_review: "IEP Review", general: "General",
    behavioral_update: "Behavioral Update", schedule_change: "Schedule Change",
  };
  const METHOD_ICONS: Record<string, any> = {
    phone: Phone, email: Mail, in_person: Users, letter: MessageSquare, portal: FileText,
  };

  if (loading) return <Skeleton className="w-full h-40" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600">Parent Communication Log</h3>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
          onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Log Contact
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500">Contact Type</label>
                <select value={form.contactType} onChange={e => setForm(p => ({ ...p, contactType: e.target.value }))}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  {Object.entries(CONTACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Method</label>
                <select value={form.contactMethod} onChange={e => setForm(p => ({ ...p, contactMethod: e.target.value }))}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  <option value="phone">Phone Call</option>
                  <option value="email">Email</option>
                  <option value="in_person">In Person</option>
                  <option value="letter">Letter</option>
                  <option value="portal">Parent Portal</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Date</label>
                <input type="date" value={form.contactDate} onChange={e => setForm(p => ({ ...p, contactDate: e.target.value }))}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500">Parent/Guardian Name</label>
                <input type="text" value={form.parentName} onChange={e => setForm(p => ({ ...p, parentName: e.target.value }))}
                  placeholder="e.g. Maria Alvarez"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Subject *</label>
                <input type="text" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Brief description of the contact"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3}
                placeholder="Details of the conversation or communication..."
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500">Outcome</label>
                <input type="text" value={form.outcome} onChange={e => setForm(p => ({ ...p, outcome: e.target.value }))}
                  placeholder="Result of the contact"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Follow-up Date</label>
                <input type="date" value={form.followUpDate} onChange={e => setForm(p => ({ ...p, followUpDate: e.target.value }))}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={addContact} disabled={saving || !form.subject.trim()}>
                <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Contact"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Phone className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No parent contacts logged yet</p>
            <p className="text-xs text-gray-400 mt-1">Document phone calls, emails, meetings, and notices</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => {
            const MethodIcon = METHOD_ICONS[c.contactMethod] || Phone;
            return (
              <Card key={c.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      c.contactType === "concern" ? "bg-red-50" :
                      c.contactType === "consent_request" ? "bg-amber-50" : "bg-emerald-50"
                    }`}>
                      <MethodIcon className={`w-4 h-4 ${
                        c.contactType === "concern" ? "text-red-500" :
                        c.contactType === "consent_request" ? "text-amber-500" : "text-emerald-600"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium text-gray-700">{c.subject}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-600">
                          {CONTACT_TYPES[c.contactType] || c.contactType}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                        <span>{formatDate(c.contactDate)}</span>
                        {c.parentName && <span>with {c.parentName}</span>}
                        <span className="capitalize">{(c.contactMethod || "").replace(/_/g, " ")}</span>
                      </div>
                      {c.notes && <p className="text-[12px] text-gray-500 mt-1.5 line-clamp-2">{c.notes}</p>}
                      {c.outcome && (
                        <p className="text-[11px] text-emerald-600 mt-1">Outcome: {c.outcome}</p>
                      )}
                      {c.followUpDate && (
                        <p className="text-[11px] text-amber-600 mt-0.5">Follow-up: {formatDate(c.followUpDate)}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
