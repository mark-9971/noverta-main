import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Plus, ChevronDown, ChevronUp, Edit3, Copy, Printer, X, Check, Archive } from "lucide-react";
import { toast } from "sonner";

const API = (import.meta as any).env.VITE_API_URL || "/api";

interface Bip {
  id: number;
  studentId: number;
  behaviorTargetId: number | null;
  fbaId: number | null;
  createdBy: number | null;
  version: number;
  status: string;
  targetBehavior: string;
  operationalDefinition: string;
  hypothesizedFunction: string;
  replacementBehaviors: string | null;
  preventionStrategies: string | null;
  teachingStrategies: string | null;
  consequenceStrategies: string | null;
  reinforcementSchedule: string | null;
  crisisPlan: string | null;
  implementationNotes: string | null;
  dataCollectionMethod: string | null;
  progressCriteria: string | null;
  reviewDate: string | null;
  effectiveDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  behaviorTargetName: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-emerald-50 text-emerald-600",
  archived: "bg-gray-100 text-gray-400",
  under_review: "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
  under_review: "Under Review",
};

const FUNCTION_OPTIONS = ["attention", "escape", "tangible", "sensory", "multiple", "undetermined"];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function esc(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

interface BipManagementProps {
  studentId: number;
  readOnly?: boolean;
}

export default function BipManagement({ studentId, readOnly = false }: BipManagementProps) {
  const [bips, setBips] = useState<Bip[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingBip, setEditingBip] = useState<Bip | null>(null);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [fbas, setFbas] = useState<any[]>([]);

  const [behaviorTargets, setBehaviorTargets] = useState<any[]>([]);

  const [form, setForm] = useState({
    targetBehavior: "",
    operationalDefinition: "",
    hypothesizedFunction: "attention",
    fbaId: "",
    behaviorTargetId: "",
    replacementBehaviors: "",
    preventionStrategies: "",
    teachingStrategies: "",
    consequenceStrategies: "",
    reinforcementSchedule: "",
    crisisPlan: "",
    implementationNotes: "",
    dataCollectionMethod: "",
    progressCriteria: "",
    reviewDate: "",
    effectiveDate: "",
    status: "draft",
  });

  useEffect(() => {
    fetchBips();
    fetchFbas();
    fetchBehaviorTargets();
  }, [studentId]);

  async function fetchBips() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/students/${studentId}/bips`);
      if (res.ok) setBips(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function fetchFbas() {
    try {
      const res = await fetch(`${API}/students/${studentId}/fbas`);
      if (res.ok) setFbas(await res.json());
    } catch { /* ignore */ }
  }

  async function fetchBehaviorTargets() {
    try {
      const res = await fetch(`${API}/students/${studentId}/behavior-targets`);
      if (res.ok) setBehaviorTargets(await res.json());
    } catch { /* ignore */ }
  }

  function openCreateForm() {
    setEditingBip(null);
    setForm({
      targetBehavior: "",
      operationalDefinition: "",
      hypothesizedFunction: "attention",
      fbaId: "",
      behaviorTargetId: "",
      replacementBehaviors: "",
      preventionStrategies: "",
      teachingStrategies: "",
      consequenceStrategies: "",
      reinforcementSchedule: "",
      crisisPlan: "",
      implementationNotes: "",
      dataCollectionMethod: "",
      progressCriteria: "",
      reviewDate: "",
      effectiveDate: "",
      status: "draft",
    });
    setShowForm(true);
  }

  function openEditForm(bip: Bip) {
    setEditingBip(bip);
    setForm({
      targetBehavior: bip.targetBehavior,
      operationalDefinition: bip.operationalDefinition,
      hypothesizedFunction: bip.hypothesizedFunction,
      fbaId: bip.fbaId?.toString() || "",
      behaviorTargetId: bip.behaviorTargetId?.toString() || "",
      replacementBehaviors: bip.replacementBehaviors || "",
      preventionStrategies: bip.preventionStrategies || "",
      teachingStrategies: bip.teachingStrategies || "",
      consequenceStrategies: bip.consequenceStrategies || "",
      reinforcementSchedule: bip.reinforcementSchedule || "",
      crisisPlan: bip.crisisPlan || "",
      implementationNotes: bip.implementationNotes || "",
      dataCollectionMethod: bip.dataCollectionMethod || "",
      progressCriteria: bip.progressCriteria || "",
      reviewDate: bip.reviewDate || "",
      effectiveDate: bip.effectiveDate || "",
      status: bip.status,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.targetBehavior || !form.operationalDefinition || !form.hypothesizedFunction) {
      toast.error("Target behavior, operational definition, and hypothesized function are required");
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        ...form,
        fbaId: form.fbaId ? parseInt(form.fbaId) : null,
        behaviorTargetId: form.behaviorTargetId ? parseInt(form.behaviorTargetId) : null,
      };
      if (!body.reviewDate) delete body.reviewDate;
      if (!body.effectiveDate) delete body.effectiveDate;

      let res;
      if (editingBip) {
        res = await fetch(`${API}/bips/${editingBip.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${API}/students/${studentId}/bips`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (res.ok) {
        toast.success(editingBip ? "BIP updated" : "BIP created");
        setShowForm(false);
        setEditingBip(null);
        fetchBips();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save BIP");
      }
    } catch {
      toast.error("Network error");
    }
    setSaving(false);
  }

  async function handleNewVersion(bip: Bip) {
    if (!confirm(`Create a new version of this BIP? Version ${bip.version} will be archived.`)) return;
    try {
      const res = await fetch(`${API}/bips/${bip.id}/new-version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast.success(`Version ${bip.version + 1} created`);
        fetchBips();
      } else {
        toast.error("Failed to create new version");
      }
    } catch {
      toast.error("Network error");
    }
  }

  async function handleStatusChange(bipId: number, newStatus: string) {
    try {
      const res = await fetch(`${API}/bips/${bipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Status changed to ${STATUS_LABELS[newStatus] || newStatus}`);
        fetchBips();
      }
    } catch {
      toast.error("Failed to update status");
    }
  }

  function handlePrint(bip: Bip) {
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>BIP - ${esc(bip.targetBehavior)}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:800px;margin:0 auto;padding:40px 20px;color:#1a1a1a;line-height:1.6}
  h1{font-size:20px;margin-bottom:4px;color:#111}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:0.5px;color:#666;margin-top:24px;margin-bottom:8px;border-bottom:1px solid #e5e5e5;padding-bottom:4px}
  .meta{font-size:12px;color:#888;margin-bottom:24px}
  .field{margin-bottom:16px}
  .field-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:2px}
  .field-value{font-size:14px;white-space:pre-wrap}
  @media print{body{padding:20px}h1{font-size:18px}}
</style></head><body>
<h1>Behavior Intervention Plan</h1>
<div class="meta">
  Version ${bip.version} &bull; Status: ${esc(STATUS_LABELS[bip.status] || bip.status)} &bull;
  ${bip.createdByName ? `Created by ${esc(bip.createdByName)} &bull; ` : ""}
  Created ${formatDate(bip.createdAt)}
  ${bip.effectiveDate ? ` &bull; Effective ${formatDate(bip.effectiveDate)}` : ""}
  ${bip.reviewDate ? ` &bull; Review by ${formatDate(bip.reviewDate)}` : ""}
</div>

<h2>Target Behavior</h2>
<div class="field"><div class="field-label">Behavior</div><div class="field-value">${esc(bip.targetBehavior)}</div></div>
<div class="field"><div class="field-label">Operational Definition</div><div class="field-value">${esc(bip.operationalDefinition)}</div></div>
<div class="field"><div class="field-label">Hypothesized Function</div><div class="field-value">${esc(bip.hypothesizedFunction)}</div></div>

<h2>Intervention Strategies</h2>
<div class="field"><div class="field-label">Replacement Behaviors</div><div class="field-value">${esc(bip.replacementBehaviors)}</div></div>
<div class="field"><div class="field-label">Prevention / Antecedent Strategies</div><div class="field-value">${esc(bip.preventionStrategies)}</div></div>
<div class="field"><div class="field-label">Teaching Strategies</div><div class="field-value">${esc(bip.teachingStrategies)}</div></div>
<div class="field"><div class="field-label">Consequence Strategies</div><div class="field-value">${esc(bip.consequenceStrategies)}</div></div>

<h2>Reinforcement & Crisis</h2>
<div class="field"><div class="field-label">Reinforcement Schedule</div><div class="field-value">${esc(bip.reinforcementSchedule)}</div></div>
<div class="field"><div class="field-label">Crisis Plan</div><div class="field-value">${esc(bip.crisisPlan)}</div></div>

<h2>Data Collection & Progress</h2>
<div class="field"><div class="field-label">Data Collection Method</div><div class="field-value">${esc(bip.dataCollectionMethod)}</div></div>
<div class="field"><div class="field-label">Progress Criteria</div><div class="field-value">${esc(bip.progressCriteria)}</div></div>

${bip.implementationNotes ? `<h2>Implementation Notes</h2><div class="field"><div class="field-value">${esc(bip.implementationNotes)}</div></div>` : ""}
</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  const activeBips = bips.filter(b => b.status !== "archived");
  const archivedBips = bips.filter(b => b.status === "archived");

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Behavior Intervention Plans
          </CardTitle>
          {!readOnly && (
            <button
              onClick={openCreateForm}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-600/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New BIP
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : activeBips.length === 0 && archivedBips.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No BIPs created yet</p>
            {!readOnly && (
              <button
                onClick={openCreateForm}
                className="mt-3 text-xs text-emerald-600 hover:text-emerald-600/80 font-medium"
              >
                Create first BIP
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {activeBips.map(bip => (
              <BipRow
                key={bip.id}
                bip={bip}
                expanded={expandedId === bip.id}
                onToggle={() => setExpandedId(expandedId === bip.id ? null : bip.id)}
                onEdit={readOnly ? undefined : () => openEditForm(bip)}
                onNewVersion={readOnly ? undefined : () => handleNewVersion(bip)}
                onStatusChange={readOnly ? undefined : (s) => handleStatusChange(bip.id, s)}
                onPrint={() => handlePrint(bip)}
                readOnly={readOnly}
              />
            ))}

            {archivedBips.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600"
                >
                  <Archive className="w-3.5 h-3.5" />
                  {showArchived ? "Hide" : "Show"} {archivedBips.length} archived version{archivedBips.length > 1 ? "s" : ""}
                </button>
                {showArchived && (
                  <div className="space-y-2 mt-2">
                    {archivedBips.map(bip => (
                      <BipRow
                        key={bip.id}
                        bip={bip}
                        expanded={expandedId === bip.id}
                        onToggle={() => setExpandedId(expandedId === bip.id ? null : bip.id)}
                        onPrint={() => handlePrint(bip)}
                        readOnly
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showForm && (
          <BipForm
            form={form}
            setForm={setForm}
            editing={!!editingBip}
            saving={saving}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditingBip(null); }}
            fbas={fbas}
            behaviorTargets={behaviorTargets}
          />
        )}
      </CardContent>
    </Card>
  );
}

function BipRow({
  bip,
  expanded,
  onToggle,
  onEdit,
  onNewVersion,
  onStatusChange,
  onPrint,
  readOnly,
}: {
  bip: Bip;
  expanded: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onNewVersion?: () => void;
  onStatusChange?: (s: string) => void;
  onPrint: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className={`border rounded-lg transition-colors ${bip.status === "archived" ? "border-gray-100 bg-gray-50/50" : "border-gray-200 bg-white"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800 truncate">{bip.targetBehavior}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[bip.status] || "bg-gray-100 text-gray-600"}`}>
                {STATUS_LABELS[bip.status] || bip.status}
              </span>
              <span className="text-[10px] text-gray-400">v{bip.version}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5">
              <span>Function: {bip.hypothesizedFunction}</span>
              {bip.createdByName && <span>By {bip.createdByName}</span>}
              {bip.effectiveDate && <span>Effective {formatDate(bip.effectiveDate)}</span>}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <FieldBlock label="Operational Definition" value={bip.operationalDefinition} />
            <FieldBlock label="Hypothesized Function" value={bip.hypothesizedFunction} />
            <FieldBlock label="Replacement Behaviors" value={bip.replacementBehaviors} />
            <FieldBlock label="Prevention Strategies" value={bip.preventionStrategies} />
            <FieldBlock label="Teaching Strategies" value={bip.teachingStrategies} />
            <FieldBlock label="Consequence Strategies" value={bip.consequenceStrategies} />
            <FieldBlock label="Reinforcement Schedule" value={bip.reinforcementSchedule} />
            <FieldBlock label="Crisis Plan" value={bip.crisisPlan} />
            <FieldBlock label="Data Collection Method" value={bip.dataCollectionMethod} />
            <FieldBlock label="Progress Criteria" value={bip.progressCriteria} />
            {bip.implementationNotes && (
              <div className="md:col-span-2">
                <FieldBlock label="Implementation Notes" value={bip.implementationNotes} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-400 border-t border-gray-100 pt-3">
            <span>Created {formatDate(bip.createdAt)}</span>
            <span>Updated {formatDate(bip.updatedAt)}</span>
            {bip.reviewDate && <span>Review by {formatDate(bip.reviewDate)}</span>}
            {bip.behaviorTargetName && <span>Target: {bip.behaviorTargetName}</span>}
          </div>

          <div className="flex items-center gap-2 mt-3">
            {!readOnly && onEdit && bip.status !== "archived" && (
              <button onClick={onEdit} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            {!readOnly && onNewVersion && bip.status !== "archived" && (
              <button onClick={onNewVersion} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <Copy className="w-3.5 h-3.5" /> New Version
              </button>
            )}
            <button onClick={onPrint} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            {!readOnly && onStatusChange && bip.status !== "archived" && (
              <div className="ml-auto flex items-center gap-1.5">
                {bip.status === "draft" && (
                  <button onClick={() => onStatusChange("active")} className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors">
                    <Check className="w-3.5 h-3.5" /> Activate
                  </button>
                )}
                {bip.status === "active" && (
                  <button onClick={() => onStatusChange("under_review")} className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                    Under Review
                  </button>
                )}
                {bip.status === "under_review" && (
                  <>
                    <button onClick={() => onStatusChange("active")} className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors">
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => onStatusChange("draft")} className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                      Back to Draft
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
      <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{value || "—"}</div>
    </div>
  );
}

function BipForm({
  form,
  setForm,
  editing,
  saving,
  onSave,
  onCancel,
  fbas,
  behaviorTargets,
}: {
  form: any;
  setForm: (f: any) => void;
  editing: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  fbas: any[];
  behaviorTargets: any[];
}) {
  const update = (key: string, value: string) => setForm({ ...form, [key]: value });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl">
          <h2 className="text-base font-semibold text-gray-800">{editing ? "Edit BIP" : "New Behavior Intervention Plan"}</h2>
          <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Target Behavior *" value={form.targetBehavior} onChange={v => update("targetBehavior", v)} />
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Hypothesized Function *</label>
              <select
                value={form.hypothesizedFunction}
                onChange={e => update("hypothesizedFunction", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              >
                {FUNCTION_OPTIONS.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <FormTextarea label="Operational Definition *" value={form.operationalDefinition} onChange={v => update("operationalDefinition", v)} rows={3} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {behaviorTargets.length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Linked Behavior Target</label>
                <select
                  value={form.behaviorTargetId}
                  onChange={e => update("behaviorTargetId", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                >
                  <option value="">None</option>
                  {behaviorTargets.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            {fbas.length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Linked FBA</label>
                <select
                  value={form.fbaId}
                  onChange={e => update("fbaId", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                >
                  <option value="">None</option>
                  {fbas.map((f: any) => <option key={f.id} value={f.id}>{f.targetBehavior} ({f.status})</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Intervention Strategies</h3>
            <div className="space-y-3">
              <FormTextarea label="Replacement Behaviors" value={form.replacementBehaviors} onChange={v => update("replacementBehaviors", v)} rows={2} />
              <FormTextarea label="Prevention / Antecedent Strategies" value={form.preventionStrategies} onChange={v => update("preventionStrategies", v)} rows={2} />
              <FormTextarea label="Teaching Strategies" value={form.teachingStrategies} onChange={v => update("teachingStrategies", v)} rows={2} />
              <FormTextarea label="Consequence Strategies" value={form.consequenceStrategies} onChange={v => update("consequenceStrategies", v)} rows={2} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Reinforcement & Crisis</h3>
            <div className="space-y-3">
              <FormTextarea label="Reinforcement Schedule" value={form.reinforcementSchedule} onChange={v => update("reinforcementSchedule", v)} rows={2} />
              <FormTextarea label="Crisis Plan" value={form.crisisPlan} onChange={v => update("crisisPlan", v)} rows={2} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Data & Progress</h3>
            <div className="space-y-3">
              <FormTextarea label="Data Collection Method" value={form.dataCollectionMethod} onChange={v => update("dataCollectionMethod", v)} rows={2} />
              <FormTextarea label="Progress Criteria" value={form.progressCriteria} onChange={v => update("progressCriteria", v)} rows={2} />
              <FormTextarea label="Implementation Notes" value={form.implementationNotes} onChange={v => update("implementationNotes", v)} rows={2} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => update("status", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="under_review">Under Review</option>
                </select>
              </div>
              <FormField label="Effective Date" value={form.effectiveDate} onChange={v => update("effectiveDate", v)} type="date" />
              <FormField label="Review Date" value={form.reviewDate} onChange={v => update("reviewDate", v)} type="date" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-xl">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-600/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : editing ? "Update BIP" : "Create BIP"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
      />
    </div>
  );
}

function FormTextarea({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 resize-y"
      />
    </div>
  );
}
