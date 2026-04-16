import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, Plus, FileText, Search, AlertTriangle, TrendingDown,
  ChevronRight, X, Save, Trash2, BarChart3, Brain, Shield, ArrowRight,
  Clock, Eye, CheckCircle2, Circle, Users, History, ClipboardCheck,
  Send, ThumbsUp, Play, Ban, RotateCcw, UserMinus
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, Cell
} from "recharts";
import { toast } from "sonner";
import { listStudents, listFbas, getStudentBips, listFbaObservations, getFbaObservationsSummary, listFaSessions, createFba, updateFba, createFbaObservation, deleteFbaObservation, createFaSession, deleteFaSession, updateBip, generateBipFromFba, listStaff } from "@workspace/api-client-react";
import { useRole } from "@/lib/role-context";
import { authFetch } from "@/lib/auth-fetch";

interface Student { id: number; firstName: string; lastName: string; }
interface FbaRecord {
  id: number; studentId: number; conductedBy: number | null;
  targetBehavior: string; operationalDefinition: string; status: string;
  referralDate: string | null; startDate: string | null; completionDate: string | null;
  hypothesizedFunction: string | null; conductedByName: string | null;
  referralReason?: string; settingDescription?: string;
  indirectMethods?: string; indirectFindings?: string;
  directMethods?: string; directFindings?: string;
  hypothesisNarrative?: string; recommendations?: string;
  createdAt: string; updatedAt: string;
}
interface Observation {
  id: number; fbaId: number; observerId: number | null;
  observationDate: string; observationTime: string | null;
  durationMinutes: number | null; setting: string | null; activity: string | null;
  antecedent: string; antecedentCategory: string | null;
  behavior: string; behaviorIntensity: string | null;
  behaviorDurationSeconds: number | null;
  consequence: string; consequenceCategory: string | null;
  perceivedFunction: string | null; notes: string | null;
}
interface FaSession {
  id: number; fbaId: number; sessionNumber: number; condition: string;
  sessionDate: string; durationMinutes: number; responseCount: number;
  responseRate: string | null; notes: string | null;
}
interface ObsSummary {
  totalObservations: number;
  functionCounts: Record<string, number>;
  antecedentCounts: Record<string, number>;
  consequenceCounts: Record<string, number>;
  scatterData: Record<string, number>;
  suggestedFunction: string | null;
}
interface BipRecord {
  id: number; studentId: number; fbaId: number | null; status: string;
  targetBehavior: string; operationalDefinition: string; hypothesizedFunction: string;
  replacementBehaviors: string | null; preventionStrategies: string | null;
  teachingStrategies: string | null; consequenceStrategies: string | null;
  reinforcementSchedule: string | null; crisisPlan: string | null;
  dataCollectionMethod: string | null; progressCriteria: string | null;
  reviewDate: string | null; effectiveDate: string | null;
  implementationStartDate: string | null; discontinuedDate: string | null;
  version: number; versionGroupId: number | null;
  createdByName?: string | null;
  createdAt: string; updatedAt: string;
}

interface StaffEntry {
  id: number; firstName: string; lastName: string; role: string;
}
interface BipStatusEntry {
  id: number; fromStatus: string; toStatus: string;
  changedById: number | null; changedByName: string | null;
  notes: string | null; changedAt: string;
}
interface BipImplementerEntry {
  id: number; staffId: number; staffName: string | null; staffRole: string | null;
  assignedByName: string | null; notes: string | null; assignedAt: string;
}
interface BipFidelityEntry {
  id: number; staffId: number | null; staffName: string | null;
  logDate: string; fidelityRating: number | null;
  studentResponse: string | null; implementationNotes: string | null;
  createdAt: string;
}

const ANTECEDENT_CATEGORIES = [
  "Task demand", "Transition", "Denied access", "Peer interaction",
  "Adult attention removed", "Unstructured time", "Sensory environment", "Other"
];
const CONSEQUENCE_CATEGORIES = [
  "Attention given", "Task removed/delayed", "Item/activity provided",
  "Peer reaction", "Sensory input", "Redirected", "Ignored", "Other"
];
const FUNCTION_OPTIONS = ["attention", "escape", "tangible", "sensory"];
const INTENSITY_OPTIONS = ["low", "moderate", "high", "severe"];
const FA_CONDITIONS = ["attention", "escape", "tangible", "control", "alone", "play"];
const CONDITION_COLORS: Record<string, string> = {
  attention: "#059669", escape: "#d97706", tangible: "#6b7280",
  control: "#374151", alone: "#92400e", play: "#10b981"
};

