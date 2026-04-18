/**
 * ReinforcerInventoryPanel
 *
 * Displays a student's curated reinforcer inventory — the living shortlist of
 * what actually works, distinct from raw preference-assessment records.
 *
 * Sources of entries:
 *  - Manual addition via the inline "Add reinforcer" form below
 *  - "Pin to Inventory" action in PreferenceAssessmentCard expanded items view
 *
 * Designed to be reusable: same studentId-prop API as PreferenceAssessmentCard.
 * Future consumers: ABA ProgramBuilderWizard (reinforcer quick-pick), BIP editor
 * (reinforcement components), and runbook session view.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sparkles, Plus, ToggleLeft, ToggleRight, Trash2, Edit2, Check, X, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReinforcerCategory =
  | "tangible"
  | "edible"
  | "social"
  | "activity"
  | "sensory";

const CATEGORY_META: Record<ReinforcerCategory, { label: string; color: string; bg: string }> = {
  tangible:  { label: "Tangible",  color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  edible:    { label: "Edible",    color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  social:    { label: "Social",    color: "text-rose-700",   bg: "bg-rose-50 border-rose-200" },
  activity:  { label: "Activity",  color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  sensory:   { label: "Sensory",   color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
};

function categoryMeta(cat: string) {
  return CATEGORY_META[cat as ReinforcerCategory] ?? { label: cat, color: "text-gray-600", bg: "bg-gray-100 border-gray-200" };
}

export interface StudentReinforcer {
  id: number;
  studentId: number;
  name: string;
  category: string;
  notes: string | null;
  active: boolean;
  sourceAssessmentId: number | null;
  addedAt: string;
  updatedAt: string;
}

// ─── Inline edit row ─────────────────────────────────────────────────────────

function ReinforcerRow({
  r,
  onToggleActive,
  onUpdate,
  onDelete,
}: {
  r: StudentReinforcer;
  onToggleActive: () => void;
  onUpdate: (patch: { name?: string; category?: string; notes?: string | null }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(r.name);
  const [editCat, setEditCat] = useState<string>(r.category);
  const [editNotes, setEditNotes] = useState(r.notes ?? "");
  const [showNotes, setShowNotes] = useState(false);

  const meta = categoryMeta(r.category);

  function saveEdit() {
    if (!editName.trim()) return;
    onUpdate({ name: editName.trim(), category: editCat, notes: editNotes.trim() || null });
    setEditing(false);
  }
  function cancelEdit() {
    setEditName(r.name);
    setEditCat(r.category);
    setEditNotes(r.notes ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="border border-gray-200 rounded-lg p-3 space-y-2">
        <div className="flex gap-2">
          <Input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="Reinforcer name"
            className="h-8 text-sm flex-1"
            autoFocus
            onKeyDown={e => e.key === "Enter" && saveEdit()}
          />
          <Select value={editCat} onValueChange={setEditCat}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_META).map(([v, m]) => (
                <SelectItem key={v} value={v} className="text-xs">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          value={editNotes}
          onChange={e => setEditNotes(e.target.value)}
          placeholder="Notes (e.g. delivery preference, satiation signal…)"
          className="text-xs resize-none"
          rows={2}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={cancelEdit} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <X className="w-3 h-3" /> Cancel
          </button>
          <button
            onClick={saveEdit}
            className="text-xs text-emerald-700 hover:text-emerald-800 font-medium flex items-center gap-1"
          >
            <Check className="w-3 h-3" /> Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border px-3 py-2 transition-opacity ${!r.active ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        {/* Active toggle */}
        <button onClick={onToggleActive} className="text-gray-400 hover:text-gray-600 shrink-0">
          {r.active
            ? <ToggleRight className="w-4 h-4 text-emerald-600" />
            : <ToggleLeft className="w-4 h-4" />
          }
        </button>

        {/* Name */}
        <span className={`text-[13px] font-medium flex-1 truncate ${r.active ? "text-gray-800" : "text-gray-400 line-through"}`}>
          {r.name}
        </span>

        {/* Category chip */}
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${meta.bg} ${meta.color}`}>
          {meta.label}
        </span>

        {/* Actions */}
        <div className="flex gap-1 shrink-0 ml-1">
          {r.notes && (
            <button
              onClick={() => setShowNotes(v => !v)}
              className="text-gray-300 hover:text-gray-500"
              title="Show notes"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showNotes ? "rotate-180" : ""}`} />
            </button>
          )}
          <button onClick={() => setEditing(true)} className="text-gray-300 hover:text-blue-500" title="Edit">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="text-gray-300 hover:text-red-400" title="Remove">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showNotes && r.notes && (
        <p className="text-[11px] text-gray-400 mt-1.5 pl-6 leading-relaxed">{r.notes}</p>
      )}

      {r.sourceAssessmentId && (
        <p className="text-[10px] text-violet-400 mt-0.5 pl-6">From preference assessment</p>
      )}
    </div>
  );
}

