import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, Sparkles, ChevronDown, ChevronUp,
  FileText, Users, ClipboardList, AlertTriangle, Loader2,
} from "lucide-react";

interface PrepItem {
  id: number;
  meetingId: number;
  itemType: string;
  label: string;
  description: string;
  required: boolean;
  autoDetected: boolean;
  completedAt: string | null;
  completedByStaffId: number | null;
  notes: string | null;
  sortOrder: number;
}

interface Readiness {
  total: number;
  completed: number;
  percentage: number;
  requiredTotal: number;
  requiredCompleted: number;
  requiredPercentage: number;
}

interface AgendaSection {
  title: string;
  items: string[];
}

interface GoalProgressSummary {
  goalId: number;
  goalArea: string;
  goalNumber: number;
  annualGoal: string | null;
  status: string;
  baseline: string | null;
  targetCriterion: string | null;
  measurementMethod: string | null;
  dataPoints: number;
  latestValue: number | null;
  trend: string;
}

interface Agenda {
  meetingId: number;
  meetingTypeLabel: string;
  scheduledDate: string;
  scheduledTime: string | null;
  location: string | null;
  studentName: string;
  studentGrade: string | null;
  attendees: { name: string; role: string; rsvpStatus: string }[];
  goalsCount: number;
  accommodationsCount: number;
  sections: AgendaSection[];
  goalProgressSummaries: GoalProgressSummary[];
  customAgendaItems: string[];
}

interface PrepData {
  meetingId: number;
  studentId: number;
  meetingType: string;
  scheduledDate: string;
  items: PrepItem[];
  readiness: Readiness;
}

const ITEM_ICONS: Record<string, typeof FileText> = {
  gather_progress_data: ClipboardList,
  draft_review_goals: FileText,
  contact_parent: Users,
  confirm_attendance: Users,
  prepare_pwn: FileText,
  set_location: FileText,
  review_accommodations: ClipboardList,
  prepare_agenda: ClipboardList,
};