const BIP_DIFF_FIELDS: Array<{ key: keyof BipRecord; label: string }> = [
  { key: "targetBehavior", label: "Target Behavior" },
  { key: "operationalDefinition", label: "Operational Definition" },
  { key: "hypothesizedFunction", label: "Hypothesized Function" },
  { key: "replacementBehaviors", label: "Replacement Behaviors" },
  { key: "preventionStrategies", label: "Prevention Strategies" },
  { key: "teachingStrategies", label: "Teaching Strategies" },
  { key: "consequenceStrategies", label: "Consequence Strategies" },
  { key: "reinforcementSchedule", label: "Reinforcement Schedule" },
  { key: "crisisPlan", label: "Crisis Plan" },
  { key: "dataCollectionMethod", label: "Data Collection Method" },
  { key: "progressCriteria", label: "Progress Criteria" },
  { key: "reviewDate", label: "Review Date" },
  { key: "effectiveDate", label: "Effective Date" },
];

function computeBipDiff(older: BipRecord, newer: BipRecord): string[] {
  return BIP_DIFF_FIELDS
    .filter(({ key }) => (older[key] ?? "") !== (newer[key] ?? ""))
    .map(({ label }) => label);
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-700" },
  "in-progress": { label: "In Progress", cls: "bg-amber-50 text-amber-700" },
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700" },
  under_review: { label: "Under Review", cls: "bg-blue-50 text-blue-700" },
  approved: { label: "Approved", cls: "bg-violet-50 text-violet-700" },
  active: { label: "Active", cls: "bg-emerald-100 text-emerald-800 font-semibold" },
  discontinued: { label: "Discontinued", cls: "bg-red-50 text-red-600" },
  archived: { label: "Archived", cls: "bg-gray-100 text-gray-500" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function FunctionBadge({ func }: { func: string }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 capitalize">
      {func}
    </span>
  );
}

export default function BehaviorAssessmentPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"fbas" | "abc" | "fa" | "bip">("fbas");

  const [fbas, setFbas] = useState<FbaRecord[]>([]);
  const [selectedFba, setSelectedFba] = useState<FbaRecord | null>(null);
  const [showNewFba, setShowNewFba] = useState(false);

  const [observations, setObservations] = useState<Observation[]>([]);
  const [obsSummary, setObsSummary] = useState<ObsSummary | null>(null);
  const [showNewObs, setShowNewObs] = useState(false);

  const [faSessions, setFaSessions] = useState<FaSession[]>([]);
  const [showNewFa, setShowNewFa] = useState(false);

  const [bips, setBips] = useState<BipRecord[]>([]);
  const [selectedBip, setSelectedBip] = useState<BipRecord | null>(null);
  const [editingBip, setEditingBip] = useState<Partial<BipRecord> | null>(null);

  useEffect(() => {
    listStudents({ limit: 200 } as any).then(d => {
      const list = Array.isArray(d) ? d : (d as any).students || [];
      setStudents(list);
    }).catch(() => {});
  }, []);

  const loadFbas = useCallback(async (sid: number) => {
    const data = await listFbas(sid);
    setFbas(data as any);
  }, []);

  const loadBips = useCallback(async (sid: number) => {
    const data = await getStudentBips(sid);
    setBips(data as any);
  }, []);

  const loadObservations = useCallback(async (fbaId: number) => {
    const [obsR, sumR] = await Promise.all([
      listFbaObservations(fbaId),
      getFbaObservationsSummary(fbaId),
    ]);
    setObservations(obsR as any);
    setObsSummary(sumR as any);
  }, []);

  const loadFaSessions = useCallback(async (fbaId: number) => {
    const data = await listFaSessions(fbaId);
    setFaSessions(data as any);
  }, []);

  const selectStudent = (s: Student) => {
    setSelectedStudent(s);
    setSelectedFba(null);
    setSelectedBip(null);
    loadFbas(s.id);
    loadBips(s.id);
  };

  const selectFba = (fba: FbaRecord) => {
    setSelectedFba(fba);
    loadObservations(fba.id);
    loadFaSessions(fba.id);
  };

  const filteredStudents = students.filter(s =>
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const tabs = [
    { key: "fbas" as const, label: "FBAs", icon: ClipboardList },
    { key: "abc" as const, label: "ABC Data", icon: Eye },
    { key: "fa" as const, label: "Functional Analysis", icon: BarChart3 },
    { key: "bip" as const, label: "BIP", icon: Shield },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Behavior Assessment</h1>
        <p className="text-sm text-gray-500 mt-1">FBA, Functional Analysis, and Behavior Intervention Plans</p>
      </div>

      {!selectedStudent ? (
        <StudentPicker
          students={filteredStudents}
          search={studentSearch}
          onSearch={setStudentSearch}
          onSelect={selectStudent}
        />
      ) : (
        <>
          <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 font-bold text-sm">
              {selectedStudent.firstName[0]}{selectedStudent.lastName[0]}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{selectedStudent.firstName} {selectedStudent.lastName}</p>
              <p className="text-xs text-gray-500">{fbas.length} FBA{fbas.length !== 1 ? "s" : ""} · {bips.length} BIP{bips.length !== 1 ? "s" : ""}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedStudent(null); setSelectedFba(null); setSelectedBip(null); }}>
              Change Student
            </Button>
          </div>

          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {tabs.map(t => (
              <button key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
                  activeTab === t.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <t.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          {activeTab === "fbas" && (
            <FbaListPanel
              fbas={fbas}
              selectedFba={selectedFba}
              student={selectedStudent}
              onSelect={selectFba}
              showNew={showNewFba}
              onShowNew={setShowNewFba}
              onCreated={() => { loadFbas(selectedStudent.id); setShowNewFba(false); }}
            />
          )}

          {activeTab === "abc" && (
            selectedFba ? (
              <AbcDataPanel
                fba={selectedFba}
                observations={observations}
                summary={obsSummary}
                showNew={showNewObs}
                onShowNew={setShowNewObs}
                onCreated={() => loadObservations(selectedFba.id)}
                onDeleted={() => loadObservations(selectedFba.id)}
              />
            ) : (
              <EmptyState icon={Eye} message="Select an FBA first to record ABC observations" />
            )
          )}

          {activeTab === "fa" && (
            selectedFba ? (
              <FaPanel
                fba={selectedFba}
                sessions={faSessions}
                showNew={showNewFa}
                onShowNew={setShowNewFa}
                onCreated={() => loadFaSessions(selectedFba.id)}
                onDeleted={() => loadFaSessions(selectedFba.id)}
              />
            ) : (
              <EmptyState icon={BarChart3} message="Select an FBA first to run a Functional Analysis" />
            )
          )}

          {activeTab === "bip" && (
            <BipPanel
              student={selectedStudent}
              bips={bips}
              selectedBip={selectedBip}
              editingBip={editingBip}
              selectedFba={selectedFba}
              onSelectBip={(b) => { setSelectedBip(b); setEditingBip(null); }}
              onEdit={setEditingBip}
              onRefresh={() => loadBips(selectedStudent.id)}
            />
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">{message}</p>
      </CardContent>
    </Card>
  );
}

function StudentPicker({ students, search, onSearch, onSelect }: {
  students: Student[]; search: string; onSearch: (s: string) => void; onSelect: (s: Student) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Select a Student</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Search students..."
            value={search} onChange={e => onSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
          {students.slice(0, 50).map(s => (
            <button key={s.id} onClick={() => onSelect(s)}
              className="flex items-center gap-2.5 p-3 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition text-left"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 font-bold text-xs">
                {s.firstName[0]}{s.lastName[0]}
              </div>
              <span className="text-sm font-medium text-gray-900">{s.firstName} {s.lastName}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FbaListPanel({ fbas, selectedFba, student, onSelect, showNew, onShowNew, onCreated }: {
  fbas: FbaRecord[]; selectedFba: FbaRecord | null; student: Student;
  onSelect: (f: FbaRecord) => void; showNew: boolean; onShowNew: (v: boolean) => void; onCreated: () => void;
}) {
  const [form, setForm] = useState({
    targetBehavior: "", operationalDefinition: "", referralReason: "", settingDescription: ""
  });
  const [saving, setSaving] = useState(false);
  const [editingFba, setEditingFba] = useState<FbaRecord | null>(null);

  const handleCreate = async () => {
    if (!form.targetBehavior || !form.operationalDefinition) {
      toast.error("Target behavior and operational definition are required");
      return;
    }
    setSaving(true);
    try {
      await createFba(student.id, { ...form, status: "draft" });
      toast.success("FBA created");
      setForm({ targetBehavior: "", operationalDefinition: "", referralReason: "", settingDescription: "" });
      onCreated();
    } catch { toast.error("Failed to create FBA"); }
    setSaving(false);
  };

  const updateFbaField = async (fbaId: number, field: string, value: string) => {
    try {
      await updateFba(fbaId, { [field]: value } as any);
    } catch { toast.error("Failed to update"); }
  };

  const updateFbaStatus = async (fbaId: number, status: string) => {
    try {
      await updateFba(fbaId, { status } as any);
      toast.success(`Status updated to ${status}`); onCreated();
    } catch { toast.error("Failed to update status"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Functional Behavior Assessments</h2>
        <Button size="sm" onClick={() => onShowNew(!showNew)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1" /> New FBA
        </Button>
      </div>

      {showNew && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-5 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Target Behavior *</label>
              <input value={form.targetBehavior} onChange={e => setForm(p => ({ ...p, targetBehavior: e.target.value }))}
                placeholder="e.g., Physical aggression toward peers"
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Operational Definition *</label>
              <textarea value={form.operationalDefinition} onChange={e => setForm(p => ({ ...p, operationalDefinition: e.target.value }))}
                rows={3} placeholder="Observable, measurable description of the behavior..."
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Referral Reason</label>
                <input value={form.referralReason} onChange={e => setForm(p => ({ ...p, referralReason: e.target.value }))}
                  placeholder="Why was this FBA requested?"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Setting Description</label>
                <input value={form.settingDescription} onChange={e => setForm(p => ({ ...p, settingDescription: e.target.value }))}
                  placeholder="e.g., General education classroom, resource room"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => onShowNew(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                <Save className="w-4 h-4 mr-1" /> Create FBA
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {fbas.length === 0 && !showNew ? (
        <EmptyState icon={ClipboardList} message="No FBAs yet. Create one to begin assessment." />
      ) : (
        <div className="space-y-2">
          {fbas.map(fba => (
            <Card key={fba.id}
              className={`cursor-pointer transition hover:border-emerald-300 ${selectedFba?.id === fba.id ? "border-emerald-400 ring-1 ring-emerald-200" : ""}`}
              onClick={() => onSelect(fba)}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">{fba.targetBehavior}</h3>
                      <StatusBadge status={fba.status} />
                    </div>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{fba.operationalDefinition}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      {fba.hypothesizedFunction && (
                        <span className="flex items-center gap-1">
                          <Brain className="w-3 h-3" /> Function: <FunctionBadge func={fba.hypothesizedFunction} />
                        </span>
                      )}
                      {fba.conductedByName && <span>By: {fba.conductedByName}</span>}
                      <span>{new Date(fba.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    {fba.status === "draft" && (
                      <Button variant="ghost" size="sm" className="text-xs"
                        onClick={(e) => { e.stopPropagation(); updateFbaStatus(fba.id, "in-progress"); }}>
                        Start
                      </Button>
                    )}
                    {fba.status === "in-progress" && (
                      <Button variant="ghost" size="sm" className="text-xs text-emerald-600"
                        onClick={(e) => { e.stopPropagation(); updateFbaStatus(fba.id, "completed"); }}>
                        Complete
                      </Button>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {selectedFba?.id === fba.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-3" onClick={e => e.stopPropagation()}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600">Indirect Assessment Methods</label>
                        <textarea defaultValue={fba.indirectMethods || ""}
                          onBlur={e => updateFbaField(fba.id, "indirectMethods", e.target.value)}
                          rows={2} placeholder="Interviews, rating scales, record review..."
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Indirect Findings</label>
                        <textarea defaultValue={fba.indirectFindings || ""}
                          onBlur={e => updateFbaField(fba.id, "indirectFindings", e.target.value)}
                          rows={2} placeholder="Summary of interview/rating scale results..."
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Direct Observation Methods</label>
                        <textarea defaultValue={fba.directMethods || ""}
                          onBlur={e => updateFbaField(fba.id, "directMethods", e.target.value)}
                          rows={2} placeholder="ABC recording, scatter plot, frequency count..."
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Direct Findings</label>
                        <textarea defaultValue={fba.directFindings || ""}
                          onBlur={e => updateFbaField(fba.id, "directFindings", e.target.value)}
                          rows={2} placeholder="Patterns observed in ABC data..."
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Hypothesis Narrative</label>
                      <textarea defaultValue={fba.hypothesisNarrative || ""}
                        onBlur={e => updateFbaField(fba.id, "hypothesisNarrative", e.target.value)}
                        rows={3} placeholder="When [antecedent], [student] engages in [behavior] in order to [function]..."
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600">Hypothesized Function</label>
                        <select defaultValue={fba.hypothesizedFunction || ""}
                          onChange={e => updateFbaField(fba.id, "hypothesizedFunction", e.target.value)}
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                          <option value="">Select...</option>
                          {FUNCTION_OPTIONS.map(f => <option key={f} value={f} className="capitalize">{f}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Recommendations</label>
                        <textarea defaultValue={fba.recommendations || ""}
                          onBlur={e => updateFbaField(fba.id, "recommendations", e.target.value)}
                          rows={2} placeholder="Develop BIP, conduct FA, environmental modifications..."
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AbcDataPanel({ fba, observations, summary, showNew, onShowNew, onCreated, onDeleted }: {
  fba: FbaRecord; observations: Observation[]; summary: ObsSummary | null;
  showNew: boolean; onShowNew: (v: boolean) => void; onCreated: () => void; onDeleted: () => void;
}) {
  const [form, setForm] = useState({
    observationDate: new Date().toISOString().split("T")[0],
    observationTime: "", setting: "", activity: "",
    antecedent: "", antecedentCategory: "",
    behavior: "", behaviorIntensity: "",
    behaviorDurationSeconds: "",
    consequence: "", consequenceCategory: "",
    perceivedFunction: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.antecedent || !form.behavior || !form.consequence) {
      toast.error("Antecedent, Behavior, and Consequence are required");
      return;
    }
    setSaving(true);
    try {
      await createFbaObservation(fba.id, {
          ...form,
          behaviorDurationSeconds: form.behaviorDurationSeconds ? parseInt(form.behaviorDurationSeconds) : null,
        } as any);
      toast.success("ABC observation recorded");
      setForm(prev => ({
        ...prev, antecedent: "", antecedentCategory: "", behavior: "",
        behaviorIntensity: "", behaviorDurationSeconds: "", consequence: "",
        consequenceCategory: "", perceivedFunction: "", notes: "",
      }));
      onCreated();
    } catch { toast.error("Failed to save observation"); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteFbaObservation(id);
      toast.success("Observation deleted");
      onDeleted();
    } catch { toast.error("Failed to delete"); }
  };

  const functionChartData = summary ? Object.entries(summary.functionCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count) : [];

  const antecedentChartData = summary ? Object.entries(summary.antecedentCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count) : [];

  const TIME_BLOCKS = [
    { key: "6", label: "6am" }, { key: "7", label: "7am" }, { key: "8", label: "8am" },
    { key: "9", label: "9am" }, { key: "10", label: "10am" }, { key: "11", label: "11am" },
    { key: "12", label: "12pm" }, { key: "13", label: "1pm" }, { key: "14", label: "2pm" },
    { key: "15", label: "3pm" }, { key: "16", label: "4pm" },
  ];

  const obsWithTime = observations.filter(o => o.observationTime);
  const scatterDates = [...new Set(obsWithTime.map(o => o.observationDate))].sort().slice(-10);
  const scatterGrid: Record<string, Record<string, number>> = {};
  for (const obs of obsWithTime) {
    const hour = obs.observationTime!.split(":")[0];
    if (!scatterGrid[obs.observationDate]) scatterGrid[obs.observationDate] = {};
    scatterGrid[obs.observationDate][hour] = (scatterGrid[obs.observationDate][hour] || 0) + 1;
  }
  const scatterMaxCount = Math.max(1, ...Object.values(scatterGrid).flatMap(d => Object.values(d)));

  const topAntecedents = summary ? Object.entries(summary.antecedentCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]) : [];
  const topConsequences = summary ? Object.entries(summary.consequenceCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]) : [];
  const acMatrix: Record<string, Record<string, number>> = {};
  for (const obs of observations) {
    const ant = obs.antecedentCategory;
    const con = obs.consequenceCategory;
    if (!ant || !con) continue;
    if (!acMatrix[ant]) acMatrix[ant] = {};
    acMatrix[ant][con] = (acMatrix[ant][con] || 0) + 1;
  }
  const acMaxCount = Math.max(1, ...Object.values(acMatrix).flatMap(row => Object.values(row)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">ABC Data Collection</h2>
          <p className="text-xs text-gray-500">FBA: {fba.targetBehavior}</p>
        </div>
        <Button size="sm" onClick={() => onShowNew(!showNew)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1" /> Record Observation
        </Button>
      </div>

      {showNew && (
        <Card className="border-emerald-200">
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Date *</label>
                <input type="date" value={form.observationDate}
                  onChange={e => setForm(p => ({ ...p, observationDate: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Time</label>
                <input type="time" value={form.observationTime}
                  onChange={e => setForm(p => ({ ...p, observationTime: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Setting</label>
                <input value={form.setting} onChange={e => setForm(p => ({ ...p, setting: e.target.value }))}
                  placeholder="e.g., Math class"
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Activity</label>
                <input value={form.activity} onChange={e => setForm(p => ({ ...p, activity: e.target.value }))}
                  placeholder="e.g., Independent work"
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">A</span>
                  <label className="text-sm font-semibold text-gray-800">Antecedent *</label>
                </div>
                <select value={form.antecedentCategory} onChange={e => setForm(p => ({ ...p, antecedentCategory: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="">Category...</option>
                  {ANTECEDENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea value={form.antecedent} onChange={e => setForm(p => ({ ...p, antecedent: e.target.value }))}
                  rows={3} placeholder="What happened immediately before the behavior?"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">B</span>
                  <label className="text-sm font-semibold text-gray-800">Behavior *</label>
                </div>
                <select value={form.behaviorIntensity} onChange={e => setForm(p => ({ ...p, behaviorIntensity: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="">Intensity...</option>
                  {INTENSITY_OPTIONS.map(i => <option key={i} value={i} className="capitalize">{i}</option>)}
                </select>
                <textarea value={form.behavior} onChange={e => setForm(p => ({ ...p, behavior: e.target.value }))}
                  rows={3} placeholder="Describe the behavior as observed..."
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <div>
                  <label className="text-xs text-gray-500">Duration (seconds)</label>
                  <input type="number" value={form.behaviorDurationSeconds}
                    onChange={e => setForm(p => ({ ...p, behaviorDurationSeconds: e.target.value }))}
                    placeholder="0" className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">C</span>
                  <label className="text-sm font-semibold text-gray-800">Consequence *</label>
                </div>
                <select value={form.consequenceCategory} onChange={e => setForm(p => ({ ...p, consequenceCategory: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="">Category...</option>
                  {CONSEQUENCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea value={form.consequence} onChange={e => setForm(p => ({ ...p, consequence: e.target.value }))}
                  rows={3} placeholder="What happened immediately after the behavior?"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Perceived Function</label>
                <select value={form.perceivedFunction} onChange={e => setForm(p => ({ ...p, perceivedFunction: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="">Select...</option>
                  {FUNCTION_OPTIONS.map(f => <option key={f} value={f} className="capitalize">{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Additional context..."
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => onShowNew(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                <Save className="w-4 h-4 mr-1" /> Save Observation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {summary && summary.totalObservations > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Function Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {functionChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={functionChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-400 text-center py-8">No function data yet</p>}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Scatterplot · Behavior by Time of Day</CardTitle>
              <p className="text-[11px] text-gray-400">Each cell = observations at that time block. Darker = more occurrences.</p>
            </CardHeader>
            <CardContent>
              {scatterDates.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr>
                        <th className="text-left py-1 pr-2 text-gray-400 font-normal w-12">Time</th>
                        {scatterDates.map(d => (
                          <th key={d} className="text-center py-1 px-0.5 text-gray-400 font-normal whitespace-nowrap min-w-[32px]">
                            {new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_BLOCKS.map(tb => (
                        <tr key={tb.key}>
                          <td className="py-0.5 pr-2 text-gray-400 font-normal">{tb.label}</td>
                          {scatterDates.map(d => {
                            const count = scatterGrid[d]?.[tb.key] ?? 0;
                            const opacity = count === 0 ? 0 : 0.15 + (count / scatterMaxCount) * 0.85;
                            return (
                              <td key={d} className="py-0.5 px-0.5 text-center">
                                <div
                                  className="w-7 h-6 rounded mx-auto flex items-center justify-center text-[9px] font-bold"
                                  style={{
                                    backgroundColor: count > 0 ? `rgba(239,68,68,${opacity})` : "transparent",
                                    color: count > 0 && opacity > 0.5 ? "white" : count > 0 ? "#dc2626" : "transparent",
                                    border: count === 0 ? "1px solid #f3f4f6" : "none",
                                  }}
                                  title={count > 0 ? `${count} observation${count > 1 ? "s" : ""}` : ""}
                                >
                                  {count > 0 ? count : ""}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-gray-400">Add observation times to see the scatterplot</p>
                  <p className="text-xs text-gray-300 mt-1">Record the time when logging each ABC observation</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Antecedent Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              {antecedentChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={antecedentChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#d97706" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-400 text-center py-8">No antecedent data yet</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Observations</span>
                <span className="text-lg font-bold text-gray-900">{summary.totalObservations}</span>
              </div>
              {summary.suggestedFunction && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Most Common Function</span>
                  <FunctionBadge func={summary.suggestedFunction} />
                </div>
              )}
              <div className="space-y-1">
                <span className="text-xs font-medium text-gray-500">Consequence Patterns</span>
                {Object.entries(summary.consequenceCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate">{name}</span>
                    <span className="text-gray-900 font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {topAntecedents.length > 0 && topConsequences.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Antecedent → Consequence Pattern Review</CardTitle>
                <p className="text-[11px] text-gray-400">How often each antecedent is followed by each consequence. Helps identify maintaining variables.</p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr>
                      <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">Antecedent ↓ / Consequence →</th>
                      {topConsequences.map(c => (
                        <th key={c} className="text-center py-1.5 px-2 text-gray-500 font-medium max-w-[90px] whitespace-normal">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topAntecedents.map(ant => (
                      <tr key={ant} className="border-t border-gray-50">
                        <td className="py-1.5 pr-3 text-gray-600 font-medium">{ant}</td>
                        {topConsequences.map(con => {
                          const count = acMatrix[ant]?.[con] ?? 0;
                          const intensity = count / acMaxCount;
                          return (
                            <td key={con} className="py-1.5 px-2 text-center">
                              {count > 0 ? (
                                <span
                                  className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold"
                                  style={{
                                    backgroundColor: `rgba(234,179,8,${0.15 + intensity * 0.85})`,
                                    color: intensity > 0.5 ? "#713f12" : "#92400e",
                                  }}
                                >
                                  {count}
                                </span>
                              ) : (
                                <span className="text-gray-200">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {observations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Observation Log ({observations.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Date/Time</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Setting</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 bg-amber-50">Antecedent</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 bg-red-50">Behavior</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 bg-emerald-50">Consequence</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Function</th>
                    <th className="py-2 px-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {observations.map(obs => (
                    <tr key={obs.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-2 text-xs text-gray-600 whitespace-nowrap">
                        {obs.observationDate}{obs.observationTime ? ` ${obs.observationTime}` : ""}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-600">{obs.setting || "—"}</td>
                      <td className="py-2 px-2 text-xs bg-amber-50/50 max-w-[200px]">
                        {obs.antecedentCategory && <span className="text-amber-700 font-medium">{obs.antecedentCategory}: </span>}
                        <span className="text-gray-700">{obs.antecedent}</span>
                      </td>
                      <td className="py-2 px-2 text-xs bg-red-50/50 max-w-[200px]">
                        {obs.behaviorIntensity && <span className={`font-medium ${obs.behaviorIntensity === "severe" || obs.behaviorIntensity === "high" ? "text-red-600" : "text-gray-600"}`}>[{obs.behaviorIntensity}] </span>}
                        <span className="text-gray-700">{obs.behavior}</span>
                        {obs.behaviorDurationSeconds && <span className="text-gray-400"> ({obs.behaviorDurationSeconds}s)</span>}
                      </td>
                      <td className="py-2 px-2 text-xs bg-emerald-50/50 max-w-[200px]">
                        {obs.consequenceCategory && <span className="text-emerald-700 font-medium">{obs.consequenceCategory}: </span>}
                        <span className="text-gray-700">{obs.consequence}</span>
                      </td>
                      <td className="py-2 px-2">
                        {obs.perceivedFunction ? <FunctionBadge func={obs.perceivedFunction} /> : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="py-2 px-1">
                        <button onClick={() => handleDelete(obs.id)} className="text-gray-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FaPanel({ fba, sessions, showNew, onShowNew, onCreated, onDeleted }: {
  fba: FbaRecord; sessions: FaSession[]; showNew: boolean;
  onShowNew: (v: boolean) => void; onCreated: () => void; onDeleted: () => void;
}) {
  const [form, setForm] = useState({
    condition: "attention", sessionDate: new Date().toISOString().split("T")[0],
    durationMinutes: "10", responseCount: "0", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const nextSessionNum = sessions.length > 0 ? Math.max(...sessions.map(s => s.sessionNumber)) + 1 : 1;

  const handleSave = async () => {
    setSaving(true);
    try {
      await createFaSession(fba.id, {
          sessionNumber: nextSessionNum,
          condition: form.condition,
          sessionDate: form.sessionDate,
          durationMinutes: parseInt(form.durationMinutes) || 10,
          responseCount: parseInt(form.responseCount) || 0,
          responseRate: (parseInt(form.durationMinutes) || 10) > 0
            ? String(((parseInt(form.responseCount) || 0) / (parseInt(form.durationMinutes) || 10)).toFixed(2))
            : null,
          notes: form.notes || null,
        } as any);
      toast.success("FA session recorded");
      setForm(prev => ({ ...prev, responseCount: "0", notes: "" }));
      onCreated();
    } catch { toast.error("Failed to save FA session"); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteFaSession(id);
      toast.success("Session deleted");
      onDeleted();
    } catch { toast.error("Failed to delete"); }
  };

  const chartData = sessions.reduce((acc, s) => {
    const existing = acc.find(d => d.session === s.sessionNumber);
    const rate = s.responseRate ? parseFloat(s.responseRate) : (s.durationMinutes > 0 ? s.responseCount / s.durationMinutes : 0);
    if (existing) {
      existing[s.condition] = rate;
    } else {
      acc.push({ session: s.sessionNumber, [s.condition]: rate });
    }
    return acc;
  }, [] as any[]).sort((a: any, b: any) => a.session - b.session);

  const conditions = [...new Set(sessions.map(s => s.condition))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Functional Analysis</h2>
          <p className="text-xs text-gray-500">FBA: {fba.targetBehavior} · {sessions.length} sessions recorded</p>
        </div>
        <Button size="sm" onClick={() => onShowNew(!showNew)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1" /> Record Session
        </Button>
      </div>

      {showNew && (
        <Card className="border-emerald-200">
          <CardContent className="pt-5 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Condition *</label>
                <select value={form.condition} onChange={e => setForm(p => ({ ...p, condition: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  {FA_CONDITIONS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Date *</label>
                <input type="date" value={form.sessionDate}
                  onChange={e => setForm(p => ({ ...p, sessionDate: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Duration (min)</label>
                <input type="number" value={form.durationMinutes}
                  onChange={e => setForm(p => ({ ...p, durationMinutes: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Response Count</label>
                <input type="number" value={form.responseCount}
                  onChange={e => setForm(p => ({ ...p, responseCount: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Session Notes</label>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Observations during this condition..."
                className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
              <p className="font-semibold text-gray-700">Condition Descriptions:</p>
              <p><span className="font-medium">Attention:</span> Attention diverted; deliver attention contingent on target behavior</p>
              <p><span className="font-medium">Escape:</span> Present demand; remove demand contingent on target behavior</p>
              <p><span className="font-medium">Tangible:</span> Remove preferred item; deliver contingent on target behavior</p>
              <p><span className="font-medium">Control/Play:</span> Free access to attention, items, no demands (comparison)</p>
              <p><span className="font-medium">Alone:</span> No social interaction or materials available</p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => onShowNew(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                <Save className="w-4 h-4 mr-1" /> Record Session #{nextSessionNum}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Response Rate by Condition (multi-element design)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="session" label={{ value: "Session", position: "insideBottom", offset: -5, fontSize: 12 }} tick={{ fontSize: 12 }} />
                <YAxis label={{ value: "Responses/min", angle: -90, position: "insideLeft", fontSize: 12 }} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {conditions.map(c => (
                  <Line key={c} type="monotone" dataKey={c} name={c}
                    stroke={CONDITION_COLORS[c] || "#6b7280"}
                    strokeWidth={2} dot={{ r: 4 }}
                    connectNulls={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {sessions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Session Log</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">#</th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Condition</th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Date</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Duration</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Responses</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Rate/min</th>
                  <th className="py-2 px-1 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-2 text-gray-600">{s.sessionNumber}</td>
                    <td className="py-2 px-2">
                      <span className="capitalize font-medium" style={{ color: CONDITION_COLORS[s.condition] || "#6b7280" }}>
                        {s.condition}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-gray-600">{s.sessionDate}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{s.durationMinutes}m</td>
                    <td className="py-2 px-2 text-right font-medium text-gray-900">{s.responseCount}</td>
                    <td className="py-2 px-2 text-right font-medium text-gray-900">
                      {s.responseRate ? parseFloat(s.responseRate).toFixed(2) : "—"}
                    </td>
                    <td className="py-2 px-1">
                      <button onClick={() => handleDelete(s.id)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {sessions.length === 0 && !showNew && (
        <EmptyState icon={BarChart3} message="No FA sessions yet. Record condition sessions to build a multi-element graph." />
      )}
    </div>
  );
}

function BipPanel({ student, bips, selectedBip, editingBip, selectedFba, onSelectBip, onEdit, onRefresh }: {
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
    // Version siblings are identified by the explicit versionGroupId lineage chain.
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
      await authFetch(`/api/bip-implementers/${implId}`, { method: "DELETE" });
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
      await authFetch(`/api/bip-fidelity-logs/${logId}`, { method: "DELETE" });
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
                  <ChevronRight className="w-4 h-4 text-gray-400" />
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-600" /> Prevention Strategies
                    </h3>
                    <BipSection field="preventionStrategies" value={currentBip.preventionStrategies || ""}
                      editing={editingBip} onEdit={onEdit} multiline />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-emerald-600" /> Teaching Strategies
                    </h3>
                    <BipSection field="teachingStrategies" value={currentBip.teachingStrategies || ""}
                      editing={editingBip} onEdit={onEdit} multiline />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-gray-600" /> Consequence Strategies
                    </h3>
                    <BipSection field="consequenceStrategies" value={currentBip.consequenceStrategies || ""}
                      editing={editingBip} onEdit={onEdit} multiline />
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-2">Reinforcement Schedule</h3>
                  <BipSection field="reinforcementSchedule" value={currentBip.reinforcementSchedule || ""}
                    editing={editingBip} onEdit={onEdit} multiline />
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Crisis Plan
                  </h3>
                  <BipSection field="crisisPlan" value={currentBip.crisisPlan || ""}
                    editing={editingBip} onEdit={onEdit} multiline />
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

function BipSection({ title, field, value, editing, onEdit, multiline }: {
  title?: string; field: string; value: string;
  editing: Partial<BipRecord> | null; onEdit: (b: Partial<BipRecord> | null) => void;
  multiline?: boolean;
}) {
  if (editing) {
    const editVal = (editing as any)[field] ?? value;
    if (multiline) {
      return (
        <textarea value={editVal} rows={3}
          onChange={e => onEdit({ ...editing, [field]: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
      );
    }
    return (
      <input value={editVal}
        onChange={e => onEdit({ ...editing, [field]: e.target.value })}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
    );
  }
  return (
    <div>
      {title && <p className="text-xs font-medium text-gray-500 mb-0.5">{title}</p>}
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{value || <span className="text-gray-400 italic">Not specified</span>}</p>
    </div>
  );
}