// ─── Add reinforcer inline form ───────────────────────────────────────────────

function AddReinforcerForm({
  studentId,
  onAdded,
  onCancel,
}: { studentId: number; onAdded: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("tangible");
  const [notes, setNotes] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      authFetch(`/api/students/${studentId}/reinforcers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category, notes: notes.trim() || null }),
      }).then(r => r.json()),
    onSuccess: () => {
      toast.success("Reinforcer added to inventory");
      onAdded();
    },
    onError: () => toast.error("Failed to add reinforcer"),
  });

  return (
    <div className="border border-dashed border-emerald-300 rounded-lg p-3 space-y-2 bg-emerald-50/50">
      <p className="text-[11px] font-semibold text-emerald-800">Add reinforcer</p>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. iPad time, verbal praise…"
          className="h-8 text-sm flex-1"
          autoFocus
          onKeyDown={e => e.key === "Enter" && !isPending && name.trim() && mutate()}
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_META).map(([v, m]) => (
              <SelectItem key={v} value={v} className="text-xs">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="h-7 text-xs"
      />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={!name.trim() || isPending}
          onClick={() => mutate()}
        >
          {isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function ReinforcerInventoryPanel({ studentId }: { studentId: number }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const qc = useQueryClient();

  const qKey = ["student-reinforcers", studentId];

  const { data: reinforcers = [], isLoading } = useQuery<StudentReinforcer[]>({
    queryKey: qKey,
    queryFn: () =>
      authFetch(`/api/students/${studentId}/reinforcers`).then(r => r.json()),
    staleTime: 2 * 60_000,
  });

  const { mutate: toggleActive } = useMutation({
    mutationFn: (r: StudentReinforcer) =>
      authFetch(`/api/reinforcers/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !r.active }),
      }).then(res => res.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError: () => toast.error("Failed to update"),
  });

  const { mutate: update } = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) =>
      authFetch(`/api/reinforcers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey });
      toast.success("Updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  const { mutate: remove } = useMutation({
    mutationFn: (id: number) =>
      authFetch(`/api/reinforcers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey });
      toast.success("Removed from inventory");
    },
    onError: () => toast.error("Failed to remove"),
  });

  const active = reinforcers.filter(r => r.active);
  const inactive = reinforcers.filter(r => !r.active);

  // Group active by category
  const byCategory = Object.keys(CATEGORY_META).reduce<Record<string, StudentReinforcer[]>>(
    (acc, cat) => {
      acc[cat] = active.filter(r => r.category === cat);
      return acc;
    },
    {},
  );

  const hasAny = reinforcers.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Reinforcer Inventory
            {active.length > 0 && (
              <span className="text-[11px] font-normal text-gray-400">
                {active.length} active
              </span>
            )}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
            onClick={() => setShowAdd(v => !v)}
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-1 space-y-3">
        {showAdd && (
          <AddReinforcerForm
            studentId={studentId}
            onAdded={() => {
              qc.invalidateQueries({ queryKey: qKey });
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {isLoading ? (
          <div className="h-12 flex items-center justify-center text-sm text-gray-400">Loading…</div>
        ) : !hasAny && !showAdd ? (
          <div className="text-center py-5">
            <Sparkles className="w-7 h-7 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No reinforcers in inventory</p>
            <p className="text-[12px] text-gray-300 mt-0.5">
              Add manually or pin items from a preference assessment
            </p>
          </div>
        ) : (
          <>
            {/* Active reinforcers, grouped by category */}
            {Object.entries(CATEGORY_META).map(([cat, meta]) => {
              const items = byCategory[cat];
              if (!items || items.length === 0) return null;
              return (
                <div key={cat}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${meta.color}`}>
                    {meta.label}
                  </p>
                  <div className="space-y-1">
                    {items.map(r => (
                      <ReinforcerRow
                        key={r.id}
                        r={r}
                        onToggleActive={() => toggleActive(r)}
                        onUpdate={patch => update({ id: r.id, patch })}
                        onDelete={() => {
                          if (confirm(`Remove "${r.name}" from inventory?`)) remove(r.id);
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Inactive section */}
            {inactive.length > 0 && (
              <div>
                <button
                  onClick={() => setShowInactive(v => !v)}
                  className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${showInactive ? "rotate-180" : ""}`} />
                  {inactive.length} inactive reinforcer{inactive.length !== 1 ? "s" : ""}
                </button>
                {showInactive && (
                  <div className="mt-1.5 space-y-1">
                    {inactive.map(r => (
                      <ReinforcerRow
                        key={r.id}
                        r={r}
                        onToggleActive={() => toggleActive(r)}
                        onUpdate={patch => update({ id: r.id, patch })}
                        onDelete={() => {
                          if (confirm(`Remove "${r.name}" from inventory?`)) remove(r.id);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
