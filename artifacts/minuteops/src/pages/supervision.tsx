import { useState, useEffect, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useSchoolContext } from "@/lib/school-context";
import { toast } from "sonner";
import {
  ClipboardCheck, Plus, X, Download, Users, Clock,
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  Filter, Eye
} from "lucide-react";

const API = "/api";

interface SupervisionSession {
  id: number;
  supervisorId: number;
  superviseeId: number;
  sessionDate: string;
  durationMinutes: number;
  supervisionType: string;
  topics: string | null;
  feedbackNotes: string | null;
  status: string;
  supervisorName: string | null;
  superviseeName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ComplianceSummary {
  superviseeId: number;
  superviseeName: string;
  role: string;
  schoolId: number | null;
  periodDays: number;
  directServiceMinutes: number;
  requiredSupervisionMinutes: number;
  deliveredSupervisionMinutes: number;
  sessionCount: number;
  compliancePercent: number;
  complianceStatus: string;
}

interface StaffOption {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
}

const TYPE_LABELS: Record<string, string> = {
  individual: "Individual",
  group: "Group",
  direct_observation: "Direct Observation",
};

const STATUS_COLORS: Record<string, string> = {
  compliant: "bg-emerald-100 text-emerald-700",
  at_risk: "bg-amber-100 text-amber-700",
  non_compliant: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  compliant: "Compliant",
  at_risk: "At Risk",
  non_compliant: "Non-Compliant",
};

export default function Supervision() {
  const { selectedSchool } = useSchoolContext();
  const [activeTab, setActiveTab] = useState<"log" | "compliance">("log");
  const [sessions, setSessions] = useState<SupervisionSession[]>([]);
  const [compliance, setCompliance] = useState<ComplianceSummary[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterSupervisor, setFilterSupervisor] = useState("");
  const [filterSupervisee, setFilterSupervisee] = useState("");
  const [filterType, setFilterType] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    supervisorId: "",
    superviseeId: "",
    sessionDate: new Date().toISOString().substring(0, 10),
    durationMinutes: "60",
    supervisionType: "individual",
    topics: "",
    feedbackNotes: "",
    status: "completed",
  });

  const bcbas = staff.filter(s => s.role === "bcba");
  const superviseeStaff = staff.filter(s => ["para", "provider"].includes(s.role));

  function fetchAll() {
    setLoading(true);
    const schoolParam = selectedSchool?.id ? `&schoolId=${selectedSchool.id}` : "";
    const params = new URLSearchParams();
    if (filterSupervisor) params.set("supervisorId", filterSupervisor);
    if (filterSupervisee) params.set("superviseeId", filterSupervisee);
    if (filterType) params.set("supervisionType", filterType);
    if (selectedSchool?.id) params.set("schoolId", String(selectedSchool.id));

    Promise.all([
      fetch(`${API}/supervision-sessions?${params}`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/supervision/compliance-summary${selectedSchool?.id ? `?schoolId=${selectedSchool.id}` : ""}`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/staff?status=active${selectedSchool?.id ? `&schoolId=${selectedSchool.id}` : ""}`).then(r => r.ok ? r.json() : []),
    ]).then(([s, c, st]) => {
      setSessions(s);
      setCompliance(c);
      setStaff(st);
    }).catch(() => toast.error("Failed to load supervision data"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchAll(); }, [selectedSchool, filterSupervisor, filterSupervisee, filterType]);

  function resetForm() {
    setFormData({
      supervisorId: "",
      superviseeId: "",
      sessionDate: new Date().toISOString().substring(0, 10),
      durationMinutes: "60",
      supervisionType: "individual",
      topics: "",
      feedbackNotes: "",
      status: "completed",
    });
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.supervisorId || !formData.superviseeId) {
      toast.error("Please select both supervisor and supervisee");
      return;
    }

    try {
      const body = {
        ...formData,
        supervisorId: Number(formData.supervisorId),
        superviseeId: Number(formData.superviseeId),
        durationMinutes: Number(formData.durationMinutes),
      };

      const url = editingId ? `${API}/supervision-sessions/${editingId}` : `${API}/supervision-sessions`;
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save session");
        return;
      }

      toast.success(editingId ? "Session updated" : "Supervision session logged");
      resetForm();
      setShowForm(false);
      fetchAll();
    } catch {
      toast.error("Failed to save supervision session");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this supervision session?")) return;
    try {
      const res = await fetch(`${API}/supervision-sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Session deleted");
      fetchAll();
    } catch {
      toast.error("Failed to delete session");
    }
  }

  function startEdit(session: SupervisionSession) {
    setFormData({
      supervisorId: String(session.supervisorId),
      superviseeId: String(session.superviseeId),
      sessionDate: session.sessionDate,
      durationMinutes: String(session.durationMinutes),
      supervisionType: session.supervisionType,
      topics: session.topics || "",
      feedbackNotes: session.feedbackNotes || "",
      status: session.status,
    });
    setEditingId(session.id);
    setShowForm(true);
  }

  function exportCSV() {
    const params = new URLSearchParams();
    if (filterSupervisor) params.set("supervisorId", filterSupervisor);
    if (filterSupervisee) params.set("superviseeId", filterSupervisee);
    if (selectedSchool) params.set("schoolId", String(selectedSchool));
    window.open(`${API}/supervision-sessions/export/csv?${params}`, "_blank");
  }

  const compliantCount = compliance.filter(c => c.complianceStatus === "compliant").length;
  const atRiskCount = compliance.filter(c => c.complianceStatus === "at_risk").length;
  const nonCompliantCount = compliance.filter(c => c.complianceStatus === "non_compliant").length;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-600" />
            Clinical Supervision
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Track BCBA supervision of RBTs and paraprofessionals</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="text-gray-600">
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setShowForm(!showForm); }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="w-4 h-4 mr-1" /> Log Session
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: "log" as const, label: "Session Log", count: sessions.length },
          { key: "compliance" as const, label: "Compliance Dashboard", count: compliance.length },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{t.count}</span>
          </button>
        ))}
      </div>

      {showForm && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700">
                {editingId ? "Edit Supervision Session" : "Log Supervision Session"}
              </CardTitle>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowForm(false); resetForm(); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : activeTab === "log" ? (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <Label className="text-[11px] text-gray-400">Supervisor</Label>
              <select
                value={filterSupervisor}
                onChange={e => setFilterSupervisor(e.target.value)}
                className="block mt-0.5 px-2 py-1.5 border rounded text-sm bg-white min-w-[160px]"
              >
                <option value="">All Supervisors</option>
                {bcbas.map(s => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11px] text-gray-400">Supervisee</Label>
              <select
                value={filterSupervisee}
                onChange={e => setFilterSupervisee(e.target.value)}
                className="block mt-0.5 px-2 py-1.5 border rounded text-sm bg-white min-w-[160px]"
              >
                <option value="">All Supervisees</option>
                {superviseeStaff.map(s => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11px] text-gray-400">Type</Label>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="block mt-0.5 px-2 py-1.5 border rounded text-sm bg-white min-w-[140px]"
              >
                <option value="">All Types</option>
                <option value="individual">Individual</option>
                <option value="group">Group</option>
                <option value="direct_observation">Direct Observation</option>
              </select>
            </div>
          </div>

          {sessions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-400">
                <ClipboardCheck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No supervision sessions found</p>
                <p className="text-xs mt-1">Click "Log Session" to record your first supervision</p>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Date</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Supervisor</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Supervisee</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Type</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Duration</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <Fragment key={s.id}>
                      <tr
                        className="border-b hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                      >
                        <td className="px-4 py-2.5 text-gray-700">{s.sessionDate}</td>
                        <td className="px-4 py-2.5 text-gray-700">{s.supervisorName}</td>
                        <td className="px-4 py-2.5 text-gray-700">{s.superviseeName}</td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                            {TYPE_LABELS[s.supervisionType] || s.supervisionType}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{s.durationMinutes} min</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            s.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                            s.status === "scheduled" ? "bg-gray-100 text-gray-600" :
                            "bg-red-100 text-red-600"
                          }`}>{s.status}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => startEdit(s)}
                              className="text-gray-400 hover:text-emerald-600 text-[11px] px-2 py-1"
                            >Edit</button>
                            <button
                              onClick={() => handleDelete(s.id)}
                              className="text-gray-400 hover:text-red-600 text-[11px] px-2 py-1"
                            >Delete</button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === s.id && (
                        <tr key={`${s.id}-detail`} className="bg-gray-50/50">
                          <td colSpan={7} className="px-6 py-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
                              {s.topics && (
                                <div>
                                  <p className="font-semibold text-gray-500 mb-1">Topics Covered</p>
                                  <p className="text-gray-700 whitespace-pre-wrap">{s.topics}</p>
                                </div>
                              )}
                              {s.feedbackNotes && (
                                <div>
                                  <p className="font-semibold text-gray-500 mb-1">Feedback Notes</p>
                                  <p className="text-gray-700 whitespace-pre-wrap">{s.feedbackNotes}</p>
                                </div>
                              )}
                              {!s.topics && !s.feedbackNotes && (
                                <p className="text-gray-400 italic">No additional details recorded</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{compliantCount}</p>
                  <p className="text-[11px] text-gray-400">Compliant</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{atRiskCount}</p>
                  <p className="text-[11px] text-gray-400">At Risk</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{nonCompliantCount}</p>
                  <p className="text-[11px] text-gray-400">Non-Compliant</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-semibold text-gray-600">
                Supervisee Compliance — Last 30 Days
              </CardTitle>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Required: 5% of direct service hours as supervision
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              {compliance.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No supervisees found</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Staff</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Role</th>
                        <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Direct Svc</th>
                        <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Required</th>
                        <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Delivered</th>
                        <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Sessions</th>
                        <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compliance.map(c => (
                        <tr key={c.superviseeId} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-700">{c.superviseeName}</td>
                          <td className="px-4 py-2.5 text-gray-500 capitalize">{c.role}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{c.directServiceMinutes} min</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{c.requiredSupervisionMinutes} min</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{c.deliveredSupervisionMinutes} min</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{c.sessionCount}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[c.complianceStatus] || "bg-gray-100 text-gray-600"}`}>
                              {STATUS_LABELS[c.complianceStatus] || c.complianceStatus}
                            </span>
                            {c.compliancePercent > 0 && (
                              <span className="ml-1 text-[10px] text-gray-400">{c.compliancePercent}%</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
