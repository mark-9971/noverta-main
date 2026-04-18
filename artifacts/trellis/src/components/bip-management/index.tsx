import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Plus, Archive } from "lucide-react";
import { toast } from "sonner";
import {
  getStudentBips, listFbas, listBehaviorTargets,
  updateBip, createBip, createBipVersion, deleteBip,
  getFbaObservationsSummary,
} from "@workspace/api-client-react";
import { Bip, BipFormState, EMPTY_BIP_FORM, STATUS_LABELS } from "./types";
import { BipRow } from "./BipRow";
import { BipForm } from "./BipForm";
import { printBip } from "./printBip";
import type { FbaRecord, ObsSummary } from "@/pages/behavior-assessment/types";

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
  const [form, setForm] = useState<BipFormState>(EMPTY_BIP_FORM);

  /* FBA context for the BipForm reference panel */
  const [fbaInsights, setFbaInsights] = useState<{ fba: FbaRecord; summary: ObsSummary | null } | null>(null);

  useEffect(() => {
    fetchBips();
    fetchFbas();
    fetchBehaviorTargets();
  }, [studentId]);

  async function fetchBips() {
    setLoading(true);
    try {
      const data = await getStudentBips(studentId);
      setBips(data as any);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function fetchFbas() {
    try {
      const data = await listFbas(studentId);
      setFbas(data);
    } catch { /* ignore */ }
  }

  async function fetchBehaviorTargets() {
    try {
      const data = await listBehaviorTargets(studentId);
      setBehaviorTargets(data);
    } catch { /* ignore */ }
  }

  /**
   * Pick the most clinically relevant FBA to use as context:
   * - Prefer the one with a hypothesizedFunction set (most complete)
   * - Among those, prefer the most recently updated
   */
  function pickBestFba(fbaList: any[]): any | null {
    if (!fbaList.length) return null;
    const withFunction = fbaList.filter(f => f.hypothesizedFunction);
    const pool = withFunction.length > 0 ? withFunction : fbaList;
    return pool.slice().sort((a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime()
    )[0];
  }

  async function loadFbaInsights(fba: FbaRecord) {
    let summary: ObsSummary | null = null;
    try {
      summary = (await getFbaObservationsSummary(fba.id)) as ObsSummary;
    } catch { /* obs summary is optional — silently ignore */ }
    setFbaInsights({ fba, summary });
  }

  async function openCreateForm() {
    setEditingBip(null);

    /* Try to prefill from the best available FBA */
    const bestFba = pickBestFba(fbas.length > 0 ? fbas : (await listFbas(studentId).catch(() => [])));
    if (bestFba) {
      /* Prefill the form with data from the FBA — clinician can change anything */
      setForm({
        ...EMPTY_BIP_FORM,
        targetBehavior: bestFba.targetBehavior || "",
        operationalDefinition: bestFba.operationalDefinition || "",
        hypothesizedFunction: bestFba.hypothesizedFunction || "attention",
        fbaId: bestFba.id?.toString() || "",
      });
      /* Load insights in background — doesn't block form from opening */
      loadFbaInsights(bestFba as FbaRecord);
    } else {
      setForm(EMPTY_BIP_FORM);
      setFbaInsights(null);
    }
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
      /* structured JSONB — null signals legacy mode; array signals structured mode */
      antecedentStrategiesStructured: (bip as any).antecedentStrategiesStructured ?? null,
      teachingStrategiesStructured: (bip as any).teachingStrategiesStructured ?? null,
      consequenceProceduresStructured: (bip as any).consequenceProceduresStructured ?? null,
      reinforcementComponentsStructured: (bip as any).reinforcementComponentsStructured ?? null,
      crisisSupportsStructured: (bip as any).crisisSupportsStructured ?? null,
    });

    /* Load FBA insights for this BIP's linked FBA */
    if (bip.fbaId) {
      const linkedFba = fbas.find(f => f.id === bip.fbaId);
      if (linkedFba) {
        loadFbaInsights(linkedFba as FbaRecord);
      } else {
        setFbaInsights(null);
      }
    } else {
      /* No linked FBA — try best available as reference */
      const bestFba = pickBestFba(fbas);
      if (bestFba) {
        loadFbaInsights(bestFba as FbaRecord);
      } else {
        setFbaInsights(null);
      }
    }
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

      if (editingBip) {
        await updateBip(editingBip.id, body);
      } else {
        await createBip(studentId, body);
      }
      toast.success(editingBip ? "BIP updated" : "BIP created");
      setShowForm(false);
      setEditingBip(null);
      setFbaInsights(null);
      fetchBips();
    } catch {
      toast.error("Network error");
    }
    setSaving(false);
  }

  async function handleNewVersion(bip: Bip) {
    if (!confirm(`Create a new version of this BIP? Version ${bip.version} will be archived.`)) return;
    try {
      await createBipVersion(bip.id);
      toast.success(`Version ${bip.version + 1} created`);
      fetchBips();
    } catch {
      toast.error("Network error");
    }
  }

  async function handleDelete(bipId: number) {
    if (!confirm("Are you sure you want to delete this BIP? This cannot be undone.")) return;
    try {
      await deleteBip(bipId);
      toast.success("BIP deleted");
      fetchBips();
    } catch {
      toast.error("Network error");
    }
  }

  async function handleStatusChange(bipId: number, newStatus: string) {
    try {
      await updateBip(bipId, { status: newStatus as any });
      toast.success(`Status changed to ${STATUS_LABELS[newStatus] || newStatus}`);
      fetchBips();
    } catch {
      toast.error("Failed to update status");
    }
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
                onDelete={readOnly ? undefined : () => handleDelete(bip.id)}
                onStatusChange={readOnly ? undefined : (s) => handleStatusChange(bip.id, s)}
                onPrint={() => printBip(bip)}
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
                        onPrint={() => printBip(bip)}
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
            onCancel={() => { setShowForm(false); setEditingBip(null); setFbaInsights(null); }}
            fbas={fbas}
            behaviorTargets={behaviorTargets}
            fbaInsights={fbaInsights}
          />
        )}
      </CardContent>
    </Card>
  );
}
