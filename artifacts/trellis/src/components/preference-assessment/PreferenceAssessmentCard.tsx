import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Star, Plus, Trash2, ChevronDown, ChevronUp, ClipboardList, X } from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

const ASSESSMENT_TYPES = [
  { value: "mswo", label: "MSWO", full: "Multiple Stimulus Without Replacement" },
  { value: "paired", label: "Paired Stimulus", full: "Paired Stimulus (PS)" },
  { value: "free_operant", label: "Free Operant", full: "Free Operant Observation" },
  { value: "single_stimulus", label: "Single Stimulus", full: "Single Stimulus (SS)" },
] as const;

type AssessmentType = "mswo" | "paired" | "free_operant" | "single_stimulus";

interface AssessmentItem {
  name: string;
  rank?: number | null;       // MSWO: 1=most preferred
  score?: number | null;      // Paired: % selected; Free Operant: seconds engaged
  engaged?: boolean | null;   // Single Stimulus: did student engage?
  notes?: string | null;
}

interface PreferenceAssessment {
  id: number;
  studentId: number;
  assessmentType: AssessmentType;
  conductedDate: string;
  conductedByName: string | null;
  items: AssessmentItem[];
  notes: string | null;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function typeLabel(t: string) {
  return ASSESSMENT_TYPES.find(a => a.value === t)?.label ?? t;
}
function typeFull(t: string) {
  return ASSESSMENT_TYPES.find(a => a.value === t)?.full ?? t;
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function sortedItems(items: AssessmentItem[], type: AssessmentType): AssessmentItem[] {
  if (type === "mswo") return [...items].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  if (type === "paired") return [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (type === "free_operant") return [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return items;
}

function preferenceLabel(item: AssessmentItem, type: AssessmentType, rank: number) {
  if (type === "mswo") return item.rank != null ? `#${item.rank} choice` : "—";
  if (type === "paired") return item.score != null ? `${Math.round(item.score)}% selected` : "—";
  if (type === "free_operant") {
    const secs = item.score ?? 0;
    return secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
  }
  if (type === "single_stimulus") return item.engaged ? "Engaged" : "Did not engage";
  return "—";
}

// ─── Item result form ─────────────────────────────────────────────────────────

function ItemResultField({
  item, type, index, onChange,
}: {
  item: AssessmentItem;
  type: AssessmentType;
  index: number;
  onChange: (i: number, field: keyof AssessmentItem, val: any) => void;
}) {
  if (type === "mswo") {
    return (
      <Input
        type="number" min={1} placeholder="Rank (1=most preferred)"
        value={item.rank ?? ""}
        onChange={e => onChange(index, "rank", e.target.value ? parseInt(e.target.value) : null)}
        className="w-36 h-8 text-sm"
      />
    );
  }
  if (type === "paired") {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number" min={0} max={100} placeholder="% selected"
          value={item.score ?? ""}
          onChange={e => onChange(index, "score", e.target.value ? parseFloat(e.target.value) : null)}
          className="w-28 h-8 text-sm"
        />
        <span className="text-xs text-gray-400">%</span>
      </div>
    );
  }
  if (type === "free_operant") {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number" min={0} placeholder="Seconds engaged"
          value={item.score ?? ""}
          onChange={e => onChange(index, "score", e.target.value ? parseFloat(e.target.value) : null)}
          className="w-32 h-8 text-sm"
        />
        <span className="text-xs text-gray-400">sec</span>
      </div>
    );
  }
  if (type === "single_stimulus") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(index, "engaged", true)}
          className={`text-xs px-2 py-1 rounded-md border transition-colors ${
            item.engaged === true ? "bg-emerald-600 text-white border-emerald-600" : "border-gray-200 text-gray-500 hover:border-emerald-400"
          }`}
        >Engaged</button>
        <button
          type="button"
          onClick={() => onChange(index, "engaged", false)}
          className={`text-xs px-2 py-1 rounded-md border transition-colors ${
            item.engaged === false ? "bg-red-500 text-white border-red-500" : "border-gray-200 text-gray-500 hover:border-red-300"
          }`}
        >Did not engage</button>
      </div>
    );
  }
  return null;
}

// ─── New Assessment Dialog ────────────────────────────────────────────────────

