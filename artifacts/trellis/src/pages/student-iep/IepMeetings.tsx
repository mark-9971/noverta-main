import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, CheckCircle2, ChevronDown, Download, Loader2, Mail, MailCheck, MailX, MapPin, Plus, Printer,
  Save, UserPlus, Users, Video, X
} from "lucide-react";
import { toast } from "sonner";
import { createTeamMeeting, deleteTeamMeeting, updateTeamMeeting } from "@workspace/api-client-react";

export interface ActionItem { id: string; description: string; assignee: string; dueDate: string | null; status: "open" | "completed" }
export interface TeamMeeting {
  id: number; studentId: number; meetingType: string; scheduledDate: string;
  scheduledTime: string | null; duration: number | null; location: string | null;
  meetingFormat: string | null; status: string;
  agendaItems: string[] | null;
  attendees: { name: string; role: string; present?: boolean }[] | null;
  notes: string | null;
  actionItems: ActionItem[] | null;
  outcome: string | null; followUpDate: string | null; minutesFinalized: boolean | null;
  consentStatus: string | null; noticeSentDate: string | null;
  emailDeliverySummary?: { total: number; delivered: number; failed: number; pending: number } | null;
}

function MeetingInviteDeliveryBadge({ summary }: { summary?: TeamMeeting["emailDeliverySummary"] }) {
  if (!summary || summary.total === 0) return null;
  if (summary.failed > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-red-500 font-medium" title={`${summary.failed} invite(s) failed`}>
        <MailX className="w-3 h-3" /> {summary.failed} invite{summary.failed !== 1 ? "s" : ""} failed
      </span>
    );
  }
  if (summary.delivered > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium" title={`${summary.delivered}/${summary.total} invite(s) delivered`}>
        <MailCheck className="w-3 h-3" /> {summary.delivered}/{summary.total} delivered
      </span>
    );
  }
  if (summary.pending > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 font-medium" title={`${summary.pending} invite(s) sent`}>
        <Mail className="w-3 h-3" /> {summary.pending} invite{summary.pending !== 1 ? "s" : ""} sent
      </span>
    );
  }
  return null;
}

import type { Student, IepDocument } from "./IepDocumentSection";
import type { IepGoal } from "./IepGoalForm";
import type { Accommodation } from "./IepAccommodations";

const MEETING_TYPES = [
  { value: "annual", label: "Annual IEP Review" },
  { value: "initial", label: "Initial Eligibility" },
  { value: "reevaluation", label: "Reevaluation" },
  { value: "amendment", label: "IEP Amendment" },
  { value: "transition", label: "Transition Planning" },
  { value: "manifestation", label: "Manifestation Determination" },
  { value: "eligibility", label: "Eligibility Meeting" },
  { value: "other", label: "Other Meeting" },
];

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  scheduled: { bg: "bg-gray-100", color: "text-gray-700", label: "Scheduled" },
  completed: { bg: "bg-emerald-100", color: "text-emerald-700", label: "Completed" },
  cancelled: { bg: "bg-gray-100", color: "text-gray-400", label: "Cancelled" },
};

const MEETING_FORMATS = [
  { value: "in-person", label: "In Person", icon: MapPin },
  { value: "virtual", label: "Virtual", icon: Video },
  { value: "hybrid", label: "Hybrid", icon: Users },
];