export function ReadinessIndicator({ percentage }: { percentage: number }) {
  const color = percentage >= 80 ? "text-emerald-600" : percentage >= 50 ? "text-amber-500" : "text-red-500";
  const bg = percentage >= 80 ? "bg-emerald-100" : percentage >= 50 ? "bg-amber-100" : "bg-red-100";
  const trackColor = percentage >= 80 ? "bg-emerald-500" : percentage >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-8 h-1.5 rounded-full ${bg}`}>
        <div className={`h-full rounded-full ${trackColor} transition-all`} style={{ width: `${percentage}%` }} />
      </div>
      <span className={`text-[10px] font-medium ${color}`}>{percentage}%</span>
    </div>
  );
}

export function MeetingPrepChecklist({ meetingId }: { meetingId: number }) {
  const [prepData, setPrepData] = useState<PrepData | null>(null);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAgenda, setShowAgenda] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());

  const loadPrep = useCallback(async () => {
    try {
      const res = await authFetch(`/api/iep-meetings/${meetingId}/prep`);
      if (!res.ok) throw new Error("Failed to load");
      const data: PrepData = await res.json();
      setPrepData(data);
    } catch {
      toast.error("Failed to load meeting prep");
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  const loadAgenda = useCallback(async () => {
    try {
      const res = await authFetch(`/api/iep-meetings/${meetingId}/agenda`);
      if (!res.ok) throw new Error("Failed to load");
      const data: Agenda = await res.json();
      setAgenda(data);
    } catch {
      toast.error("Failed to load agenda");
    }
  }, [meetingId]);

  useEffect(() => {
    setLoading(true);
    setPrepData(null);
    setAgenda(null);
    setShowAgenda(false);
    loadPrep();
  }, [meetingId, loadPrep]);

  async function toggleItem(itemId: number, currentlyCompleted: boolean) {
    setTogglingIds(prev => new Set(prev).add(itemId));
    try {
      const res = await authFetch(`/api/iep-meetings/${meetingId}/prep/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !currentlyCompleted }),
      });
      if (!res.ok) throw new Error("Failed to update");
      await loadPrep();
      toast.success(currentlyCompleted ? "Item unchecked" : "Item completed");
    } catch {
      toast.error("Failed to update item");
    } finally {
      setTogglingIds(prev => { const n = new Set(prev); n.delete(itemId); return n; });
    }
  }

  async function saveNotes(itemId: number) {
    try {
      const res = await authFetch(`/api/iep-meetings/${meetingId}/prep/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: noteText }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await loadPrep();
      setExpandedNotes(null);
      toast.success("Notes saved");
    } catch {
      toast.error("Failed to save notes");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading prep checklist...
      </div>
    );
  }

  if (!prepData) return null;

  const { items, readiness } = prepData;
  const requiredItems = items.filter(i => i.required);
  const optionalItems = items.filter(i => !i.required);

  return (
    <div className="space-y-3">
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-700">Meeting Readiness</span>
          <span className={`text-sm font-bold ${
            readiness.percentage >= 80 ? "text-emerald-600" : readiness.percentage >= 50 ? "text-amber-600" : "text-red-600"
          }`}>{readiness.percentage}%</span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              readiness.percentage >= 80 ? "bg-emerald-500" : readiness.percentage >= 50 ? "bg-amber-500" : "bg-red-500"
            }`}
            style={{ width: `${readiness.percentage}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-gray-500">{readiness.completed}/{readiness.total} items complete</span>
          {readiness.requiredCompleted < readiness.requiredTotal && (
            <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
              <AlertTriangle className="w-3 h-3" /> {readiness.requiredTotal - readiness.requiredCompleted} required items pending
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Required</span>
        {requiredItems.map(item => (
          <PrepItemRow
            key={item.id}
            item={item}
            toggling={togglingIds.has(item.id)}
            expanded={expandedNotes === item.id}
            noteText={noteText}
            onToggle={() => toggleItem(item.id, !!item.completedAt)}
            onExpandNotes={() => {
              if (expandedNotes === item.id) { setExpandedNotes(null); }
              else { setExpandedNotes(item.id); setNoteText(item.notes ?? ""); }
            }}
            onNoteChange={setNoteText}
            onSaveNotes={() => saveNotes(item.id)}
          />
        ))}
      </div>

      {optionalItems.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Optional</span>
          {optionalItems.map(item => (
            <PrepItemRow
              key={item.id}
              item={item}
              toggling={togglingIds.has(item.id)}
              expanded={expandedNotes === item.id}
              noteText={noteText}
              onToggle={() => toggleItem(item.id, !!item.completedAt)}
              onExpandNotes={() => {
                if (expandedNotes === item.id) { setExpandedNotes(null); }
                else { setExpandedNotes(item.id); setNoteText(item.notes ?? ""); }
              }}
              onNoteChange={setNoteText}
              onSaveNotes={() => saveNotes(item.id)}
            />
          ))}
        </div>
      )}

      <div className="border-t border-gray-100 pt-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs"
          onClick={() => { setShowAgenda(!showAgenda); if (!agenda) loadAgenda(); }}
        >
          <FileText className="w-3 h-3 mr-1" />
          {showAgenda ? "Hide Draft Agenda" : "View Draft Agenda"}
          {showAgenda ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
        </Button>
      </div>

      {showAgenda && agenda && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="text-center border-b border-gray-100 pb-2">
            <h3 className="text-sm font-semibold text-gray-900">{agenda.meetingTypeLabel}</h3>
            <p className="text-xs text-gray-500">{agenda.studentName}{agenda.studentGrade ? ` — Grade ${agenda.studentGrade}` : ""}</p>
            <p className="text-xs text-gray-400">
              {agenda.scheduledDate}
              {agenda.scheduledTime ? ` at ${agenda.scheduledTime}` : ""}
              {agenda.location ? ` — ${agenda.location}` : ""}
            </p>
          </div>

          {agenda.attendees.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Attendees</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {agenda.attendees.map((a, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">{a.name} ({a.role})</Badge>
                ))}
              </div>
            </div>
          )}

          {agenda.sections.map((section, i) => (
            <div key={i}>
              <h4 className="text-xs font-semibold text-gray-800 mb-1">{i + 1}. {section.title}</h4>
              <ul className="space-y-0.5">
                {section.items.map((item, j) => (
                  <li key={j} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-gray-300 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {agenda.goalProgressSummaries && agenda.goalProgressSummaries.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-800 mb-2">Goal Progress Summaries</h4>
              <div className="space-y-1.5">
                {agenda.goalProgressSummaries.map(g => {
                  const trendColor = g.trend === "improving" ? "text-emerald-600" : g.trend === "declining" ? "text-red-600" : g.trend === "stable" ? "text-blue-600" : "text-gray-400";
                  const trendIcon = g.trend === "improving" ? "↑" : g.trend === "declining" ? "↓" : g.trend === "stable" ? "→" : "—";
                  return (
                    <div key={g.goalId} className="bg-gray-50 rounded p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-gray-700">{g.goalArea} Goal #{g.goalNumber}</span>
                        <div className="flex items-center gap-1.5">
                          {g.latestValue !== null && (
                            <span className="text-[10px] font-medium text-gray-600">{g.latestValue}%</span>
                          )}
                          <span className={`text-[10px] font-medium ${trendColor}`}>{trendIcon} {g.trend.replace("_", " ")}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{g.annualGoal}</p>
                      <div className="flex items-center gap-3 mt-1 text-[9px] text-gray-400">
                        <span>{g.dataPoints} data point{g.dataPoints !== 1 ? "s" : ""} (90d)</span>
                        {g.baseline && <span>Baseline: {g.baseline}</span>}
                        {g.targetCriterion && <span>Target: {g.targetCriterion}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PrepItemRow({
  item, toggling, expanded, noteText, onToggle, onExpandNotes, onNoteChange, onSaveNotes,
}: {
  item: PrepItem;
  toggling: boolean;
  expanded: boolean;
  noteText: string;
  onToggle: () => void;
  onExpandNotes: () => void;
  onNoteChange: (v: string) => void;
  onSaveNotes: () => void;
}) {
  const completed = !!item.completedAt;
  const Icon = ITEM_ICONS[item.itemType] ?? ClipboardList;

  return (
    <div className={`rounded-lg border transition-colors ${completed ? "bg-emerald-50/50 border-emerald-100" : "bg-white border-gray-100"}`}>
      <div className="flex items-start gap-2 p-2">
        <button
          onClick={onToggle}
          disabled={toggling}
          className="mt-0.5 shrink-0"
        >
          {toggling ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : completed ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <Circle className="w-4 h-4 text-gray-300 hover:text-emerald-400 transition-colors" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon className="w-3 h-3 text-gray-400 shrink-0" />
            <span className={`text-xs font-medium ${completed ? "text-gray-500 line-through" : "text-gray-900"}`}>
              {item.label}
            </span>
            {item.autoDetected && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">
                <Sparkles className="w-2.5 h-2.5 mr-0.5" /> Auto
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">{item.description}</p>
          {item.notes && !expanded && (
            <p className="text-[10px] text-gray-500 mt-0.5 italic">Note: {item.notes}</p>
          )}
        </div>
        <button onClick={onExpandNotes} className="text-[10px] text-gray-400 hover:text-gray-600 shrink-0 mt-1">
          {expanded ? "Close" : "Notes"}
        </button>
      </div>
      {expanded && (
        <div className="px-2 pb-2 space-y-1.5 border-t border-gray-100 pt-1.5">
          <Textarea
            value={noteText}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Add a note..."
            className="text-xs min-h-[48px] resize-none"
          />
          <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white h-6 px-2" onClick={onSaveNotes}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
