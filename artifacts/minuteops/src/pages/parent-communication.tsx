import { useState, useEffect, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  MessageSquare, Phone, Mail, Users, Calendar, AlertTriangle,
  Plus, X, Filter, Bell, Clock, ChevronDown, ChevronUp, CheckCircle,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useSchoolContext } from "@/lib/school-context";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";


type Contact = {
  id: number;
  studentId: number;
  contactType: string;
  contactDate: string;
  contactMethod: string;
  subject: string;
  notes: string | null;
  outcome: string | null;
  followUpNeeded: string | null;
  followUpDate: string | null;
  contactedBy: string | null;
  parentName: string | null;
  notificationRequired: boolean;
  relatedAlertId: number | null;
  studentName: string | null;
  studentGrade: string | null;
  createdAt: string;
};

type NotificationNeeded = {
  alertId: number;
  alertType: string;
  severity: string;
  studentId: number;
  studentName: string | null;
  message: string;
  alertDate: string;
  parentNotified: boolean;
  lastContactDate: string | null;
};

const METHOD_ICONS: Record<string, any> = {
  phone: Phone,
  email: Mail,
  "in-person": Users,
  letter: MessageSquare,
};

const METHOD_LABELS: Record<string, string> = {
  phone: "Phone",
  email: "Email",
  "in-person": "In-Person",
  letter: "Letter",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high: "bg-red-50 text-red-600 border-red-100",
  medium: "bg-gray-100 text-gray-700 border-gray-200",
  low: "bg-gray-50 text-gray-500 border-gray-100",
};

