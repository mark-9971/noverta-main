import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, Plus, Users, CheckCircle, XCircle, Trash2,
  FileText, ClipboardCheck, ListChecks,
} from "lucide-react";
import { MeetingPrepChecklist } from "@/components/meeting-prep-checklist";
import type { Meeting, DetailTab } from "./types";
import { MEETING_TYPES, MEETING_STATUS_CONFIG, FORMAT_LABELS, NOTICE_TYPES, CONSENT_TYPES, ROLE_LABELS } from "./constants";

interface Props {
  meeting: Meeting;
  detailTab: DetailTab;
  setDetailTab: (t: DetailTab) => void;
  onAddAttendee: () => void;
  onAddPwn: () => void;
  onAddConsent: () => void;
  onToggleAttendance: (id: number, v: boolean) => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
  formatDate: (d: string | null) => string;
}

export function MeetingDetail({
  meeting, detailTab, setDetailTab, onAddAttendee, onAddPwn, onAddConsent,
  onToggleAttendance, onComplete, onCancel, onDelete, formatDate,
}: Props) {
  const sc = MEETING_STATUS_CONFIG[meeting.status] ?? MEETING_STATUS_CONFIG.scheduled;
  const detailTabs = [
    { id: "overview" as const, label: "Info", icon: CalendarDays },
    { id: "prep" as const, label: "Prep", icon: ListChecks },
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

        {detailTab === "prep" && (
          <MeetingPrepChecklist meetingId={meeting.id} />
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
