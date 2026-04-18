import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { MessageSquare, Plus, Clock, Bell, Send } from "lucide-react";
import { toast } from "sonner";
import { useSchoolContext } from "@/lib/school-context";
import { listSpedStudents, listParentContacts, getOverdueFollowups, getNotificationNeeded, updateParentContact, createParentContact, deleteParentContact } from "@workspace/api-client-react";
import { apiGet } from "@/lib/api";
import { Contact, NotificationNeeded, CommEvent, FormData } from "./types";
import { Filters } from "./Filters";
import { ContactsList } from "./ContactsList";
import { OverdueList } from "./OverdueList";
import { NotificationsList } from "./NotificationsList";
import { CommsAuditLog } from "./CommsAuditLog";
import { ContactFormDialog } from "./ContactFormDialog";

const DEFAULT_FORM: FormData = {
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
};

export default function ParentCommunication() {
  const { selectedSchoolId } = useSchoolContext();
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

  const search = useSearch();
  const [, navigate] = useLocation();
  const rawTab = new URLSearchParams(search).get("tab");
  const VALID_TABS = ["all", "overdue", "notifications", "comms_log"] as const;
  type CommTab = typeof VALID_TABS[number];
  const tab: CommTab = (VALID_TABS.includes(rawTab as CommTab) ? rawTab : "all") as CommTab;
  function setTab(t: CommTab) { navigate(`/parent-communication?tab=${t}`, { replace: true }); }
  const [commsEvents, setCommsEvents] = useState<CommEvent[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);

  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);
  const [students, setStudents] = useState<{ id: number; firstName: string; lastName: string }[]>([]);

  useEffect(() => {
    listSpedStudents(selectedSchoolId ? { schoolId: selectedSchoolId } as any : undefined)
      .then(setStudents as any)
      .catch(() => {});
  }, [selectedSchoolId]);

  function fetchAll() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStudent) params.set("studentId", filterStudent);
    if (filterStartDate) params.set("startDate", filterStartDate);
    if (filterEndDate) params.set("endDate", filterEndDate);
    if (filterFollowUp) params.set("followUpStatus", filterFollowUp);
    if (filterContactType) params.set("contactType", filterContactType);
    if (selectedSchoolId) params.set("schoolId", String(selectedSchoolId));

    Promise.all([
      listParentContacts(Object.fromEntries(params) as any).catch(() => ({ data: [], page: 1, limit: 100 })),
      getOverdueFollowups(selectedSchoolId ? { schoolId: selectedSchoolId } as any : undefined).catch(() => []),
      getNotificationNeeded(selectedSchoolId ? { schoolId: selectedSchoolId } as any : undefined).catch(() => []),
    ]).then(([cRes, o, n]) => {
      setContacts((cRes as any).data || []);
      setOverdueFollowups(o as any);
      setNotificationNeeds(n as any);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  function fetchCommsEvents() {
    setCommsLoading(true);
    const qp = new URLSearchParams();
    if (filterStudent) qp.set("studentId", filterStudent);
    if (filterStartDate) qp.set("startDate", filterStartDate);
    if (filterEndDate) qp.set("endDate", filterEndDate);
    apiGet<{ data: CommEvent[] }>(`/communication-events?${qp.toString()}`)
      .then(r => setCommsEvents(r.data || []))
      .catch(() => setCommsEvents([]))
      .finally(() => setCommsLoading(false));
  }

  useEffect(() => { fetchAll(); }, [filterStudent, filterStartDate, filterEndDate, filterFollowUp, filterContactType, selectedSchoolId]);
  useEffect(() => { if (tab === "comms_log") fetchCommsEvents(); }, [tab, filterStudent, filterStartDate, filterEndDate, selectedSchoolId]);

  function resetForm() {
    setFormData(DEFAULT_FORM);
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
        await updateParentContact(editingContact.id, body as any);
        toast.success("Contact updated");
      } else {
        await createParentContact(body as any);
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
      await deleteParentContact(id);
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

  function getFollowUpDate() {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().substring(0, 10);
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

  const overdueCount = overdueFollowups.length;
  const unnotifiedCount = notificationNeeds.filter(n => !n.parentNotified).length;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6" data-tour-id="showcase-parent-portal">
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TabButton active={tab === "all"} onClick={() => setTab("all")} icon={MessageSquare} iconColor="text-emerald-600" bg="bg-emerald-100" activeBorder="border-emerald-200 bg-emerald-50" count={contacts.length} label="Total Contacts" />
        <TabButton active={tab === "overdue"} onClick={() => setTab("overdue")} icon={Clock} iconColor="text-red-500" bg="bg-red-100" activeBorder="border-red-200 bg-red-50" count={overdueCount} label="Overdue Follow-ups" />
        <TabButton active={tab === "notifications"} onClick={() => setTab("notifications")} icon={Bell} iconColor="text-red-500" bg="bg-red-100" activeBorder="border-red-200 bg-red-50" count={unnotifiedCount} label="Notifications Needed" />
        <TabButton active={tab === "comms_log"} onClick={() => setTab("comms_log")} icon={Send} iconColor="text-blue-500" bg="bg-blue-100" activeBorder="border-blue-200 bg-blue-50" count={commsEvents.length} label="Email Audit Log" />
      </div>

      {tab === "all" && (
        <>
          <Filters
            showFilters={showFilters} setShowFilters={setShowFilters}
            filterStudent={filterStudent} setFilterStudent={setFilterStudent}
            filterStartDate={filterStartDate} setFilterStartDate={setFilterStartDate}
            filterEndDate={filterEndDate} setFilterEndDate={setFilterEndDate}
            filterFollowUp={filterFollowUp} setFilterFollowUp={setFilterFollowUp}
            filterContactType={filterContactType} setFilterContactType={setFilterContactType}
            students={students}
          />
          <ContactsList contacts={contacts} loading={loading} onEdit={startEdit} onDelete={handleDelete} />
        </>
      )}

      {tab === "overdue" && <OverdueList loading={loading} overdueFollowups={overdueFollowups} onResolve={startEdit} />}
      {tab === "notifications" && <NotificationsList loading={loading} notificationNeeds={notificationNeeds} onLog={logNotification} />}
      {tab === "comms_log" && <CommsAuditLog loading={commsLoading} events={commsEvents} />}

      <ContactFormDialog
        open={showForm}
        editing={!!editingContact}
        formData={formData}
        setFormData={setFormData}
        students={students}
        onClose={() => { setShowForm(false); resetForm(); }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function TabButton({
  active, onClick, icon: Icon, iconColor, bg, activeBorder, count, label,
}: {
  active: boolean; onClick: () => void; icon: any; iconColor: string;
  bg: string; activeBorder: string; count: number; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border transition-colors text-left ${active ? activeBorder : "border-gray-100 bg-white hover:bg-gray-50"}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-800">{count}</p>
          <p className="text-xs text-gray-400">{label}</p>
        </div>
      </div>
    </button>
  );
}
