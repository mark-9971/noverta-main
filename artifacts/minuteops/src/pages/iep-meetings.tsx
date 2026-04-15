import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  CalendarDays, Plus, Users, Clock, CheckCircle, XCircle,
  AlertTriangle, ChevronDown, ChevronUp, Pencil, Trash2,
  FileText, ClipboardCheck, UserCheck, Video, MapPin,
} from "lucide-react";

interface Meeting {
  id: number;
  studentId: number;
  iepDocumentId: number | null;
  schoolId: number | null;
  meetingType: string;
  scheduledDate: string;
  scheduledTime: string | null;
  endTime: string | null;
  duration: number | null;
  location: string | null;
  meetingFormat: string | null;
  status: string;
  agendaItems: string[] | null;
  notes: string | null;
  actionItems: { id: string; description: string; assignee: string; dueDate: string | null; status: string }[] | null;
  outcome: string | null;
  followUpDate: string | null;
  minutesFinalized: boolean | null;
  consentStatus: string | null;
  noticeSentDate: string | null;
  cancelledReason: string | null;
  studentName?: string;
  studentGrade?: string | null;
  schoolName?: string | null;
  attendeeRecords?: Attendee[];
  priorWrittenNotices?: PWN[];
  consentRecords?: ConsentRecord[];
  createdAt: string;
  updatedAt: string;
}

interface Attendee {
  id: number;
  meetingId: number;
  staffId: number | null;
  name: string;
  role: string;
  email: string | null;
  isRequired: boolean;
  rsvpStatus: string;
  attended: boolean | null;
  submittedWrittenInput: boolean;
  writtenInputNotes: string | null;
  staffName: string | null;
}

interface PWN {
  id: number;
  meetingId: number | null;
  studentId: number;
  noticeType: string;
  actionProposed: string;
  actionDescription: string | null;
  reasonForAction: string | null;
  optionsConsidered: string | null;
  reasonOptionsRejected: string | null;
  evaluationInfo: string | null;
  otherFactors: string | null;
  issuedDate: string | null;
  parentResponseDueDate: string | null;
  parentResponseReceived: string | null;
  parentResponseDate: string | null;
  status: string;
  notes: string | null;
}

interface ConsentRecord {
  id: number;
  meetingId: number;
  studentId: number;
  consentType: string;
  decision: string;
  decisionDate: string | null;
  respondentName: string | null;
  respondentRelationship: string | null;
  notes: string | null;
}

interface DashboardData {
  totalScheduled: number;
  upcomingCount: number;
  thisWeekCount: number;
  overdueCount: number;
  pendingConsentCount: number;
  completedCount: number;
  overdueAnnualReviews: number;
  upcomingMeetings: { id: number; studentName: string; meetingType: string; scheduledDate: string; studentGrade?: string | null }[];
  overdueMeetings: { id: number; studentName: string; meetingType: string; scheduledDate: string }[];
  overdueAnnualReviewStudents: { studentId: number; studentName: string; grade: string | null; iepEndDate: string }[];
}

interface StudentOption { id: number; firstName: string; lastName: string; grade?: string | null }

const MEETING_TYPES: Record<string, string> = {
  annual_review: "Annual Review",
  initial_iep: "Initial IEP",
  amendment: "IEP Amendment",
  reevaluation: "Reevaluation",
  transition: "Transition Meeting",
  manifestation_determination: "Manifestation Determination",
  eligibility: "Eligibility Determination",
  progress_review: "Progress Review",
  other: "Other",
};