function NewAssessmentDialog({
  open, onClose, studentId,
}: { open: boolean; onClose: () => void; studentId: number }) {
  const qc = useQueryClient();
  const [type, setType] = useState<AssessmentType>("mswo");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [conductor, setConductor] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<AssessmentItem[]>([
    { name: "" }, { name: "" }, { name: "" },
  ]);
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    const name = newItem.trim();
    if (!name) return;
    setItems(prev => [...prev, { name }]);
    setNewItem("");
  };

  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: keyof AssessmentItem, val: any) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  };

  const { mutate, isPending } = useMutation({
    mutationFn: () => authFetch(`/api/students/${studentId}/preference-assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assessmentType: type,
        conductedDate: date,
        conductedByName: conductor || null,
        items: items.filter(it => it.name.trim()),
        notes: notes || null,
      }),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preference-assessments", studentId] });
      toast.success("Preference assessment saved");
      onClose();
    },
    onError: () => toast.error("Failed to save assessment"),
  });

  const validItems = items.filter(it => it.name.trim());

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">New Preference Assessment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">Assessment Type</label>
            <Select value={type} onValueChange={v => setType(v as AssessmentType)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSESSMENT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    <div>
                      <span className="font-medium">{t.label}</span>
                      <span className="text-gray-400 ml-1.5 text-xs">— {t.full}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-gray-400 mt-1">
              {type === "mswo" && "Present all items, student selects preferred. Remove & repeat. Record ordinal rank."}
              {type === "paired" && "Present items in pairs. Record % of trials each item is selected."}
              {type === "free_operant" && "Observe student freely. Record seconds engaged with each item."}
              {type === "single_stimulus" && "Present each item alone. Record whether student engages."}
            </p>
          </div>

          {/* Date + Conductor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Date Conducted</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Conducted By</label>
              <Input value={conductor} onChange={e => setConductor(e.target.value)} placeholder="Staff name" className="h-9" />
            </div>
          </div>

          {/* Stimuli list */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">
              Stimuli / Items
              <span className="text-gray-400 font-normal ml-1">({validItems.length} added)</span>
            </label>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder={`Item ${i + 1} name`}
                    value={item.name}
                    onChange={e => updateItem(i, "name", e.target.value)}
                    className="h-8 flex-1 text-sm"
                  />
                  <ItemResultField item={item} type={type} index={i} onChange={updateItem} />
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addItem())}
                placeholder="Add item…"
                className="h-8 text-sm flex-1"
              />
              <Button size="sm" variant="outline" onClick={addItem} className="h-8 px-3">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">Notes</label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Setting, conditions, student behavior observations…"
              className="text-sm resize-none"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={() => mutate()}
            disabled={isPending || validItems.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isPending ? "Saving…" : "Save Assessment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Single assessment card ──────────────────────────────────────────────────

function AssessmentRow({ assessment, onDelete }: { assessment: PreferenceAssessment; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = sortedItems(assessment.items, assessment.assessmentType);
  const top3 = sorted.slice(0, 3);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px] font-semibold px-1.5 py-0.5 bg-violet-50 text-violet-700 border-0">
              {typeLabel(assessment.assessmentType)}
            </Badge>
            <span className="text-sm font-medium text-gray-700">{fmtDate(assessment.conductedDate)}</span>
            {assessment.conductedByName && (
              <span className="text-xs text-gray-400">· {assessment.conductedByName}</span>
            )}
          </div>
          {/* Top items preview */}
          {top3.length > 0 && !expanded && (
            <div className="flex items-center gap-2 mt-1.5">
              {top3.map((item, i) => (
                <div key={i} className="flex items-center gap-1">
                  {i === 0 && <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />}
                  <span className="text-[12px] text-gray-600 font-medium">{item.name}</span>
                </div>
              ))}
              {sorted.length > 3 && <span className="text-[11px] text-gray-400">+{sorted.length - 3} more</span>}
            </div>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-50 pt-3">
          <p className="text-[11px] text-gray-400 mb-3">{typeFull(assessment.assessmentType)}</p>

          {/* Ranked items */}
          <div className="space-y-2">
            {sorted.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
                  i === 0 ? "bg-amber-400 text-white" :
                  i === 1 ? "bg-gray-300 text-gray-700" :
                  i === 2 ? "bg-amber-700/70 text-white" :
                  "bg-gray-100 text-gray-500"
                }`}>
                  {i + 1}
                </div>
                <span className="text-sm font-medium text-gray-700 flex-1">{item.name}</span>
                <span className="text-xs text-gray-400">
                  {preferenceLabel(item, assessment.assessmentType, i + 1)}
                </span>
              </div>
            ))}
          </div>

          {assessment.notes && (
            <p className="text-[12px] text-gray-500 mt-3 border-t border-gray-50 pt-3 leading-relaxed">
              {assessment.notes}
            </p>
          )}

          <div className="flex justify-end mt-3">
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="text-[11px] text-gray-400 hover:text-red-400 transition-colors"
            >
              Delete assessment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function PreferenceAssessmentCard({ studentId }: { studentId: number }) {
  const [showNew, setShowNew] = useState(false);
  const qc = useQueryClient();

  const { data: assessments = [], isLoading } = useQuery<PreferenceAssessment[]>({
    queryKey: ["preference-assessments", studentId],
    queryFn: () => authFetch(`/api/students/${studentId}/preference-assessments`).then(r => r.json()),
    staleTime: 2 * 60_000,
  });

  const { mutate: deleteAssessment } = useMutation({
    mutationFn: (id: number) => authFetch(`/api/preference-assessments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preference-assessments", studentId] });
      toast.success("Assessment deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-violet-500" />
              Preference Assessments
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
              onClick={() => setShowNew(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              New Assessment
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-1">
          {isLoading ? (
            <div className="h-16 flex items-center justify-center text-sm text-gray-400">Loading…</div>
          ) : assessments.length === 0 ? (
            <div className="text-center py-6">
              <ClipboardList className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No preference assessments yet</p>
              <p className="text-[12px] text-gray-300 mt-0.5">
                Run a preference assessment to identify reinforcers
              </p>
              <Button
                size="sm" variant="outline"
                className="mt-3 h-7 text-xs gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
                onClick={() => setShowNew(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Run First Assessment
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {assessments.map(a => (
                <AssessmentRow
                  key={a.id}
                  assessment={a}
                  onDelete={() => deleteAssessment(a.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <NewAssessmentDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        studentId={studentId}
      />
    </>
  );
}