const SUGGESTED_ATTENDEE_ROLES = [
  "Parent / Guardian", "Student", "Special Education Teacher",
  "General Education Teacher", "School Psychologist",
  "Speech-Language Pathologist", "Occupational Therapist",
  "Physical Therapist", "ABA Therapist / BCBA",
  "School Administrator / LEA Rep", "Social Worker",
  "Paraprofessional", "Interpreter", "Outside Agency Rep",
];

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function MeetingCard({ meeting, onSaved, onDelete }: {
  meeting: TeamMeeting; onSaved: () => void; onDelete: () => void;
}) {
  const [m, setM] = useState<TeamMeeting>(meeting);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"agenda" | "attendees" | "notes" | "actions" | "outcome">("agenda");
  const [saving, setSaving] = useState(false);
  const [newAgenda, setNewAgenda] = useState("");
  const [newAttendee, setNewAttendee] = useState({ name: "", role: "" });
  const [showAttendeeSuggestions, setShowAttendeeSuggestions] = useState(false);
  const [newAction, setNewAction] = useState({ description: "", assignee: "", dueDate: "" });

  async function patch(updates: Partial<TeamMeeting>) {
    setSaving(true);
    try {
      const updated = await updateTeamMeeting(m.id, updates);
      setM(prev => ({ ...prev, ...(updated as Partial<TeamMeeting>) }));
      onSaved();
    } catch { toast.error("Failed to save changes"); }
    setSaving(false);
  }

  function togglePresent(idx: number) {
    const updated = [...(m.attendees || [])];
    updated[idx] = { ...updated[idx], present: !updated[idx].present };
    setM(p => ({ ...p, attendees: updated }));
    patch({ attendees: updated });
  }

  function addAgendaItem() {
    if (!newAgenda.trim()) return;
    const updated = [...(m.agendaItems || []), newAgenda.trim()];
    setM(p => ({ ...p, agendaItems: updated }));
    patch({ agendaItems: updated });
    setNewAgenda("");
  }

  function removeAgendaItem(idx: number) {
    const updated = (m.agendaItems || []).filter((_, i) => i !== idx);
    setM(p => ({ ...p, agendaItems: updated }));
    patch({ agendaItems: updated });
  }

  function addAttendee(name?: string, role?: string) {
    const a = { name: name ?? newAttendee.name.trim(), role: role ?? newAttendee.role.trim(), present: false };
    if (!a.name) return;
    const updated = [...(m.attendees || []), a];
    setM(p => ({ ...p, attendees: updated }));
    patch({ attendees: updated });
    setNewAttendee({ name: "", role: "" });
    setShowAttendeeSuggestions(false);
  }

  function removeAttendee(idx: number) {
    const updated = (m.attendees || []).filter((_, i) => i !== idx);
    setM(p => ({ ...p, attendees: updated }));
    patch({ attendees: updated });
  }

  function addActionItem() {
    if (!newAction.description.trim()) return;
    const item: ActionItem = { id: genId(), description: newAction.description.trim(), assignee: newAction.assignee.trim(), dueDate: newAction.dueDate || null, status: "open" };
    const updated = [...(m.actionItems || []), item];
    setM(p => ({ ...p, actionItems: updated }));
    patch({ actionItems: updated });
    setNewAction({ description: "", assignee: "", dueDate: "" });
  }

  function toggleActionItem(id: string) {
    const updated = (m.actionItems || []).map(a => a.id === id ? { ...a, status: a.status === "open" ? "completed" as const : "open" as const } : a);
    setM(p => ({ ...p, actionItems: updated }));
    patch({ actionItems: updated });
  }

  function removeActionItem(id: string) {
    const updated = (m.actionItems || []).filter(a => a.id !== id);
    setM(p => ({ ...p, actionItems: updated }));
    patch({ actionItems: updated });
  }

  function printMinutes() {
    const win = window.open("", "_blank");
    if (!win) return;
    const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const typeLabel = MEETING_TYPES.find(t => t.value === m.meetingType)?.label ?? m.meetingType;
    const presentAttendees = (m.attendees || []).filter(a => a.present);
    const absentAttendees = (m.attendees || []).filter(a => !a.present);
    const openItems = (m.actionItems || []).filter(a => a.status === "open");
    const doneItems = (m.actionItems || []).filter(a => a.status === "completed");

    win.document.write(`<!DOCTYPE html><html><head><title>Meeting Minutes — ${esc(typeLabel)}</title>
    <style>body{font-family:Arial,sans-serif;margin:40px;font-size:12px;color:#111}
    h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;border-bottom:2px solid #059669;padding-bottom:4px;margin:18px 0 8px}
    .header{border-bottom:3px solid #059669;padding-bottom:12px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse;margin:6px 0 12px}th{background:#f3f4f6;padding:5px 8px;border:1px solid #d1d5db;text-align:left;font-size:11px}
    td{padding:5px 8px;border:1px solid #d1d5db;font-size:11px}
    .item{padding:4px 0;border-bottom:1px solid #f3f4f6;font-size:12px}
    .confidential{background:#fef9c3;border:1px solid #fde68a;padding:8px;border-radius:4px;font-size:10px;margin-top:18px}
    @media print{body{margin:20px}}</style></head><body>
    <div class="header">
      <h1>${esc(typeLabel)}</h1>
      <p style="color:#6b7280;margin:2px 0">Date: ${esc(formatDate(m.scheduledDate))}${m.scheduledTime ? ` at ${esc(m.scheduledTime)}` : ""}${m.duration ? ` · Duration: ${m.duration} min` : ""}</p>
      ${m.location ? `<p style="color:#6b7280;margin:2px 0">Location: ${esc(m.location)}</p>` : ""}
      <p style="color:#6b7280;margin:2px 0">Status: ${esc(STATUS_STYLES[m.status]?.label ?? m.status)}${m.minutesFinalized ? " · MINUTES FINALIZED" : " · DRAFT"}</p>
    </div>

    ${presentAttendees.length > 0 ? `<h2>Attendees Present</h2>
    <table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody>
    ${presentAttendees.map(a => `<tr><td>${esc(a.name)}</td><td>${esc(a.role)}</td></tr>`).join("")}
    </tbody></table>` : ""}

    ${absentAttendees.length > 0 ? `<h2>Unable to Attend</h2>
    ${absentAttendees.map(a => `<p class="item">${esc(a.name)} (${esc(a.role)})</p>`).join("")}` : ""}

    ${m.agendaItems && m.agendaItems.length > 0 ? `<h2>Agenda</h2>
    ${m.agendaItems.map((item, i) => `<p class="item">${i+1}. ${esc(item)}</p>`).join("")}` : ""}

    ${m.notes ? `<h2>Meeting Notes / Minutes</h2><p style="white-space:pre-wrap;font-size:12px;line-height:1.6">${esc(m.notes)}</p>` : ""}

    ${m.outcome ? `<h2>Outcome / Decisions Made</h2><p style="font-size:12px">${esc(m.outcome)}</p>` : ""}

    ${openItems.length > 0 ? `<h2>Open Action Items</h2>
    <table><thead><tr><th>Task</th><th>Assigned To</th><th>Due Date</th></tr></thead><tbody>
    ${openItems.map(a => `<tr><td>${esc(a.description)}</td><td>${esc(a.assignee)}</td><td>${esc(a.dueDate ?? "—")}</td></tr>`).join("")}
    </tbody></table>` : ""}

    ${doneItems.length > 0 ? `<h2>Completed Action Items</h2>
    ${doneItems.map(a => `<p class="item" style="color:#6b7280;text-decoration:line-through">✓ ${esc(a.description)} (${esc(a.assignee)})</p>`).join("")}` : ""}

    ${m.followUpDate ? `<h2>Next Meeting</h2><p style="font-size:12px">Scheduled for: ${esc(formatDate(m.followUpDate))}</p>` : ""}

    ${m.consentStatus ? `<h2>Consent Status</h2><p style="font-size:12px">${esc(m.consentStatus)}</p>` : ""}

    <div class="confidential">CONFIDENTIAL — This document contains protected student information under FERPA and 603 CMR 23.00. Do not distribute without authorization.</div>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }

  const typeLabel = MEETING_TYPES.find(t => t.value === m.meetingType)?.label ?? m.meetingType;
  const statusStyle = STATUS_STYLES[m.status] || { bg: "bg-gray-50", color: "text-gray-600", label: m.status };
  const presentCount = (m.attendees || []).filter(a => a.present).length;
  const totalAttendees = (m.attendees || []).length;
  const openActionCount = (m.actionItems || []).filter(a => a.status === "open").length;
  const fmt = MEETING_FORMATS.find(f => f.value === m.meetingFormat);

  const cardTabs = [
    { key: "agenda" as const, label: "Agenda", count: (m.agendaItems || []).length },
    { key: "attendees" as const, label: "Attendees", count: totalAttendees },
    { key: "notes" as const, label: "Notes / Minutes", count: null },
    { key: "actions" as const, label: "Action Items", count: openActionCount },
    { key: "outcome" as const, label: "Outcome", count: null },
  ];

  return (
    <Card className={`border ${m.minutesFinalized ? "border-emerald-200" : "border-gray-200"}`}>
      <CardContent className="p-0">
        <button className="w-full p-3.5 text-left" onClick={() => setExpanded(e => !e)}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${m.status === "completed" ? "bg-emerald-100" : "bg-gray-100"}`}>
              <CalendarDays className={`w-5 h-5 ${m.status === "completed" ? "text-emerald-700" : "text-gray-500"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-semibold text-gray-800">{typeLabel}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusStyle.bg} ${statusStyle.color}`}>{statusStyle.label}</span>
                {m.minutesFinalized && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">Minutes Finalized</span>}
                {fmt && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><fmt.icon className="w-3 h-3" /> {fmt.label}</span>}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5 flex-wrap">
                <span>{formatDate(m.scheduledDate)}{m.scheduledTime ? ` · ${m.scheduledTime}` : ""}{m.duration ? ` · ${m.duration} min` : ""}</span>
                {m.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{m.location}</span>}
                {totalAttendees > 0 && <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{m.status === "completed" ? `${presentCount}/${totalAttendees} present` : `${totalAttendees} invited`}</span>}
                {openActionCount > 0 && <span className="text-amber-600 font-medium">{openActionCount} open action{openActionCount !== 1 ? "s" : ""}</span>}
                <MeetingInviteDeliveryBadge summary={m.emailDeliverySummary} />
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </div>
        </button>

        {expanded && (
          <div className="border-t border-gray-100">
            <div className="flex items-center gap-0.5 border-b border-gray-100 px-3 overflow-x-auto">
              {cardTabs.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`px-3 py-2 text-[11px] font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === t.key ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                  {t.label}{t.count !== null && t.count > 0 ? ` (${t.count})` : ""}
                </button>
              ))}
            </div>

            <div className="p-3.5 space-y-3">
              {activeTab === "agenda" && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    {(m.agendaItems || []).length === 0 && <p className="text-[12px] text-gray-400 italic">No agenda items yet. Add items below.</p>}
                    {(m.agendaItems || []).map((item, i) => (
                      <div key={i} className="flex items-start gap-2 group bg-gray-50 rounded p-2">
                        <span className="text-[11px] font-bold text-gray-400 mt-0.5 w-4 flex-shrink-0">{i+1}.</span>
                        <p className="text-[12px] text-gray-700 flex-1">{item}</p>
                        <button onClick={() => removeAgendaItem(i)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={newAgenda} onChange={e => setNewAgenda(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addAgendaItem(); } }}
                      placeholder="Add agenda item…"
                      className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                    <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={addAgendaItem}><Plus className="w-3 h-3 mr-1" /> Add</Button>
                  </div>
                </div>
              )}

              {activeTab === "attendees" && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    {(m.attendees || []).length === 0 && <p className="text-[12px] text-gray-400 italic">No attendees added yet.</p>}
                    {(m.attendees || []).map((a, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 rounded p-2 group">
                        <button onClick={() => togglePresent(i)}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${a.present ? "bg-emerald-600 border-emerald-600 text-white" : "border-gray-300 text-transparent hover:border-emerald-400"}`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-700">{a.name}</p>
                          <p className="text-[11px] text-gray-400">{a.role}</p>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.present ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{a.present ? "Present" : "Absent"}</span>
                        <button onClick={() => removeAttendee(i)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="relative">
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setShowAttendeeSuggestions(!showAttendeeSuggestions)}>
                      <UserPlus className="w-3 h-3 mr-1" /> Add from Suggestions
                    </Button>
                    {showAttendeeSuggestions && (
                      <div className="absolute z-10 top-8 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-2 gap-1 w-72">
                        {SUGGESTED_ATTENDEE_ROLES.map(role => (
                          <button key={role} onClick={() => addAttendee(role, role)}
                            className="text-left px-2 py-1 text-[11px] text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 rounded">
                            {role}
                          </button>
                        ))}
                        <button onClick={() => setShowAttendeeSuggestions(false)} className="col-span-2 text-center text-[10px] text-gray-400 mt-1">Close</button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <input value={newAttendee.name} onChange={e => setNewAttendee(p => ({ ...p, name: e.target.value }))} placeholder="Name"
                      className="flex-1 min-w-[120px] border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                    <input value={newAttendee.role} onChange={e => setNewAttendee(p => ({ ...p, role: e.target.value }))} placeholder="Role"
                      className="flex-1 min-w-[120px] border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                    <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => addAttendee()}><Plus className="w-3 h-3 mr-1" /> Add</Button>
                  </div>
                </div>
              )}

              {activeTab === "notes" && (
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Meeting Minutes / Notes</p>
                  <textarea value={m.notes || ""} rows={8}
                    onChange={e => setM(p => ({ ...p, notes: e.target.value }))}
                    onBlur={() => patch({ notes: m.notes })}
                    placeholder="Record meeting minutes, discussion points, decisions made, and any other relevant notes here…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                  <p className="text-[10px] text-gray-300">Notes auto-save when you click away.</p>
                </div>
              )}

              {activeTab === "actions" && (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    {(m.actionItems || []).length === 0 && <p className="text-[12px] text-gray-400 italic">No action items yet.</p>}
                    {(m.actionItems || []).map(a => (
                      <div key={a.id} className={`flex items-start gap-2 rounded p-2 group ${a.status === "completed" ? "bg-gray-50 opacity-60" : "bg-amber-50"}`}>
                        <button onClick={() => toggleActionItem(a.id)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${a.status === "completed" ? "bg-emerald-600 border-emerald-600 text-white" : "border-amber-400 text-transparent hover:border-emerald-400"}`}>
                          <CheckCircle2 className="w-3 h-3" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] text-gray-700 ${a.status === "completed" ? "line-through" : "font-medium"}`}>{a.description}</p>
                          <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                            {a.assignee && <span>→ {a.assignee}</span>}
                            {a.dueDate && <span>Due: {formatDate(a.dueDate)}</span>}
                          </div>
                        </div>
                        <button onClick={() => removeActionItem(a.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="border border-gray-200 rounded-lg p-2.5 space-y-2">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Add Action Item</p>
                    <input value={newAction.description} onChange={e => setNewAction(p => ({ ...p, description: e.target.value }))} placeholder="Task description…"
                      className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                    <div className="flex gap-2">
                      <input value={newAction.assignee} onChange={e => setNewAction(p => ({ ...p, assignee: e.target.value }))} placeholder="Assigned to"
                        className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                      <input type="date" value={newAction.dueDate} onChange={e => setNewAction(p => ({ ...p, dueDate: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                      <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white h-8 text-[11px]" onClick={addActionItem}><Plus className="w-3 h-3 mr-1" /> Add</Button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "outcome" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Outcome / Decisions Made</label>
                    <textarea value={m.outcome || ""} rows={3}
                      onChange={e => setM(p => ({ ...p, outcome: e.target.value }))}
                      onBlur={() => patch({ outcome: m.outcome })}
                      placeholder="Summarize the decisions made and key outcomes of this meeting…"
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Next Meeting Date</label>
                    <input type="date" value={m.followUpDate || ""}
                      onChange={e => { setM(p => ({ ...p, followUpDate: e.target.value })); patch({ followUpDate: e.target.value || null }); }}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Parent Consent Status</label>
                      <select value={m.consentStatus || ""}
                        onChange={e => { setM(p => ({ ...p, consentStatus: e.target.value || null })); patch({ consentStatus: e.target.value || null }); }}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                        <option value="">— Not recorded —</option>
                        <option value="Consent given — IEP accepted">Consent given — IEP accepted</option>
                        <option value="Consent given — IEP rejected">Consent given — IEP rejected</option>
                        <option value="Parent did not attend">Parent did not attend</option>
                        <option value="Parent requested additional time">Parent requested additional time</option>
                        <option value="Consent not applicable">Not applicable</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Notice Sent Date</label>
                      <input type="date" value={m.noticeSentDate || ""}
                        onChange={e => { setM(p => ({ ...p, noticeSentDate: e.target.value || null })); patch({ noticeSentDate: e.target.value || null }); }}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 px-3.5 py-2.5 gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                {m.status !== "completed" && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]"
                    onClick={() => { setM(p => ({ ...p, status: "completed" })); patch({ status: "completed" }); }}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Complete
                  </Button>
                )}
                {m.status !== "cancelled" && m.status !== "completed" && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px] text-amber-600 border-amber-200"
                    onClick={() => { setM(p => ({ ...p, status: "cancelled" })); patch({ status: "cancelled" }); }}>
                    Cancel
                  </Button>
                )}
                {saving && <span className="text-[11px] text-gray-400">Saving…</span>}
              </div>
              <div className="flex items-center gap-1.5">
                {!m.minutesFinalized ? (
                  <Button size="sm" variant="outline" className="h-7 text-[11px] text-emerald-700 border-emerald-200"
                    onClick={() => { setM(p => ({ ...p, minutesFinalized: true })); patch({ minutesFinalized: true }); }}>
                    <Save className="w-3 h-3 mr-1" /> Finalize Minutes
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-[11px] text-gray-500"
                    onClick={() => { setM(p => ({ ...p, minutesFinalized: false })); patch({ minutesFinalized: false }); }}>
                    Unfinalize
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={printMinutes}>
                  <Download className="w-3 h-3 mr-1" /> Print Minutes
                </Button>
                <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-1 ml-1"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function generateMeetingPrepPacket(
  student: Student | null,
  meetings: TeamMeeting[],
  goals: IepGoal[],
  accommodations: Accommodation[],
  iepDocs: IepDocument[]
) {
  const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const name = student ? `${student.firstName} ${student.lastName}` : "Student";
  const doc = iepDocs.find(d => d.active) ?? iepDocs[0] ?? null;
  const nextMeeting = [...meetings].filter(m => m.status === "scheduled").sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0] ?? null;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const activeGoals = goals.filter(g => g.active !== false);
  const activeAccs = accommodations.filter(a => a.active !== false);
  const RATING_LABELS: Record<string, string> = {
    mastered: "Mastered", sufficient_progress: "On Track", some_progress: "Making Progress",
    insufficient_progress: "Needs Support", regression: "Concern", not_addressed: "Not Yet Measured",
  };

  const html = `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>Meeting Prep Packet — ${esc(name)}</title>
<style>
  body { font-family: Georgia, serif; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 40px 32px; font-size: 13px; }
  h1 { font-size: 22px; font-weight: bold; margin: 0 0 4px; }
  h2 { font-size: 14px; font-weight: bold; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #d1d5db; color: #1a1a1a; }
  h3 { font-size: 12px; font-weight: bold; margin: 12px 0 4px; color: #374151; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 8px; }
  .info-item label { display: block; font-size: 10px; font-weight: bold; text-transform: uppercase; color: #9ca3af; margin-bottom: 2px; letter-spacing: 0.05em; }
  .info-item span { font-size: 13px; color: #111827; }
  .goal-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 8px; page-break-inside: avoid; }
  .goal-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .goal-num { font-size: 10px; font-weight: bold; background: #e5e7eb; color: #374151; padding: 2px 6px; border-radius: 4px; }
  .rating { font-size: 10px; font-weight: bold; padding: 2px 8px; border-radius: 10px; }
  .rating-ok { background: #d1fae5; color: #065f46; }
  .rating-progress { background: #dbeafe; color: #1e40af; }
  .rating-warn { background: #fef3c7; color: #92400e; }
  .rating-concern { background: #fee2e2; color: #991b1b; }
  .rating-gray { background: #f3f4f6; color: #4b5563; }
  .acc-row { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
  .acc-cat { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #9ca3af; min-width: 90px; margin-top: 1px; }
  .section-empty { font-size: 12px; color: #9ca3af; font-style: italic; padding: 8px 0; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
  @media print { body { padding: 20px; } }
</style></head>
<body>
<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
  <div>
    <h1>${esc(name)}</h1>
    <p class="meta">IEP Team Meeting Prep Packet · Prepared ${esc(today)}</p>
  </div>
  <div style="text-align:right;font-size:11px;color:#9ca3af">
    <p style="margin:0;font-weight:bold;color:#374151">Noverta</p>
    <p style="margin:0">CONFIDENTIAL — Team Use Only</p>
  </div>
</div>

<div class="info-grid">
  <div class="info-item"><label>Student</label><span>${esc(name)}</span></div>
  <div class="info-item"><label>Grade</label><span>${esc(student?.grade ?? "—")}</span></div>
  <div class="info-item"><label>DOB</label><span>${esc((student as any)?.dob ?? "—")}</span></div>
  ${doc ? `
  <div class="info-item"><label>IEP Start</label><span>${esc((doc as any).startDate ?? "—")}</span></div>
  <div class="info-item"><label>IEP End</label><span>${esc((doc as any).endDate ?? "—")}</span></div>
  <div class="info-item"><label>IEP Type</label><span>${esc(doc.iepType ?? "Initial")}</span></div>
  ` : ""}
  ${nextMeeting ? `
  <div class="info-item"><label>Meeting Date</label><span>${esc(nextMeeting.scheduledDate)}</span></div>
  <div class="info-item"><label>Meeting Type</label><span>${esc(nextMeeting.meetingType.replace(/_/g, " "))}</span></div>
  <div class="info-item"><label>Format</label><span>${esc(nextMeeting.meetingFormat ?? "—")}</span></div>
  ` : ""}
</div>

<h2>Annual IEP Goals (${activeGoals.length})</h2>
${activeGoals.length === 0 ? `<p class="section-empty">No active goals on record.</p>` : activeGoals.map((g, i) => {
  const pr = (g as any).progressRating as string | undefined;
  const ratingClass = (["mastered", "sufficient_progress"].includes(pr ?? "") ? "rating-ok"
    : pr === "some_progress" ? "rating-progress"
    : pr === "insufficient_progress" ? "rating-warn"
    : pr === "regression" ? "rating-concern"
    : "rating-gray");
  return `<div class="goal-box">
    <div class="goal-header">
      <span class="goal-num">Goal ${g.goalNumber ?? i + 1}</span>
      <strong style="font-size:12px">${esc(g.goalArea ?? "")}</strong>
      ${pr ? `<span class="rating ${ratingClass}">${esc(RATING_LABELS[pr] ?? pr)}</span>` : ""}
    </div>
    <p style="margin:0 0 6px;font-size:12px;color:#374151">${esc(g.annualGoal)}</p>
    ${g.baseline ? `<p style="margin:0;font-size:11px;color:#6b7280"><strong>Baseline:</strong> ${esc(g.baseline)}</p>` : ""}
    ${g.targetCriterion ? `<p style="margin:0;font-size:11px;color:#6b7280"><strong>Target:</strong> ${esc(g.targetCriterion)}</p>` : ""}
    ${(g as any).currentPerformance ? `<p style="margin:0;font-size:11px;color:#059669"><strong>Current Performance:</strong> ${esc((g as any).currentPerformance)}</p>` : ""}
  </div>`;
}).join("")}

<h2>Accommodations & Modifications (${activeAccs.length})</h2>
${activeAccs.length === 0 ? `<p class="section-empty">No accommodations on record.</p>` : activeAccs.map(a =>
  `<div class="acc-row"><span class="acc-cat">${esc(a.category)}</span><div><span>${esc(a.description)}</span>${a.setting || a.frequency ? `<span style="color:#9ca3af;font-size:11px"> — ${[a.setting, a.frequency].filter(Boolean).join(", ")}</span>` : ""}</div></div>`
).join("")}

<h2>Team Notes & Discussion Topics</h2>
<div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px;min-height:100px;background:#fafafa">
  <p style="margin:0;font-size:11px;color:#d1d5db;font-style:italic">Use this space to add notes before or during the meeting.</p>
</div>

<h2>Action Items from This Meeting</h2>
<div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px;min-height:80px;background:#fafafa">
  <p style="margin:0;font-size:11px;color:#d1d5db;font-style:italic">Record action items, owners, and due dates.</p>
</div>

<div class="footer">
  <span>Generated by Noverta · ${esc(today)}</span>
  <span>CONFIDENTIAL — For IEP Team Use Only</span>
</div>
</body></html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }
}

export function TeamMeetingsSection({ studentId, meetings, onSaved, student, goals, accommodations, iepDocs }: {
  studentId: number; meetings: TeamMeeting[]; onSaved: () => void;
  student?: Student | null; goals?: IepGoal[]; accommodations?: Accommodation[]; iepDocs?: IepDocument[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    meetingType: "annual", scheduledDate: "", scheduledTime: "", duration: "",
    location: "", meetingFormat: "in-person", noticeSentDate: "",
  });

  const sorted = [...meetings].sort((a, b) => {
    if (a.status === "scheduled" && b.status !== "scheduled") return -1;
    if (b.status === "scheduled" && a.status !== "scheduled") return 1;
    return b.scheduledDate.localeCompare(a.scheduledDate);
  });

  const openActions = meetings.flatMap(m => (m.actionItems || []).filter(a => a.status === "open").map(a => ({ ...a, meetingType: m.meetingType, meetingDate: m.scheduledDate })));

  async function addMeeting() {
    if (!form.scheduledDate) return;
    setSaving(true);
    try {
      await createTeamMeeting(studentId, {
          meetingType: form.meetingType,
          scheduledDate: form.scheduledDate,
          scheduledTime: form.scheduledTime || null,
          duration: form.duration ? parseInt(form.duration) : null,
          location: form.location || null,
          meetingFormat: form.meetingFormat || null,
          noticeSentDate: form.noticeSentDate || null,
          status: "scheduled",
        });
      setForm({ meetingType: "annual", scheduledDate: "", scheduledTime: "", duration: "", location: "", meetingFormat: "in-person", noticeSentDate: "" });
      setShowAdd(false);
      onSaved();
      toast.success("Meeting scheduled");
    } catch { toast.error("Failed to schedule meeting"); }
    setSaving(false);
  }

  async function deleteMeeting(id: number) {
    try {
      await deleteTeamMeeting(id);
      onSaved();
      toast.success("Meeting deleted");
    } catch {
      toast.error("Failed to delete meeting");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-700">Team Meetings</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="text-[12px] h-7 gap-1"
            onClick={() => generateMeetingPrepPacket(student ?? null, meetings, goals ?? [], accommodations ?? [], iepDocs ?? [])}>
            <Printer className="w-3 h-3" /> Prep Packet
          </Button>
          <Button size="sm" variant="outline" className="text-[12px] h-7" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="w-3 h-3 mr-1" /> Schedule Meeting
          </Button>
        </div>
      </div>

      {openActions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-[11px] font-semibold text-amber-700 mb-2 uppercase tracking-wider">Open Action Items ({openActions.length})</p>
          <div className="space-y-1">
            {openActions.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px] text-amber-800">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                <span>{a.description}{a.assignee ? ` — ${a.assignee}` : ""}{a.dueDate ? ` (due ${formatDate(a.dueDate)})` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Schedule New Meeting</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Meeting Type</label>
              <select value={form.meetingType} onChange={e => setForm(p => ({ ...p, meetingType: e.target.value }))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                {MEETING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Format</label>
              <select value={form.meetingFormat} onChange={e => setForm(p => ({ ...p, meetingFormat: e.target.value }))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                {MEETING_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Date *</label>
              <input type="date" value={form.scheduledDate} onChange={e => setForm(p => ({ ...p, scheduledDate: e.target.value }))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Time</label>
              <input type="time" value={form.scheduledTime} onChange={e => setForm(p => ({ ...p, scheduledTime: e.target.value }))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Duration (min)</label>
              <input type="number" min="15" max="480" value={form.duration} onChange={e => setForm(p => ({ ...p, duration: e.target.value }))}
                placeholder="60"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Location</label>
              <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                placeholder="e.g. Room 204, Zoom"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Notice Sent Date</label>
              <input type="date" value={form.noticeSentDate} onChange={e => setForm(p => ({ ...p, noticeSentDate: e.target.value }))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
              onClick={addMeeting} disabled={saving || !form.scheduledDate}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarDays className="w-3 h-3 mr-1" />}
              Schedule
            </Button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !showAdd && (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-lg">
          <p className="text-sm text-gray-400">No meetings scheduled.</p>
          <Button size="sm" variant="outline" className="mt-3 text-[12px]" onClick={() => setShowAdd(true)}>
            <Plus className="w-3 h-3 mr-1" /> Schedule First Meeting
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map(m => (
          <MeetingCard
            key={m.id}
            meeting={m}
            onSaved={onSaved}
            onDelete={() => deleteMeeting(m.id)}
          />
        ))}
      </div>
    </div>
  );
}
