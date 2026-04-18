import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus, X, Save, Trash2, Brain, Shield, ArrowRight,
  AlertTriangle, CheckCircle2, Users, History, ClipboardCheck,
  Send, ThumbsUp, Play, Ban, RotateCcw, UserMinus
} from "lucide-react";
import { toast } from "sonner";
import { listStaff, generateBipFromFba } from "@workspace/api-client-react";
import { useRole } from "@/lib/role-context";
import { authFetch } from "@/lib/auth-fetch";
import { STATUS_CONFIG, computeBipDiff } from "./constants";
import { StatusBadge, FunctionBadge, EmptyState, BipSection } from "./shared";
import {
  StructuredAntecedentDisplay,
  StructuredTeachingDisplay,
  StructuredConsequenceDisplay,
  StructuredReinforcementDisplay,
  StructuredCrisisDisplay,
} from "@/components/bip-management/StrategyEditors";
import type {
  BipRecord, FbaRecord, Student,
  StaffEntry, BipStatusEntry, BipImplementerEntry, BipFidelityEntry
} from "./types";

export function BipPanel({ student, bips, selectedBip, editingBip, selectedFba, onSelectBip, onEdit, onRefresh }: {
  student: Student; bips: BipRecord[]; selectedBip: BipRecord | null;
  editingBip: Partial<BipRecord> | null; selectedFba: FbaRecord | null;
  onSelectBip: (b: BipRecord | null) => void; onEdit: (b: Partial<BipRecord> | null) => void;
  onRefresh: () => void;
}) {
  const { role } = useRole();
  const [generating, setGenerating] = useState(false);
  const [transitionNotes, setTransitionNotes] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [bipTab, setBipTab] = useState<"plan" | "implementers" | "history" | "fidelity">("plan");
  const [statusHistory, setStatusHistory] = useState<BipStatusEntry[]>([]);
  const [implementers, setImplementers] = useState<BipImplementerEntry[]>([]);
  const [fidelityLogs, setFidelityLogs] = useState<BipFidelityEntry[]>([]);
  const [versionHistory, setVersionHistory] = useState<BipRecord[]>([]);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [staffList, setStaffList] = useState<StaffEntry[]>([]);
  const [addImplStaffId, setAddImplStaffId] = useState("");
  const [addImplNotes, setAddImplNotes] = useState("");
  const [addingImpl, setAddingImpl] = useState(false);
  const [showAddImpl, setShowAddImpl] = useState(false);
  const [fidelityForm, setFidelityForm] = useState({ logDate: new Date().toISOString().split("T")[0], fidelityRating: "", studentResponse: "", implementationNotes: "" });
  const [addingFidelity, setAddingFidelity] = useState(false);
  const [showAddFidelity, setShowAddFidelity] = useState(false);

  const isApprover = role === "admin" || role === "bcba";
  const isReviewer = ["admin", "bcba", "case_manager", "coordinator"].includes(role);

  const loadBipExtras = useCallback(async (bip: BipRecord) => {
    const [hist, impls, fidelity] = await Promise.all([
      authFetch(`/api/bips/${bip.id}/status-history`).then(r => r.json()).catch(() => []),
      authFetch(`/api/bips/${bip.id}/implementers`).then(r => r.json()).catch(() => []),
      authFetch(`/api/bips/${bip.id}/fidelity-logs`).then(r => r.json()).catch(() => []),
    ]);
    setStatusHistory(Array.isArray(hist) ? hist : []);
    setImplementers(Array.isArray(impls) ? impls : []);
    setFidelityLogs(Array.isArray(fidelity) ? fidelity : []);
    const groupId = bip.versionGroupId ?? null;
    if (groupId !== null) {
      const allBips = await authFetch(`/api/students/${bip.studentId}/bips`).then(r => r.json()).catch(() => []);
      if (Array.isArray(allBips)) {
        const siblings = (allBips as BipRecord[]).filter(b =>
          b.id !== bip.id && (b.versionGroupId === groupId || b.id === groupId)
        ).sort((a, b) => b.version - a.version);
        setVersionHistory(siblings);
      }
    } else {
      setVersionHistory([]);
    }
  }, []);

  useEffect(() => {
    listStaff().then((r: unknown) => setStaffList(Array.isArray(r) ? (r as StaffEntry[]) : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedBip) loadBipExtras(selectedBip);
  }, [selectedBip, loadBipExtras]);

  const generateFromFba = async () => {
    if (!selectedFba) { toast.error("Select an FBA first"); return; }
    setGenerating(true);
    try {
      await generateBipFromFba(selectedFba.id);
      toast.success("BIP generated from FBA data");
      onRefresh();
    } catch { toast.error("Failed to generate BIP"); }
    setGenerating(false);
  };

  const saveBipEdits = async () => {
    if (!selectedBip || !editingBip) return;
    try {
      const r = await authFetch(`/api/bips/${selectedBip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingBip),
      });
      if (r.status === 409) {
        const { status: bipStatus } = await r.json().catch(() => ({}));
        toast.error(
          `This BIP is ${STATUS_CONFIG[bipStatus]?.label || bipStatus}. To make changes, create a new version from the plan actions menu.`,
          { duration: 6000 }
        );
        onEdit(null);
        return;
      }
      if (!r.ok) throw new Error();
      toast.success("BIP updated");
      onEdit(null);
      onRefresh();
    } catch { toast.error("Failed to update BIP"); }
  };

  const doTransition = async (toStatus: string) => {
    if (!selectedBip) return;
    setTransitioning(true);
    try {
      const r = await authFetch(`/api/bips/${selectedBip.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus, notes: transitionNotes || null }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        toast.error(err.error || "Transition failed");
        return;
      }
      toast.success(`BIP is now ${STATUS_CONFIG[toStatus]?.label || toStatus}`);
      setTransitionNotes("");
      onRefresh();
      if (selectedBip) await loadBipExtras(selectedBip);
    } catch { toast.error("Failed to transition BIP"); }
    setTransitioning(false);
  };

  const createNewVersion = async () => {
    if (!selectedBip) return;
    setCreatingVersion(true);
    try {
      const r = await authFetch(`/api/bips/${selectedBip.id}/new-version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionNotes: "New version created from edit action" }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        toast.error(err.error || "Failed to create new version");
        return;
      }
      const newBip = await r.json();
      toast.success(`Version ${newBip.version} created — now in Draft`);
      onRefresh();
      onSelectBip(newBip as BipRecord);
    } catch { toast.error("Failed to create new version"); }
    setCreatingVersion(false);
  };

  const addImplementer = async () => {
    if (!selectedBip || !addImplStaffId) return;
    setAddingImpl(true);
    try {
      const r = await authFetch(`/api/bips/${selectedBip.id}/implementers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: parseInt(addImplStaffId), notes: addImplNotes || null }),
      });
      if (!r.ok) throw new Error();
      toast.success("Implementer assigned");
      setAddImplStaffId(""); setAddImplNotes(""); setShowAddImpl(false);
      await loadBipExtras(selectedBip);
    } catch { toast.error("Failed to assign implementer"); }
    setAddingImpl(false);
  };

  const removeImplementer = async (implId: number) => {
    try {
      const r = await authFetch(`/api/bip-implementers/${implId}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Implementer removed");
      if (selectedBip) await loadBipExtras(selectedBip);
    } catch { toast.error("Failed to remove implementer"); }
  };

  const addFidelityLog = async () => {
    if (!selectedBip || !fidelityForm.logDate) return;
    setAddingFidelity(true);
    try {
      const r = await authFetch(`/api/bips/${selectedBip.id}/fidelity-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logDate: fidelityForm.logDate,
          fidelityRating: fidelityForm.fidelityRating ? parseInt(fidelityForm.fidelityRating) : null,
          studentResponse: fidelityForm.studentResponse || null,
          implementationNotes: fidelityForm.implementationNotes || null,
        }),
      });
      if (!r.ok) throw new Error();
      toast.success("Fidelity entry logged");
      setFidelityForm({ logDate: new Date().toISOString().split("T")[0], fidelityRating: "", studentResponse: "", implementationNotes: "" });
      setShowAddFidelity(false);
      await loadBipExtras(selectedBip);
    } catch { toast.error("Failed to add fidelity entry"); }
    setAddingFidelity(false);
  };

  const removeFidelityLog = async (logId: number) => {
    try {
      const r = await authFetch(`/api/bip-fidelity-logs/${logId}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Entry removed");
      if (selectedBip) await loadBipExtras(selectedBip);
    } catch { toast.error("Failed to remove entry"); }
  };

  const currentBip = selectedBip
    ? { ...selectedBip, ...(editingBip || {}) } as BipRecord
    : null;

  const BIP_WORKFLOW_STEPS = [
    { status: "draft", label: "Draft" },
    { status: "under_review", label: "Under Review" },
    { status: "approved", label: "Approved" },
    { status: "active", label: "Active" },
  ];

  void student;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Behavior Intervention Plans</h2>
        <div className="flex gap-2">
          {selectedFba && !selectedBip && (
            <Button size="sm" onClick={generateFromFba} disabled={generating}
              className="bg-emerald-600 hover:bg-emerald-700">
              <Brain className="w-4 h-4 mr-1" />
              {generating ? "Generating…" : "Generate from FBA"}
            </Button>
          )}
        </div>
      </div>

      {!selectedFba && bips.length === 0 && (
        <EmptyState icon={Shield} message="Select an FBA first, then generate a BIP from assessment data" />
      )}

      {bips.length > 0 && !selectedBip && (
        <div className="space-y-2">
          {bips.map(bip => (
            <Card key={bip.id} className="cursor-pointer hover:border-emerald-300 transition"
              onClick={() => { onSelectBip(bip); setBipTab("plan"); }}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{bip.targetBehavior}</h3>
                      <StatusBadge status={bip.status} />
                      <span className="text-xs text-gray-400">v{bip.version}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Function: <FunctionBadge func={bip.hypothesizedFunction} />
                      <span className="ml-3">{new Date(bip.createdAt).toLocaleDateString()}</span>
                      {bip.implementationStartDate && <span className="ml-3 text-emerald-600">Active since {bip.implementationStartDate}</span>}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {currentBip && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => { onSelectBip(null); onEdit(null); }}>
              <X className="w-4 h-4 mr-1" /> Back to List
            </Button>
            <div className="flex gap-2 flex-wrap">
              {!editingBip && ["draft", "under_review"].includes(currentBip.status) && (
                <Button variant="outline" size="sm" onClick={() => onEdit({ ...currentBip })}>
                  Edit BIP
                </Button>
              )}
              {!editingBip && ["approved", "active"].includes(currentBip.status) && isApprover && (
                <Button variant="outline" size="sm" onClick={createNewVersion} disabled={creatingVersion}
                  className="text-violet-700 border-violet-200 hover:bg-violet-50">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {creatingVersion ? "Creating…" : "Create New Version"}
                </Button>
              )}
              {editingBip && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(null)}>Cancel</Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={saveBipEdits}>
                    <Save className="w-4 h-4 mr-1" /> Save Changes
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-gray-900 text-base">{currentBip.targetBehavior}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={currentBip.status} />
                  <span className="text-xs text-gray-400">Version {currentBip.version}</span>
                  {currentBip.implementationStartDate && (
                    <span className="text-xs text-emerald-600">Active since {currentBip.implementationStartDate}</span>
                  )}
                  {currentBip.discontinuedDate && (
                    <span className="text-xs text-red-500">Discontinued {currentBip.discontinuedDate}</span>
                  )}
                </div>
              </div>
            </div>

            {currentBip.status !== "discontinued" && currentBip.status !== "archived" && (
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center gap-1 mb-3">
                  {BIP_WORKFLOW_STEPS.map((step, i) => {
                    const steps = BIP_WORKFLOW_STEPS.map(s => s.status);
                    const curIdx = steps.indexOf(currentBip.status);
                    const stepIdx = i;
                    const isDone = stepIdx < curIdx || currentBip.status === step.status;
                    const isCurrent = currentBip.status === step.status;
                    return (
                      <div key={step.status} className="flex items-center flex-1 min-w-0">
                        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                          isCurrent ? "bg-emerald-100 text-emerald-800" : isDone ? "bg-gray-100 text-gray-500" : "text-gray-300"
                        }`}>
                          {isDone && !isCurrent && <CheckCircle2 className="w-3 h-3" />}
                          {step.label}
                        </div>
                        {i < BIP_WORKFLOW_STEPS.length - 1 && (
                          <div className={`flex-1 h-px mx-1 ${stepIdx < curIdx ? "bg-gray-300" : "bg-gray-100"}`} />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-start gap-2 flex-wrap">
                  {currentBip.status === "draft" && isReviewer && (
                    <Button size="sm" variant="outline" disabled={transitioning}
                      onClick={() => doTransition("under_review")}
                      className="text-blue-700 border-blue-200 hover:bg-blue-50">
                      <Send className="w-3.5 h-3.5 mr-1" /> Submit for Review
                    </Button>
                  )}
                  {currentBip.status === "under_review" && isApprover && (
                    <>
                      <Button size="sm" variant="outline" disabled={transitioning}
                        onClick={() => doTransition("approved")}
                        className="text-violet-700 border-violet-200 hover:bg-violet-50">
                        <ThumbsUp className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={transitioning}
                        onClick={() => doTransition("draft")}
                        className="text-gray-600 border-gray-200 hover:bg-gray-50">
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Return to Draft
                      </Button>
                    </>
                  )}
                  {currentBip.status === "approved" && isApprover && (
                    <Button size="sm" disabled={transitioning}
                      onClick={() => doTransition("active")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Play className="w-3.5 h-3.5 mr-1" /> Activate
                    </Button>
                  )}
                  {currentBip.status === "active" && isApprover && (
                    <Button size="sm" variant="outline" disabled={transitioning}
                      onClick={() => doTransition("discontinued")}
                      className="text-red-600 border-red-200 hover:bg-red-50">
                      <Ban className="w-3.5 h-3.5 mr-1" /> Discontinue
                    </Button>
                  )}
                  <input
                    type="text"
                    placeholder="Optional notes for this transition…"
                    value={transitionNotes}
                    onChange={e => setTransitionNotes(e.target.value)}
                    className="flex-1 min-w-[160px] px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-1 border-b border-gray-200">
            {([
              { key: "plan" as const, label: "BIP Plan", icon: Shield },
              { key: "implementers" as const, label: `Implementers${implementers.length > 0 ? ` (${implementers.length})` : ""}`, icon: Users },
              { key: "history" as const, label: `History${statusHistory.length > 0 ? ` (${statusHistory.length})` : ""}`, icon: History },
              { key: "fidelity" as const, label: `Fidelity Log${fidelityLogs.length > 0 ? ` (${fidelityLogs.length})` : ""}`, icon: ClipboardCheck },
            ]).map(t => (
              <button key={t.key} onClick={() => setBipTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-all whitespace-nowrap ${
                  bipTab === t.key ? "border-emerald-700 text-emerald-800" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}>
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {bipTab === "plan" && (
            <Card>
              <CardContent className="pt-5 space-y-5">
                <BipSection title="Target Behavior" field="targetBehavior" value={currentBip.targetBehavior}
                  editing={editingBip} onEdit={onEdit} />
                <BipSection title="Operational Definition" field="operationalDefinition" value={currentBip.operationalDefinition}
                  editing={editingBip} onEdit={onEdit} multiline />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Hypothesized Function:</span>
                  <FunctionBadge func={currentBip.hypothesizedFunction} />
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Replacement Behaviors
                  </h3>
                  <BipSection field="replacementBehaviors" value={currentBip.replacementBehaviors || ""}
                    editing={editingBip} onEdit={onEdit} multiline />
                </div>

                <div className="space-y-4 border-t border-gray-100 pt-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-600" /> Prevention / Antecedent Strategies
                    </h3>
                    {currentBip.antecedentStrategiesStructured?.length
                      ? <StructuredAntecedentDisplay items={currentBip.antecedentStrategiesStructured} />
                      : <BipSection field="preventionStrategies" value={currentBip.preventionStrategies || ""}
                          editing={editingBip} onEdit={onEdit} multiline />
                    }
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-emerald-600" /> Teaching / Replacement Strategies
                    </h3>
                    {currentBip.teachingStrategiesStructured?.length
                      ? <StructuredTeachingDisplay items={currentBip.teachingStrategiesStructured} />
                      : <BipSection field="teachingStrategies" value={currentBip.teachingStrategies || ""}
                          editing={editingBip} onEdit={onEdit} multiline />
                    }
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-gray-600" /> Consequence Procedures
                    </h3>
                    {currentBip.consequenceProceduresStructured?.length
                      ? <StructuredConsequenceDisplay items={currentBip.consequenceProceduresStructured} />
                      : <BipSection field="consequenceStrategies" value={currentBip.consequenceStrategies || ""}
                          editing={editingBip} onEdit={onEdit} multiline />
                    }
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-2">Reinforcement Components</h3>
                  {currentBip.reinforcementComponentsStructured?.length
                    ? <StructuredReinforcementDisplay items={currentBip.reinforcementComponentsStructured} />
                    : <BipSection field="reinforcementSchedule" value={currentBip.reinforcementSchedule || ""}
                        editing={editingBip} onEdit={onEdit} multiline />
                  }
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Crisis / Escalation Supports
                  </h3>
                  {currentBip.crisisSupportsStructured?.length
                    ? <StructuredCrisisDisplay items={currentBip.crisisSupportsStructured} />
                    : <BipSection field="crisisPlan" value={currentBip.crisisPlan || ""}
                        editing={editingBip} onEdit={onEdit} multiline />
                  }
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2">Data Collection Method</h3>
                    <BipSection field="dataCollectionMethod" value={currentBip.dataCollectionMethod || ""}
                      editing={editingBip} onEdit={onEdit} multiline />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2">Progress Criteria</h3>
                    <BipSection field="progressCriteria" value={currentBip.progressCriteria || ""}
                      editing={editingBip} onEdit={onEdit} multiline />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {bipTab === "implementers" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Staff assigned to implement this BIP</p>
                {isApprover && (
                  <Button size="sm" variant="outline" onClick={() => setShowAddImpl(v => !v)}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Assign Staff
                  </Button>
                )}
              </div>

              {showAddImpl && (
                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700">Staff Member *</label>
                        <select value={addImplStaffId} onChange={e => setAddImplStaffId(e.target.value)}
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                          <option value="">Select staff…</option>
                          {staffList.map((s) => (
                            <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.role})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700">Notes</label>
                        <input value={addImplNotes} onChange={e => setAddImplNotes(e.target.value)}
                          placeholder="Optional notes for this assignment…"
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setShowAddImpl(false)}>Cancel</Button>
                      <Button size="sm" onClick={addImplementer} disabled={addingImpl || !addImplStaffId}
                        className="bg-emerald-600 hover:bg-emerald-700">
                        Assign
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {implementers.length === 0 ? (
                <Card><CardContent className="py-10 text-center"><Users className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-400">No implementers assigned yet</p></CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {implementers.map(impl => (
                    <Card key={impl.id}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{impl.staffName || "Staff"}</p>
                          <p className="text-xs text-gray-500">{impl.staffRole || ""} · Assigned {new Date(impl.assignedAt).toLocaleDateString()}
                            {impl.assignedByName ? ` by ${impl.assignedByName}` : ""}
                          </p>
                          {impl.notes && <p className="text-xs text-gray-400 mt-0.5">{impl.notes}</p>}
                        </div>
                        {isApprover && (
                          <Button variant="ghost" size="sm" onClick={() => removeImplementer(impl.id)}
                            className="text-red-400 hover:text-red-600">
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {bipTab === "history" && (
            <div className="space-y-4">
              {versionHistory.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                    Version History ({versionHistory.length + 1} total)
                  </h3>
                  <div className="space-y-2">
                    <Card className="border-emerald-200 bg-emerald-50/30">
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-800">v{currentBip.version} (current)</span>
                            <StatusBadge status={currentBip.status} />
                          </div>
                          <div className="text-xs text-gray-400">
                            {currentBip.createdByName && <span>by {currentBip.createdByName} · </span>}
                            <span>{new Date(currentBip.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    {versionHistory.map((v, idx) => {
                      const newerBip = idx === 0 ? currentBip : versionHistory[idx - 1];
                      const changedFields = computeBipDiff(v, newerBip);
                      return (
                        <Card key={v.id} className="bg-gray-50/50">
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-700">v{v.version}</span>
                                <StatusBadge status={v.status} />
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                {v.createdByName && <span>by {v.createdByName}</span>}
                                <span>{new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                              </div>
                            </div>
                            {changedFields.length > 0 ? (
                              <div className="mt-1.5">
                                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Changed in v{newerBip.version}:</p>
                                <div className="flex flex-wrap gap-1">
                                  {changedFields.map(f => (
                                    <span key={f} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded">
                                      {f}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-gray-400 mt-1">No plan content changes from this version</p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Status Changes
                </h3>
                {statusHistory.length === 0 ? (
                  <Card><CardContent className="py-8 text-center"><History className="w-7 h-7 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-400">No status changes recorded yet</p></CardContent></Card>
                ) : (
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
                    <div className="space-y-3 pl-10">
                      {statusHistory.map(entry => (
                        <div key={entry.id} className="relative">
                          <div className="absolute -left-6 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
                          <Card>
                            <CardContent className="py-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <StatusBadge status={entry.fromStatus} />
                                <ArrowRight className="w-3 h-3 text-gray-400" />
                                <StatusBadge status={entry.toStatus} />
                                <span className="text-xs text-gray-400 ml-auto">
                                  {new Date(entry.changedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  {entry.changedByName ? ` · ${entry.changedByName}` : ""}
                                </span>
                              </div>
                              {entry.notes && <p className="text-xs text-gray-500 mt-1">{entry.notes}</p>}
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {bipTab === "fidelity" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Implementation fidelity check-ins</p>
                <Button size="sm" variant="outline" onClick={() => setShowAddFidelity(v => !v)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Log Entry
                </Button>
              </div>

              {showAddFidelity && (
                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700">Date *</label>
                        <input type="date" value={fidelityForm.logDate}
                          onChange={e => setFidelityForm(p => ({ ...p, logDate: e.target.value }))}
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700">Fidelity Rating (1–4)</label>
                        <select value={fidelityForm.fidelityRating}
                          onChange={e => setFidelityForm(p => ({ ...p, fidelityRating: e.target.value }))}
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                          <option value="">Select…</option>
                          <option value="4">4 — Full fidelity (all steps followed)</option>
                          <option value="3">3 — High fidelity (most steps followed)</option>
                          <option value="2">2 — Partial fidelity (some steps missed)</option>
                          <option value="1">1 — Low fidelity (significant deviation)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Student Response</label>
                      <input value={fidelityForm.studentResponse}
                        onChange={e => setFidelityForm(p => ({ ...p, studentResponse: e.target.value }))}
                        placeholder="How did the student respond today?"
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Implementation Notes</label>
                      <textarea value={fidelityForm.implementationNotes} rows={2}
                        onChange={e => setFidelityForm(p => ({ ...p, implementationNotes: e.target.value }))}
                        placeholder="Any notes on implementation, challenges, or observations…"
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setShowAddFidelity(false)}>Cancel</Button>
                      <Button size="sm" onClick={addFidelityLog} disabled={addingFidelity || !fidelityForm.logDate}
                        className="bg-emerald-600 hover:bg-emerald-700">
                        <Save className="w-3.5 h-3.5 mr-1" /> Save Entry
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {fidelityLogs.length === 0 ? (
                <Card><CardContent className="py-10 text-center"><ClipboardCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-400">No fidelity entries yet. Log check-ins when implementing this BIP.</p></CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {fidelityLogs.map(log => {
                    const ratingColors = ["", "bg-red-50 text-red-700", "bg-amber-50 text-amber-700", "bg-emerald-50 text-emerald-700", "bg-emerald-100 text-emerald-800"];
                    const ratingLabels = ["", "Low", "Partial", "High", "Full"];
                    return (
                      <Card key={log.id}>
                        <CardContent className="py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-900">{log.logDate}</span>
                                {log.staffName && <span className="text-xs text-gray-400">by {log.staffName}</span>}
                                {log.fidelityRating != null && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ratingColors[log.fidelityRating] || ""}`}>
                                    {ratingLabels[log.fidelityRating] || ""} fidelity
                                  </span>
                                )}
                              </div>
                              {log.studentResponse && <p className="text-xs text-gray-600 mt-1"><span className="font-medium">Student response:</span> {log.studentResponse}</p>}
                              {log.implementationNotes && <p className="text-xs text-gray-500 mt-0.5">{log.implementationNotes}</p>}
                            </div>
                            <button onClick={() => removeFidelityLog(log.id)} className="text-gray-300 hover:text-red-400 flex-shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
