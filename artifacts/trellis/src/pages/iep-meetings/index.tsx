import { useState, useEffect, lazy, Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { useSearch } from "wouter";
import { Plus } from "lucide-react";
import type { Meeting, DashboardData, StudentOption, DetailTab } from "./types";
import { DashboardView } from "./DashboardView";
import { MeetingList } from "./MeetingList";
import { MeetingDetail } from "./MeetingDetail";
import { CreateMeetingDialog } from "./CreateMeetingDialog";
import { AttendeeDialog } from "./AttendeeDialog";
import { PwnDialog } from "./PwnDialog";
import { ConsentDialog } from "./ConsentDialog";
import { fetchJson, postJson, patchJson, deleteJson, formatDate, daysFromNow } from "./api";

const IepCalendar = lazy(() => import("@/pages/iep-calendar"));

export default function IepMeetings({ embedded = false }: { embedded?: boolean } = {}) {
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const urlFilter = urlParams.get("filter");
  const urlTab = urlParams.get("tab");
  const [tab, setTab] = useState<"dashboard" | "meetings" | "calendar">(
    urlTab === "calendar" ? "calendar" : urlFilter === "overdue" ? "meetings" : "dashboard"
  );
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
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [meetingReadiness, setMeetingReadiness] = useState<Record<number, number>>({});
  const [statusFilter, setStatusFilter] = useState(urlFilter === "overdue" ? "overdue" : "all");
  const [typeFilter, setTypeFilter] = useState("all");

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
      const list: Meeting[] = Array.isArray(data) ? data : [];
      setMeetings(list);
      const scheduled = list.filter(m => m.status === "scheduled");
      const readinessMap: Record<number, number> = {};
      await Promise.all(scheduled.map(async (m) => {
        try {
          const res = await authFetch(`/api/iep-meetings/${m.id}/prep`);
          if (res.ok) {
            const p = await res.json();
            readinessMap[m.id] = p.readiness?.percentage ?? 0;
          }
        } catch { /* skip */ }
      }));
      setMeetingReadiness(readinessMap);
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

  async function submitMeetingForm(
    e: React.FormEvent<HTMLFormElement>,
    path: string,
    fields: string[],
    successMsg: string,
    failMsg: string,
    closeDialog: () => void,
  ) {
    e.preventDefault();
    if (!selectedMeeting) return;
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const f of fields) body[f] = fd.get(f) || null;
    try {
      await postJson(`/api/iep-meetings/${selectedMeeting.id}/${path}`, body);
      toast.success(successMsg);
      closeDialog();
      loadMeetingDetail(selectedMeeting.id);
    } catch (err: unknown) {
      toast.error((err as Error).message || failMsg);
    }
  }

  const handleAddAttendee = (e: React.FormEvent<HTMLFormElement>) =>
    submitMeetingForm(e, "attendees", ["name", "role", "email"], "Attendee added", "Failed to add attendee", () => setShowAttendeeDialog(false));

  const handleCreatePwn = (e: React.FormEvent<HTMLFormElement>) =>
    submitMeetingForm(e, "notices", ["noticeType", "actionProposed", "reasonForAction", "optionsConsidered", "reasonOptionsRejected", "evaluationInfo"], "Prior written notice created", "Failed to create notice", () => setShowPwnDialog(false));

  const handleCreateConsent = (e: React.FormEvent<HTMLFormElement>) =>
    submitMeetingForm(e, "consent", ["consentType", "decision", "respondentName", "respondentRelationship", "decisionDate", "notes"], "Consent recorded", "Failed to record consent", () => setShowConsentDialog(false));

  async function toggleAttendance(attendeeId: number, attended: boolean) {
    try {
      await patchJson(`/api/iep-meetings/attendees/${attendeeId}`, { attended });
      if (selectedMeeting) loadMeetingDetail(selectedMeeting.id);
    } catch { toast.error("Failed to update attendance"); }
  }

  async function updateMeetingStatus(id: number, action: "complete" | "cancel" | "delete") {
    try {
      if (action === "complete") await postJson(`/api/iep-meetings/${id}/complete`, { outcome: "Meeting concluded" });
      else if (action === "cancel") await patchJson(`/api/iep-meetings/${id}`, { status: "cancelled" });
      else await deleteJson(`/api/iep-meetings/${id}`);
      toast.success(action === "complete" ? "Meeting marked complete" : action === "cancel" ? "Meeting cancelled" : "Meeting deleted");
      if (action === "delete") setSelectedMeeting(null);
      loadMeetings();
      loadDashboard();
      if (action !== "delete" && selectedMeeting?.id === id) loadMeetingDetail(id);
    } catch { toast.error(`Failed to ${action} meeting`); }
  }

  const tabs = [
    { id: "dashboard" as const, label: "Overview" },
    { id: "meetings" as const, label: "All Meetings" },
    { id: "calendar" as const, label: "Calendar" },
  ];

  return (
    <div className={embedded ? "space-y-6" : "p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6"}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">IEP Meetings</h1>
            <p className="text-xs md:text-sm text-gray-400 mt-1">Team meeting scheduling, attendance, PWN & consent tracking</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="w-4 h-4 mr-1.5" /> Schedule Meeting
          </Button>
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSelectedMeeting(null); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>{t.label}</button>
        ))}
      </div>

      {tab === "dashboard" && (
        <DashboardView
          dashboard={dashboard}
          onSelectMeeting={(id) => { setTab("meetings"); loadMeetingDetail(id); setExpandedId(id); }}
          formatDate={formatDate}
          daysFromNow={daysFromNow}
        />
      )}

      {tab === "calendar" && (
        <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-2xl" />}>
          <IepCalendar embedded={true} />
        </Suspense>
      )}

      {tab === "meetings" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <MeetingList
              meetings={meetings}
              loading={loading}
              statusFilter={statusFilter}
              typeFilter={typeFilter}
              setStatusFilter={setStatusFilter}
              setTypeFilter={setTypeFilter}
              selectedMeetingId={selectedMeeting?.id ?? null}
              expandedId={expandedId}
              meetingReadiness={meetingReadiness}
              onSelectMeeting={(id) => {
                setExpandedId(expandedId === id ? null : id);
                loadMeetingDetail(id);
              }}
              onCreate={() => setShowCreateDialog(true)}
              formatDate={formatDate}
              daysFromNow={daysFromNow}
            />
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
                onComplete={() => updateMeetingStatus(selectedMeeting.id, "complete")}
                onCancel={() => updateMeetingStatus(selectedMeeting.id, "cancel")}
                onDelete={() => updateMeetingStatus(selectedMeeting.id, "delete")}
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

      <CreateMeetingDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        students={students}
        onSubmit={handleCreateMeeting}
      />
      <AttendeeDialog
        open={showAttendeeDialog}
        onOpenChange={setShowAttendeeDialog}
        onSubmit={handleAddAttendee}
      />
      <PwnDialog
        open={showPwnDialog}
        onOpenChange={setShowPwnDialog}
        onSubmit={handleCreatePwn}
      />
      <ConsentDialog
        open={showConsentDialog}
        onOpenChange={setShowConsentDialog}
        onSubmit={handleCreateConsent}
      />
    </div>
  );
}