const MEETING_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  confirmed: { label: "Confirmed", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  in_progress: { label: "In Progress", className: "bg-gray-100 text-gray-700 border-gray-300" },
  completed: { label: "Completed", className: "bg-gray-100 text-gray-600 border-gray-200" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-600 border-red-200" },
  rescheduled: { label: "Rescheduled", className: "bg-gray-50 text-gray-500 border-gray-200" },
};

const FORMAT_LABELS: Record<string, string> = {
  in_person: "In Person",
  virtual: "Virtual",
  hybrid: "Hybrid",
  phone: "Phone",
};

const NOTICE_TYPES: Record<string, string> = {
  propose_action: "Proposal to Initiate/Change",
  refuse_action: "Refusal to Initiate/Change",
  initial_evaluation: "Initial Evaluation",
  reevaluation: "Reevaluation",
  placement_change: "Change in Placement",
  services_change: "Change in Services",
  other: "Other",
};

const CONSENT_TYPES: Record<string, string> = {
  initial_evaluation: "Initial Evaluation",
  reevaluation: "Reevaluation",
  placement: "Placement",
  services: "Services",
  iep_implementation: "IEP Implementation",
  release_records: "Release of Records",
  other: "Other",
};

export default function IepMeetings() {
  const [tab, setTab] = useState<"dashboard" | "meetings">("dashboard");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAttendeeDialog, setShowAttendeeDialog] = useState(false);
  const [showPwnDialog, setShowPwnDialog] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [detailTab, setDetailTab] = useState<"overview" | "attendees" | "notices" | "consent">("overview");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  async function fetchJson(url: string) {
    const res = await authFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function postJson(url: string, body: Record<string, unknown>) {
    const res = await authFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as Record<string, string>).error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function patchJson(url: string, body: Record<string, unknown>) {
    const res = await authFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as Record<string, string>).error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function deleteJson(url: string) {
    const res = await authFetch(url, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadDashboard() {
    try {
      const d = await fetchJson("/api/iep-meetings/dashboard");
      setDashboard(d);
    } catch { /* ignore */ }
  }

  async function loadMeetings() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("meetingType", typeFilter);
      const qs = params.toString();
      const data = await fetchJson(`/api/iep-meetings${qs ? `?${qs}` : ""}`);
      setMeetings(Array.isArray(data) ? data : []);
    } catch { setMeetings([]); }
    finally { setLoading(false); }
  }

  async function loadStudents() {
    try {
      const res = await authFetch("/api/students");
      if (res.ok) {
        const s = await res.json();
        setStudents(Array.isArray(s) ? s : []);
      }
    } catch { /* ignore */ }
  }

  async function loadMeetingDetail(id: number) {
    try {
      const d = await fetchJson(`/api/iep-meetings/${id}`);
      setSelectedMeeting(d);
    } catch {
      toast.error("Failed to load meeting details");
    }
  }

  useEffect(() => { loadDashboard(); loadStudents(); }, []);
  useEffect(() => { if (tab === "meetings") loadMeetings(); }, [tab, statusFilter, typeFilter]);

  async function handleCreateMeeting(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const studentId = Number(fd.get("studentId"));
    if (!studentId) { toast.error("Select a student"); return; }

    try {
      await postJson("/api/iep-meetings", {
        studentId,
        meetingType: fd.get("meetingType") as string,
        scheduledDate: fd.get("scheduledDate") as string,
        scheduledTime: fd.get("scheduledTime") || null,
        duration: fd.get("duration") ? Number(fd.get("duration")) : null,
        location: fd.get("location") || null,
        meetingFormat: fd.get("meetingFormat") || "in_person",
        notes: fd.get("notes") || null,
      });
      toast.success("Meeting scheduled");
      setShowCreateDialog(false);
      loadMeetings();
      loadDashboard();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to schedule meeting");
    }
  }

  async function handleAddAttendee(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedMeeting) return;
    const fd = new FormData(e.currentTarget);
    try {
      await postJson(`/api/iep-meetings/${selectedMeeting.id}/attendees`, {
        name: fd.get("name") as string,
        role: fd.get("role") as string,
        email: fd.get("email") || null,
      });
      toast.success("Attendee added");
      setShowAttendeeDialog(false);
      loadMeetingDetail(selectedMeeting.id);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to add attendee");
    }
  }

  async function handleCreatePwn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedMeeting) return;
    const fd = new FormData(e.currentTarget);
    try {
      await postJson(`/api/iep-meetings/${selectedMeeting.id}/notices`, {
        noticeType: fd.get("noticeType") as string,
        actionProposed: fd.get("actionProposed") as string,
        reasonForAction: fd.get("reasonForAction") || null,
        optionsConsidered: fd.get("optionsConsidered") || null,
        reasonOptionsRejected: fd.get("reasonOptionsRejected") || null,
        evaluationInfo: fd.get("evaluationInfo") || null,
      });
      toast.success("Prior written notice created");
      setShowPwnDialog(false);
      loadMeetingDetail(selectedMeeting.id);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to create notice");
    }
  }

  async function handleCreateConsent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedMeeting) return;
    const fd = new FormData(e.currentTarget);
    try {
      await postJson(`/api/iep-meetings/${selectedMeeting.id}/consent`, {
        consentType: fd.get("consentType") as string,
        decision: fd.get("decision") as string,
        respondentName: fd.get("respondentName") || null,
        respondentRelationship: fd.get("respondentRelationship") || null,
        decisionDate: fd.get("decisionDate") || null,
        notes: fd.get("notes") || null,
      });
      toast.success("Consent recorded");
      setShowConsentDialog(false);
      loadMeetingDetail(selectedMeeting.id);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to record consent");
    }
  }

  async function toggleAttendance(attendeeId: number, attended: boolean) {
    try {
      await patchJson(`/api/iep-meetings/attendees/${attendeeId}`, { attended });
      if (selectedMeeting) loadMeetingDetail(selectedMeeting.id);
    } catch { toast.error("Failed to update attendance"); }
  }

  async function completeMeeting(id: number) {
    try {
      await postJson(`/api/iep-meetings/${id}/complete`, { outcome: "Meeting concluded" });
      toast.success("Meeting marked complete");
      loadMeetings();
      loadDashboard();
      if (selectedMeeting?.id === id) loadMeetingDetail(id);
    } catch { toast.error("Failed to complete meeting"); }
  }

  async function cancelMeeting(id: number) {
    try {
      await patchJson(`/api/iep-meetings/${id}`, { status: "cancelled" });
      toast.success("Meeting cancelled");
      loadMeetings();
      loadDashboard();
      if (selectedMeeting?.id === id) loadMeetingDetail(id);
    } catch { toast.error("Failed to cancel meeting"); }
  }

  async function deleteMeeting(id: number) {
    try {
      await deleteJson(`/api/iep-meetings/${id}`);
      toast.success("Meeting deleted");
      setSelectedMeeting(null);
      loadMeetings();
      loadDashboard();
    } catch { toast.error("Failed to delete meeting"); }
  }

  function formatDate(d: string | null) {
    if (!d) return "—";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function daysFromNow(d: string) {
    const diff = Math.ceil((new Date(d + "T00:00:00").getTime() - Date.now()) / 86400000);
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return "Today";
    return `${diff}d away`;
  }

  const tabs = [
    { id: "dashboard" as const, label: "Overview" },
    { id: "meetings" as const, label: "All Meetings" },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">IEP Meetings</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">Team meeting scheduling, attendance, PWN & consent tracking</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="w-4 h-4 mr-1.5" /> Schedule Meeting
        </Button>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSelectedMeeting(null); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>{t.label}</button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardView dashboard={dashboard} onSelectMeeting={(id) => { setTab("meetings"); loadMeetingDetail(id); setExpandedId(id); }} formatDate={formatDate} daysFromNow={daysFromNow} />}

      {tab === "meetings" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-wrap gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(MEETING_STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(MEETING_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : meetings.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-gray-400">No meetings found</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {meetings.map(m => {
                  const sc = MEETING_STATUS_CONFIG[m.status] ?? MEETING_STATUS_CONFIG.scheduled;
                  const isExpanded = expandedId === m.id;
                  return (
                    <Card key={m.id} className={`cursor-pointer transition-shadow hover:shadow-sm ${selectedMeeting?.id === m.id ? "ring-1 ring-emerald-300" : ""}`}
                      onClick={() => { setExpandedId(isExpanded ? null : m.id); loadMeetingDetail(m.id); }}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm text-gray-900 truncate">{m.studentName}</span>
                                <Badge variant="outline" className={sc.className + " text-xs"}>{sc.label}</Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                                <span>{MEETING_TYPES[m.meetingType] ?? m.meetingType}</span>
                                <span>{formatDate(m.scheduledDate)}</span>
                                {m.scheduledTime && <span>{m.scheduledTime}</span>}
                                {m.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{m.location}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${m.status === "scheduled" && m.scheduledDate < new Date().toISOString().split("T")[0] ? "text-red-600" : "text-gray-400"}`}>
                              {m.status === "scheduled" ? daysFromNow(m.scheduledDate) : ""}
                            </span>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {selectedMeeting ? (
              <MeetingDetail
                meeting={selectedMeeting}
                detailTab={detailTab}
                setDetailTab={setDetailTab}
                onAddAttendee={() => setShowAttendeeDialog(true)}
                onAddPwn={() => setShowPwnDialog(true)}
                onAddConsent={() => setShowConsentDialog(true)}
                onToggleAttendance={toggleAttendance}
                onComplete={() => completeMeeting(selectedMeeting.id)}
                onCancel={() => cancelMeeting(selectedMeeting.id)}
                onDelete={() => deleteMeeting(selectedMeeting.id)}
                formatDate={formatDate}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-gray-400 text-sm">
                  Select a meeting to view details
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Schedule IEP Meeting</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateMeeting} className="space-y-4">
            <div>
              <Label>Student</Label>
              <Select name="studentId">
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {students.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}{s.grade ? ` (${s.grade})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Meeting Type</Label>
                <Select name="meetingType" defaultValue="annual_review">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MEETING_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Format</Label>
                <Select name="meetingFormat" defaultValue="in_person">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date</Label><Input type="date" name="scheduledDate" required /></div>
              <div><Label>Time</Label><Input type="time" name="scheduledTime" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Duration (min)</Label><Input type="number" name="duration" placeholder="60" /></div>
              <div><Label>Location</Label><Input name="location" placeholder="Room 204" /></div>
            </div>
            <div><Label>Notes</Label><Textarea name="notes" rows={2} placeholder="Meeting agenda or notes..." /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Schedule</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showAttendeeDialog} onOpenChange={setShowAttendeeDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Attendee</DialogTitle></DialogHeader>
          <form onSubmit={handleAddAttendee} className="space-y-4">
            <div><Label>Name</Label><Input name="name" required placeholder="Full name" /></div>
            <div>
              <Label>Role</Label>
              <Select name="role" defaultValue="team_member">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lea_representative">LEA Representative</SelectItem>
                  <SelectItem value="special_education_teacher">Special Ed Teacher</SelectItem>
                  <SelectItem value="general_education_teacher">General Ed Teacher</SelectItem>
                  <SelectItem value="parent_guardian">Parent/Guardian</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="school_psychologist">School Psychologist</SelectItem>
                  <SelectItem value="slp">SLP</SelectItem>
                  <SelectItem value="ot">OT</SelectItem>
                  <SelectItem value="pt">PT</SelectItem>
                  <SelectItem value="bcba">BCBA</SelectItem>
                  <SelectItem value="counselor">Counselor</SelectItem>
                  <SelectItem value="interpreter">Interpreter</SelectItem>
                  <SelectItem value="advocate">Advocate</SelectItem>
                  <SelectItem value="team_member">Team Member</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Email</Label><Input name="email" type="email" placeholder="Optional" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAttendeeDialog(false)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showPwnDialog} onOpenChange={setShowPwnDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Prior Written Notice (N1/N2)</DialogTitle></DialogHeader>
          <form onSubmit={handleCreatePwn} className="space-y-4">
            <div>
              <Label>Notice Type</Label>
              <Select name="noticeType" defaultValue="propose_action">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(NOTICE_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Action Proposed/Refused</Label><Textarea name="actionProposed" required rows={2} placeholder="Describe the action..." /></div>
            <div><Label>Reason for Action</Label><Textarea name="reasonForAction" rows={2} placeholder="Why is this action proposed?" /></div>
            <div><Label>Options Considered</Label><Textarea name="optionsConsidered" rows={2} placeholder="Other options considered..." /></div>
            <div><Label>Why Options Rejected</Label><Textarea name="reasonOptionsRejected" rows={2} placeholder="Reason other options were rejected..." /></div>
            <div><Label>Evaluation Info</Label><Textarea name="evaluationInfo" rows={2} placeholder="Evaluation procedures, assessments, records..." /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowPwnDialog(false)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Create Notice</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showConsentDialog} onOpenChange={setShowConsentDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Consent</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateConsent} className="space-y-4">
            <div>
              <Label>Consent Type</Label>
              <Select name="consentType" defaultValue="iep_implementation">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONSENT_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Decision</Label>
              <Select name="decision" defaultValue="consent_given">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consent_given">Consent Given</SelectItem>
                  <SelectItem value="consent_refused">Consent Refused</SelectItem>
                  <SelectItem value="partial_consent">Partial Consent</SelectItem>
                  <SelectItem value="revoked">Consent Revoked</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Respondent Name</Label><Input name="respondentName" placeholder="Parent/Guardian name" /></div>
              <div><Label>Relationship</Label><Input name="respondentRelationship" placeholder="e.g., Mother" /></div>
            </div>
            <div><Label>Decision Date</Label><Input type="date" name="decisionDate" /></div>
            <div><Label>Notes</Label><Textarea name="notes" rows={2} placeholder="Additional notes..." /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowConsentDialog(false)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Record</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DashboardView({ dashboard, onSelectMeeting, formatDate, daysFromNow }: {
  dashboard: DashboardData | null;
  onSelectMeeting: (id: number) => void;
  formatDate: (d: string | null) => string;
  daysFromNow: (d: string) => string;
}) {
  if (!dashboard) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  const stats = [
    { label: "This Week", value: dashboard.thisWeekCount, icon: CalendarDays, color: "text-emerald-600" },
    { label: "Upcoming (30d)", value: dashboard.upcomingCount, icon: Clock, color: "text-gray-600" },
    { label: "Overdue", value: dashboard.overdueCount, icon: AlertTriangle, color: "text-red-600" },
    { label: "Pending Consent", value: dashboard.pendingConsentCount, icon: FileText, color: "text-gray-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="py-4 px-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-gray-500">{s.label}</span>
              </div>
              <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {dashboard.overdueMeetings.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Overdue Meetings</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {dashboard.overdueMeetings.map(m => (
                <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-red-50 cursor-pointer hover:bg-red-100 transition-colors"
                  onClick={() => onSelectMeeting(m.id)}>
                  <div>
                    <span className="text-sm font-medium text-gray-900">{m.studentName}</span>
                    <span className="text-xs text-gray-500 ml-2">{MEETING_TYPES[m.meetingType] ?? m.meetingType}</span>
                  </div>
                  <span className="text-xs text-red-600 font-medium">{daysFromNow(m.scheduledDate)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-emerald-600" /> Upcoming Meetings</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {dashboard.upcomingMeetings.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No upcoming meetings</p>
            ) : dashboard.upcomingMeetings.map(m => (
              <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onSelectMeeting(m.id)}>
                <div>
                  <span className="text-sm font-medium text-gray-900">{m.studentName}</span>
                  <span className="text-xs text-gray-500 ml-2">{MEETING_TYPES[m.meetingType] ?? m.meetingType}</span>
                </div>
                <span className="text-xs text-gray-500">{formatDate(m.scheduledDate)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {dashboard.overdueAnnualReviewStudents.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> Annual Reviews Needed</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {dashboard.overdueAnnualReviewStudents.map(s => (
                <div key={s.studentId} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50">
                  <div>
                    <Link href={`/students/${s.studentId}`} className="text-sm font-medium text-emerald-700 hover:underline">{s.studentName}</Link>
                    {s.grade && <span className="text-xs text-gray-500 ml-2">Grade {s.grade}</span>}
                  </div>
                  <span className="text-xs text-red-600">IEP ends {formatDate(s.iepEndDate)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  lea_representative: "LEA Rep",
  special_education_teacher: "SPED Teacher",
  general_education_teacher: "Gen Ed Teacher",
  parent_guardian: "Parent/Guardian",
  student: "Student",
  school_psychologist: "Psychologist",
  slp: "SLP",
  ot: "OT",
  pt: "PT",
  bcba: "BCBA",
  counselor: "Counselor",
  interpreter: "Interpreter",
  advocate: "Advocate",
  team_member: "Team Member",
  other: "Other",
};

function MeetingDetail({
  meeting, detailTab, setDetailTab, onAddAttendee, onAddPwn, onAddConsent,
  onToggleAttendance, onComplete, onCancel, onDelete, formatDate,
}: {
  meeting: Meeting;
  detailTab: string;
  setDetailTab: (t: "overview" | "attendees" | "notices" | "consent") => void;
  onAddAttendee: () => void;
  onAddPwn: () => void;
  onAddConsent: () => void;
  onToggleAttendance: (id: number, v: boolean) => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
  formatDate: (d: string | null) => string;
}) {
  const sc = MEETING_STATUS_CONFIG[meeting.status] ?? MEETING_STATUS_CONFIG.scheduled;
  const detailTabs = [
    { id: "overview" as const, label: "Info", icon: CalendarDays },
    { id: "attendees" as const, label: `Team (${meeting.attendeeRecords?.length ?? 0})`, icon: Users },
    { id: "notices" as const, label: `PWN (${meeting.priorWrittenNotices?.length ?? 0})`, icon: FileText },
    { id: "consent" as const, label: `Consent (${meeting.consentRecords?.length ?? 0})`, icon: ClipboardCheck },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-900">{meeting.studentName}</CardTitle>
          <Badge variant="outline" className={sc.className + " text-xs"}>{sc.label}</Badge>
        </div>
        <p className="text-xs text-gray-500">{MEETING_TYPES[meeting.meetingType] ?? meeting.meetingType}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1 border-b border-gray-100">
          {detailTabs.map(t => (
            <button key={t.id} onClick={() => setDetailTab(t.id)}
              className={`px-2.5 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                detailTab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}>{t.label}</button>
          ))}
        </div>

        {detailTab === "overview" && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-gray-500 text-xs">Date</span><p className="font-medium">{formatDate(meeting.scheduledDate)}</p></div>
              <div><span className="text-gray-500 text-xs">Time</span><p className="font-medium">{meeting.scheduledTime || "TBD"}</p></div>
              <div><span className="text-gray-500 text-xs">Location</span><p className="font-medium">{meeting.location || "TBD"}</p></div>
              <div><span className="text-gray-500 text-xs">Format</span><p className="font-medium">{FORMAT_LABELS[meeting.meetingFormat ?? ""] ?? meeting.meetingFormat ?? "—"}</p></div>
              {meeting.duration && <div><span className="text-gray-500 text-xs">Duration</span><p className="font-medium">{meeting.duration} min</p></div>}
              {meeting.consentStatus && <div><span className="text-gray-500 text-xs">Consent</span><p className="font-medium capitalize">{meeting.consentStatus}</p></div>}
            </div>
            {meeting.notes && <div><span className="text-gray-500 text-xs">Notes</span><p className="text-gray-700 text-xs mt-0.5">{meeting.notes}</p></div>}
            {meeting.outcome && <div><span className="text-gray-500 text-xs">Outcome</span><p className="text-gray-700 text-xs mt-0.5">{meeting.outcome}</p></div>}

            {meeting.status !== "completed" && meeting.status !== "cancelled" && (
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={onComplete}>
                  <CheckCircle className="w-3 h-3 mr-1" /> Complete
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={onCancel}>
                  <XCircle className="w-3 h-3 mr-1" /> Cancel
                </Button>
                <Button size="sm" variant="ghost" className="text-xs text-red-500 hover:text-red-700 ml-auto" onClick={onDelete}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        )}

        {detailTab === "attendees" && (
          <div className="space-y-2">
            <Button size="sm" variant="outline" className="text-xs w-full" onClick={onAddAttendee}>
              <Plus className="w-3 h-3 mr-1" /> Add Attendee
            </Button>
            {(meeting.attendeeRecords ?? []).length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">No attendees added yet</p>
            ) : (meeting.attendeeRecords ?? []).map(a => (
              <div key={a.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50">
                <div>
                  <span className="text-sm font-medium text-gray-900">{a.name}</span>
                  <span className="text-xs text-gray-500 ml-2">{ROLE_LABELS[a.role] ?? a.role}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleAttendance(a.id, !a.attended); }}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    a.attended ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-gray-400 border-gray-200 hover:border-emerald-300"
                  }`}>
                  {a.attended ? "Present" : "Mark Present"}
                </button>
              </div>
            ))}
          </div>
        )}

        {detailTab === "notices" && (
          <div className="space-y-2">
            <Button size="sm" variant="outline" className="text-xs w-full" onClick={onAddPwn}>
              <Plus className="w-3 h-3 mr-1" /> Add Prior Written Notice
            </Button>
            {(meeting.priorWrittenNotices ?? []).length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">No prior written notices</p>
            ) : (meeting.priorWrittenNotices ?? []).map(n => (
              <div key={n.id} className="py-2 px-2 rounded bg-gray-50 space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">{NOTICE_TYPES[n.noticeType] ?? n.noticeType}</Badge>
                  <Badge variant="outline" className={`text-xs ${n.status === "issued" ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-500"}`}>
                    {n.status}
                  </Badge>
                </div>
                <p className="text-xs text-gray-700">{n.actionProposed}</p>
                {n.parentResponseReceived && <p className="text-xs text-gray-500">Response: {n.parentResponseReceived}</p>}
              </div>
            ))}
          </div>
        )}

        {detailTab === "consent" && (
          <div className="space-y-2">
            <Button size="sm" variant="outline" className="text-xs w-full" onClick={onAddConsent}>
              <Plus className="w-3 h-3 mr-1" /> Record Consent
            </Button>
            {(meeting.consentRecords ?? []).length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">No consent records</p>
            ) : (meeting.consentRecords ?? []).map(c => (
              <div key={c.id} className="py-2 px-2 rounded bg-gray-50 space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">{CONSENT_TYPES[c.consentType] ?? c.consentType}</Badge>
                  <Badge variant="outline" className={`text-xs ${
                    c.decision === "consent_given" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    c.decision === "consent_refused" ? "bg-red-50 text-red-600 border-red-200" :
                    "bg-gray-50 text-gray-500"
                  }`}>
                    {c.decision.replace(/_/g, " ")}
                  </Badge>
                </div>
                {c.respondentName && <p className="text-xs text-gray-600">{c.respondentName}{c.respondentRelationship ? ` (${c.respondentRelationship})` : ""}</p>}
                {c.decisionDate && <p className="text-xs text-gray-500">{formatDate(c.decisionDate)}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