export default function ParentCommunication() {
  const { selectedSchool } = useSchoolContext();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [overdueFollowups, setOverdueFollowups] = useState<Contact[]>([]);
  const [notificationNeeds, setNotificationNeeds] = useState<NotificationNeeded[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const [filterStudent, setFilterStudent] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterFollowUp, setFilterFollowUp] = useState("");
  const [filterContactType, setFilterContactType] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [tab, setTab] = useState<"all" | "overdue" | "notifications">("all");

  const [formData, setFormData] = useState({
    studentId: "",
    contactType: "progress_update",
    contactDate: new Date().toISOString().substring(0, 10),
    contactMethod: "phone",
    subject: "",
    notes: "",
    outcome: "",
    followUpNeeded: "no",
    followUpDate: "",
    contactedBy: "",
    parentName: "",
    notificationRequired: false,
    relatedAlertId: "",
  });

  const [students, setStudents] = useState<{ id: number; firstName: string; lastName: string }[]>([]);

  useEffect(() => {
    apiGet(`/api/sped-students${selectedSchool?.id ? `?schoolId=${selectedSchool.id}` : ""}`)
      .then(setStudents)
      .catch(() => {});
  }, [selectedSchool]);

  function fetchAll() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStudent) params.set("studentId", filterStudent);
    if (filterStartDate) params.set("startDate", filterStartDate);
    if (filterEndDate) params.set("endDate", filterEndDate);
    if (filterFollowUp) params.set("followUpStatus", filterFollowUp);
    if (filterContactType) params.set("contactType", filterContactType);
    if (selectedSchool?.id) params.set("schoolId", String(selectedSchool.id));

    Promise.all([
      apiGet(`/api/parent-contacts?${params}`).catch(() => ({ data: [], page: 1, limit: 100 })),
      apiGet(`/api/parent-contacts/overdue-followups${selectedSchool?.id ? `?schoolId=${selectedSchool.id}` : ""}`).catch(() => []),
      apiGet(`/api/parent-contacts/notification-needed${selectedSchool?.id ? `?schoolId=${selectedSchool.id}` : ""}`).catch(() => []),
    ]).then(([cRes, o, n]) => {
      setContacts(cRes.data || []);
      setOverdueFollowups(o);
      setNotificationNeeds(n);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { fetchAll(); }, [filterStudent, filterStartDate, filterEndDate, filterFollowUp, filterContactType, selectedSchool]);

  function resetForm() {
    setFormData({
      studentId: "",
      contactType: "progress_update",
      contactDate: new Date().toISOString().substring(0, 10),
      contactMethod: "phone",
      subject: "",
      notes: "",
      outcome: "",
      followUpNeeded: "no",
      followUpDate: "",
      contactedBy: "",
      parentName: "",
      notificationRequired: false,
      relatedAlertId: "",
    });
    setEditingContact(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.studentId || !formData.subject) {
      toast.error("Student and subject are required");
      return;
    }
    try {
      const body = {
        ...formData,
        studentId: Number(formData.studentId),
        relatedAlertId: formData.relatedAlertId ? Number(formData.relatedAlertId) : null,
      };

      if (editingContact) {
        await apiPatch(`/api/parent-contacts/${editingContact.id}`, body);
        toast.success("Contact updated");
      } else {
        await apiPost(`/api/parent-contacts`, body);
        toast.success("Contact logged");
      }

      setShowForm(false);
      resetForm();
      fetchAll();
    } catch {
      toast.error("Failed to save contact");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this contact log?")) return;
    try {
      await apiDelete(`/api/parent-contacts/${id}`);
      toast.success("Contact deleted");
      fetchAll();
    } catch {
      toast.error("Failed to delete");
    }
  }

  function startEdit(c: Contact) {
    setFormData({
      studentId: String(c.studentId),
      contactType: c.contactType,
      contactDate: c.contactDate,
      contactMethod: c.contactMethod,
      subject: c.subject,
      notes: c.notes || "",
      outcome: c.outcome || "",
      followUpNeeded: c.followUpNeeded || "no",
      followUpDate: c.followUpDate || "",
      contactedBy: c.contactedBy || "",
      parentName: c.parentName || "",
      notificationRequired: c.notificationRequired,
      relatedAlertId: c.relatedAlertId ? String(c.relatedAlertId) : "",
    });
    setEditingContact(c);
    setShowForm(true);
  }

  function logNotification(n: NotificationNeeded) {
    setFormData({
      studentId: String(n.studentId),
      contactType: "missed_service_notification",
      contactDate: new Date().toISOString().substring(0, 10),
      contactMethod: "phone",
      subject: `Missed Service Notification: ${n.message.substring(0, 80)}`,
      notes: "",
      outcome: "",
      followUpNeeded: "yes",
      followUpDate: getFollowUpDate(),
      contactedBy: "",
      parentName: "",
      notificationRequired: true,
      relatedAlertId: String(n.alertId),
    });
    setEditingContact(null);
    setShowForm(true);
  }

  function getFollowUpDate() {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().substring(0, 10);
  }

  function formatDate(d: string) {
    if (!d) return "\u2014";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const overdueCount = overdueFollowups.length;
  const unnotifiedCount = notificationNeeds.filter(n => !n.parentNotified).length;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">Parent Communication</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track parent contacts, follow-ups, and compliance notifications</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Log Contact
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => setTab("all")}
          className={`p-4 rounded-xl border transition-colors text-left ${tab === "all" ? "border-emerald-200 bg-emerald-50" : "border-gray-100 bg-white hover:bg-gray-50"}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{contacts.length}</p>
              <p className="text-xs text-gray-400">Total Contacts</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setTab("overdue")}
          className={`p-4 rounded-xl border transition-colors text-left ${tab === "overdue" ? "border-red-200 bg-red-50" : "border-gray-100 bg-white hover:bg-gray-50"}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{overdueCount}</p>
              <p className="text-xs text-gray-400">Overdue Follow-ups</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setTab("notifications")}
          className={`p-4 rounded-xl border transition-colors text-left ${tab === "notifications" ? "border-red-200 bg-red-50" : "border-gray-100 bg-white hover:bg-gray-50"}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <Bell className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{unnotifiedCount}</p>
              <p className="text-xs text-gray-400">Notifications Needed</p>
            </div>
          </div>
        </button>
      </div>

      {tab === "all" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Filter className="w-3.5 h-3.5" /> Filters
              {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {(filterStudent || filterStartDate || filterEndDate || filterFollowUp || filterContactType) && (
              <button
                onClick={() => { setFilterStudent(""); setFilterStartDate(""); setFilterEndDate(""); setFilterFollowUp(""); setFilterContactType(""); }}
                className="text-xs text-emerald-600 hover:text-emerald-700"
              >
                Clear all
              </button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-gray-50 rounded-xl">
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">Student</label>
                <select
                  value={filterStudent}
                  onChange={e => setFilterStudent(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value="">All Students</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">Start Date</label>
                <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">End Date</label>
                <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">Follow-up</label>
                <select value={filterFollowUp} onChange={e => setFilterFollowUp(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white">
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="overdue">Overdue</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">Type</label>
                <select value={filterContactType} onChange={e => setFilterContactType(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white">
                  <option value="">All Types</option>
                  <option value="progress_update">Progress Update</option>
                  <option value="missed_service_notification">Missed Service</option>
                  <option value="iep_meeting">IEP Meeting</option>
                  <option value="general">General</option>
                  <option value="concern">Concern</option>
                </select>
              </div>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="w-full h-16" />)}</div>
              ) : contacts.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  No contacts found. Log your first parent communication above.
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {contacts.map(c => {
                    const MethodIcon = METHOD_ICONS[c.contactMethod] || MessageSquare;
                    const isOverdue = c.followUpNeeded === "yes" && c.followUpDate && c.followUpDate < new Date().toISOString().substring(0, 10) && (!c.outcome || c.outcome === "");
                    return (
                      <div key={c.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${c.notificationRequired ? "bg-red-50" : "bg-emerald-50"}`}>
                            <MethodIcon className={`w-4 h-4 ${c.notificationRequired ? "text-red-500" : "text-emerald-600"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link href={`/students/${c.studentId}`} className="text-sm font-medium text-gray-800 hover:text-emerald-700">
                                {c.studentName || `Student #${c.studentId}`}
                              </Link>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{c.contactType.replace(/_/g, " ")}</span>
                              {c.notificationRequired && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">Compliance</span>
                              )}
                              {isOverdue && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium flex items-center gap-0.5">
                                  <AlertTriangle className="w-3 h-3" /> Overdue
                                </span>
                              )}
                              {c.followUpNeeded === "yes" && c.outcome && c.outcome !== "" && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium flex items-center gap-0.5">
                                  <CheckCircle className="w-3 h-3" /> Resolved
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mt-0.5">{c.subject}</p>
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                              <span>{formatDate(c.contactDate)}</span>
                              <span>{METHOD_LABELS[c.contactMethod] || c.contactMethod}</span>
                              {c.parentName && <span>with {c.parentName}</span>}
                              {c.contactedBy && <span>by {c.contactedBy}</span>}
                              {c.followUpDate && <span>Follow-up: {formatDate(c.followUpDate)}</span>}
                            </div>
                            {c.notes && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{c.notes}</p>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => startEdit(c)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md text-xs">
                              Edit
                            </button>
                            <button onClick={() => handleDelete(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md text-xs">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === "overdue" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-500" />
              Overdue Follow-ups
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="w-full h-14" />)}</div>
            ) : overdueFollowups.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No overdue follow-ups</p>
            ) : (
              <div className="space-y-2">
                {overdueFollowups.map(c => (
                  <div key={c.id} className="p-3 rounded-lg bg-red-50/50 border border-red-100 flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{c.studentName || `Student #${c.studentId}`}</p>
                      <p className="text-xs text-gray-500">{c.subject}</p>
                      <p className="text-[11px] text-red-500 mt-0.5">Due: {formatDate(c.followUpDate || "")}</p>
                    </div>
                    <button
                      onClick={() => startEdit(c)}
                      className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Resolve
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "notifications" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <Bell className="w-4 h-4 text-red-500" />
              Parent Notifications Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="w-full h-14" />)}</div>
            ) : notificationNeeds.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No pending notifications</p>
            ) : (
              <div className="space-y-2">
                {notificationNeeds.map(n => (
                  <div key={n.alertId} className={`p-3 rounded-lg border flex items-center gap-3 ${SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.medium}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/students/${n.studentId}`} className="text-sm font-medium hover:underline">
                          {n.studentName || `Student #${n.studentId}`}
                        </Link>
                        <span className="text-[10px] uppercase font-bold">{n.severity}</span>
                        {n.parentNotified && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium flex items-center gap-0.5">
                            <CheckCircle className="w-3 h-3" /> Notified
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5 line-clamp-1">{n.message}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] opacity-70">
                        <span>Alert: {formatDate(n.alertDate.substring(0, 10))}</span>
                        {n.lastContactDate && <span>Last contact: {formatDate(n.lastContactDate)}</span>}
                      </div>
                    </div>
                    {!n.parentNotified && (
                      <button
                        onClick={() => logNotification(n)}
                        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 flex-shrink-0"
                      >
                        Log Contact
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800">{editingContact ? "Edit Contact" : "Log Parent Contact"}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Student *</label>
                  <select
                    value={formData.studentId}
                    onChange={e => setFormData(f => ({ ...f, studentId: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Select student...</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Contact Type</label>
                  <select
                    value={formData.contactType}
                    onChange={e => setFormData(f => ({ ...f, contactType: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="progress_update">Progress Update</option>
                    <option value="missed_service_notification">Missed Service Notification</option>
                    <option value="iep_meeting">IEP Meeting</option>
                    <option value="general">General</option>
                    <option value="concern">Concern</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Method</label>
                  <select
                    value={formData.contactMethod}
                    onChange={e => setFormData(f => ({ ...f, contactMethod: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="phone">Phone</option>
                    <option value="email">Email</option>
                    <option value="in-person">In-Person</option>
                    <option value="letter">Letter</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Date *</label>
                  <input type="date" value={formData.contactDate}
                    onChange={e => setFormData(f => ({ ...f, contactDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Parent Name</label>
                  <input type="text" value={formData.parentName}
                    onChange={e => setFormData(f => ({ ...f, parentName: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Parent/Guardian name" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Subject *</label>
                  <input type="text" value={formData.subject}
                    onChange={e => setFormData(f => ({ ...f, subject: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Brief subject of contact" required />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
                  <textarea value={formData.notes}
                    onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                    rows={3} placeholder="Details of the conversation..." />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Outcome</label>
                  <input type="text" value={formData.outcome}
                    onChange={e => setFormData(f => ({ ...f, outcome: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Result or next steps" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Follow-up Needed?</label>
                  <select
                    value={formData.followUpNeeded}
                    onChange={e => setFormData(f => ({ ...f, followUpNeeded: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
                {formData.followUpNeeded === "yes" && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Follow-up Date</label>
                    <input type="date" value={formData.followUpDate}
                      onChange={e => setFormData(f => ({ ...f, followUpDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Contacted By</label>
                  <input type="text" value={formData.contactedBy}
                    onChange={e => setFormData(f => ({ ...f, contactedBy: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Your name" />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="notifReq" checked={formData.notificationRequired}
                    onChange={e => setFormData(f => ({ ...f, notificationRequired: e.target.checked }))}
                    className="rounded border-gray-300" />
                  <label htmlFor="notifReq" className="text-xs text-gray-600">This is a required compliance notification</label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
                  {editingContact ? "Update" : "Log Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
