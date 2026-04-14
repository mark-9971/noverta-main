import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Gift, Plus, Clock, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, X, Calculator, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useSchoolContext } from "@/lib/school-context";
import { listCompensatoryObligations, getCompensatoryObligation, updateCompensatoryObligation, calculateShortfalls, generateFromShortfalls, createCompensatoryObligation, logCompensatorySession, listStudents, listServiceRequirements } from "@workspace/api-client-react";

type Obligation = {
  id: number;
  studentId: number;
  studentName: string | null;
  serviceRequirementId: number | null;
  serviceTypeName: string | null;
  periodStart: string;
  periodEnd: string;
  minutesOwed: number;
  minutesDelivered: number;
  minutesRemaining: number;
  status: string;
  notes: string | null;
  agreedDate: string | null;
  agreedWith: string | null;
  source: string;
  createdAt: string;
};

type Shortfall = {
  serviceRequirementId: number;
  studentId: number;
  studentName: string | null;
  serviceTypeName: string | null;
  requiredMinutes: number;
  deliveredMinutes: number;
  deficitMinutes: number;
  periodStart: string;
  periodEnd: string;
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: any }> = {
  pending: { label: "Pending", bg: "bg-gray-100", color: "text-gray-700", icon: Clock },
  in_progress: { label: "In Progress", bg: "bg-emerald-50", color: "text-emerald-700", icon: ArrowRight },
  completed: { label: "Completed", bg: "bg-emerald-100", color: "text-emerald-800", icon: CheckCircle },
  waived: { label: "Waived", bg: "bg-gray-50", color: "text-gray-500", icon: X },
};

export default function CompensatoryServices() {
  const { selectedSchoolId } = useSchoolContext();
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [shortfalls, setShortfalls] = useState<Shortfall[]>([]);
  const [calcLoading, setCalcLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<any>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [showLogSession, setShowLogSession] = useState<number | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [serviceRequirements, setServiceRequirements] = useState<any[]>([]);

  function fetchObligations() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (selectedSchoolId) params.set("schoolId", String(selectedSchoolId));
    listCompensatoryObligations(Object.fromEntries(new URLSearchParams(params)) as any).catch(() => []).then(setObligations as any)
      .catch(() => setObligations([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchObligations(); }, [statusFilter, selectedSchoolId]);

  useEffect(() => {
    listStudents({ limit: 200 } as any).catch(() => []).then(setStudents as any).catch(() => {});
    listServiceRequirements({ active: true } as any).catch(() => []).then(setServiceRequirements as any).catch(() => {});
  }, []);

  const totalOwed = obligations.reduce((s, o) => s + o.minutesOwed, 0);
  const totalDelivered = obligations.reduce((s, o) => s + o.minutesDelivered, 0);
  const totalRemaining = obligations.reduce((s, o) => s + o.minutesRemaining, 0);
  const pendingCount = obligations.filter(o => o.status === "pending" || o.status === "in_progress").length;

  async function toggleExpanded(id: number) {
    if (expandedId === id) { setExpandedId(null); setExpandedDetail(null); return; }
    setExpandedId(id);
    setExpandedLoading(true);
    try {
      const detail = await getCompensatoryObligation(id);
      setExpandedDetail(detail);
    } catch { setExpandedDetail(null); }
    setExpandedLoading(false);
  }

  async function updateStatus(id: number, status: string) {
    try {
      await updateCompensatoryObligation(id, { status } as any);
      toast.success(`Status updated to ${status}`);
      fetchObligations();
      if (expandedId === id) {
        const detail = await getCompensatoryObligation(id);
        setExpandedDetail(detail);
      }
    } catch {
      toast.error("Failed to update status");
    }
  }

  async function runCalculateShortfalls(periodStart: string, periodEnd: string) {
    setCalcLoading(true);
    try {
      const data = await calculateShortfalls({ periodStart, periodEnd, schoolId: selectedSchoolId || undefined } as any);
      setShortfalls(data);
      if (data.length === 0) toast.info("No shortfalls found for this period");
    } catch { toast.error("Error calculating shortfalls"); }
    setCalcLoading(false);
  }

  async function generateObligations(selected: Shortfall[]) {
    try {
      const created = await generateFromShortfalls({ shortfalls: selected } as any);
      toast.success(`Created ${created.length} compensatory obligation(s)`);
      setShortfalls([]);
      setShowCalculator(false);
      fetchObligations();
    } catch {
      toast.error("Failed to generate obligations");
    }
  }

  function formatDate(d: string) {
    if (!d) return "\u2014";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Gift className="w-6 h-6 text-emerald-600" />
            Compensatory Services
          </h1>
          <p className="text-sm text-gray-400 mt-1">Track and manage owed compensatory minutes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCalculator(!showCalculator)} className="gap-1.5">
            <Calculator className="w-4 h-4" /> Calculate Shortfalls
          </Button>
          <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="w-4 h-4" /> Add Obligation
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-gray-800">{totalOwed}</p>
            <p className="text-[11px] text-gray-400">Total Minutes Owed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-emerald-700">{totalDelivered}</p>
            <p className="text-[11px] text-gray-400">Minutes Delivered</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-gray-800">{totalRemaining}</p>
            <p className="text-[11px] text-gray-400">Minutes Remaining</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-gray-800">{pendingCount}</p>
            <p className="text-[11px] text-gray-400">Active Obligations</p>
          </CardContent>
        </Card>
      </div>

      {showCalculator && (
        <ShortfallCalculator
          onClose={() => { setShowCalculator(false); setShortfalls([]); }}
          onCalculate={runCalculateShortfalls}
          shortfalls={shortfalls}
          loading={calcLoading}
          onGenerate={generateObligations}
          formatDate={formatDate}
        />
      )}

      {showCreateForm && (
        <CreateObligationForm
          students={students}
          serviceRequirements={serviceRequirements}
          onClose={() => setShowCreateForm(false)}
          onCreated={() => { setShowCreateForm(false); fetchObligations(); }}
        />
      )}

      <div className="flex gap-2 flex-wrap">
        {["all", "pending", "in_progress", "completed", "waived"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s === "all" ? "All" : (STATUS_CONFIG[s]?.label || s)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="w-full h-20" />)}</div>
      ) : obligations.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Gift className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No compensatory obligations found</p>
            <p className="text-gray-400 text-sm mt-1">Use the calculator to identify shortfalls or add obligations manually</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {obligations.map(ob => {
            const cfg = STATUS_CONFIG[ob.status] || STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            const pct = ob.minutesOwed > 0 ? Math.round((ob.minutesDelivered / ob.minutesOwed) * 100) : 0;
            const isExpanded = expandedId === ob.id;

            return (
              <Card key={ob.id} className="overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onClick={() => toggleExpanded(ob.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cfg.bg}`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/students/${ob.studentId}`} onClick={(e: any) => e.stopPropagation()} className="text-sm font-semibold text-gray-800 hover:text-emerald-700">
                          {ob.studentName || `Student #${ob.studentId}`}
                        </Link>
                        {ob.serviceTypeName && (
                          <span className="text-xs text-gray-400">{ob.serviceTypeName}</span>
                        )}
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(ob.periodStart)} - {formatDate(ob.periodEnd)}
                        {ob.source === "auto_calculated" && " · Auto-generated"}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-800">{ob.minutesRemaining} <span className="text-xs font-normal text-gray-400">min remaining</span></p>
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{ob.minutesDelivered}/{ob.minutesOwed} delivered</p>
                    </div>
                    <div className="flex-shrink-0">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50/30 space-y-4">
                    {expandedLoading ? (
                      <Skeleton className="w-full h-32" />
                    ) : expandedDetail ? (
                      <>
                        {expandedDetail.notes && (
                          <p className="text-xs text-gray-500 bg-white p-3 rounded-lg border border-gray-100">{expandedDetail.notes}</p>
                        )}
                        {(expandedDetail.agreedDate || expandedDetail.agreedWith) && (
                          <div className="flex gap-4 text-xs text-gray-500">
                            {expandedDetail.agreedDate && <span>Agreed: {formatDate(expandedDetail.agreedDate)}</span>}
                            {expandedDetail.agreedWith && <span>With: {expandedDetail.agreedWith}</span>}
                          </div>
                        )}

                        <div className="flex gap-2 flex-wrap">
                          {ob.status !== "completed" && ob.status !== "waived" && (
                            <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setShowLogSession(ob.id)}>
                              <Plus className="w-3 h-3" /> Log Comp Session
                            </Button>
                          )}
                          {ob.status === "pending" && (
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => updateStatus(ob.id, "in_progress")}>
                              Mark In Progress
                            </Button>
                          )}
                          {ob.status !== "waived" && ob.status !== "completed" && (
                            <Button size="sm" variant="outline" className="text-xs text-gray-400" onClick={() => updateStatus(ob.id, "waived")}>
                              Waive
                            </Button>
                          )}
                        </div>

                        {showLogSession === ob.id && (
                          <LogCompSessionForm
                            obligationId={ob.id}
                            onClose={() => setShowLogSession(null)}
                            onLogged={() => {
                              setShowLogSession(null);
                              fetchObligations();
                              toggleExpanded(ob.id);
                              setTimeout(() => toggleExpanded(ob.id), 100);
                            }}
                          />
                        )}

                        {expandedDetail.sessions && expandedDetail.sessions.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-2">Comp Sessions Logged</p>
                            <div className="space-y-1">
                              {expandedDetail.sessions.map((sess: any) => (
                                <div key={sess.id} className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-gray-100">
                                  <div>
                                    <span className="font-medium text-gray-700">{formatDate(sess.sessionDate)}</span>
                                    {sess.staffName && <span className="text-gray-400 ml-2">{sess.staffName}</span>}
                                    {sess.serviceTypeName && <span className="text-gray-400 ml-2">· {sess.serviceTypeName}</span>}
                                  </div>
                                  <span className="font-bold text-emerald-700">{sess.durationMinutes} min</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Failed to load details</p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShortfallCalculator({ onClose, onCalculate, shortfalls, loading, onGenerate, formatDate }: {
  onClose: () => void;
  onCalculate: (start: string, end: string) => void;
  shortfalls: Shortfall[];
  loading: boolean;
  onGenerate: (selected: Shortfall[]) => void;
  formatDate: (d: string) => string;
}) {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthStart = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthEnd = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-${String(lastMonth.getDate()).padStart(2, "0")}`;

  const [periodStart, setPeriodStart] = useState(lastMonthStart);
  const [periodEnd, setPeriodEnd] = useState(lastMonthEnd);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  function toggleSelection(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === shortfalls.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(shortfalls.map((_, i) => i)));
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-600" />
            Calculate Shortfalls
          </CardTitle>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Period Start</label>
            <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="text-sm w-40" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Period End</label>
            <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="text-sm w-40" />
          </div>
          <Button size="sm" disabled={loading} onClick={() => onCalculate(periodStart, periodEnd)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? "Calculating..." : "Calculate"}
          </Button>
        </div>

        {shortfalls.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500">{shortfalls.length} shortfall(s) found</p>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-emerald-600 hover:text-emerald-700">
                  {selectedIds.size === shortfalls.length ? "Deselect All" : "Select All"}
                </button>
                {selectedIds.size > 0 && (
                  <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                    const selected = shortfalls.filter((_, i) => selectedIds.has(i));
                    onGenerate(selected);
                  }}>
                    Generate {selectedIds.size} Obligation(s)
                  </Button>
                )}
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {shortfalls.map((sf, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    selectedIds.has(idx) ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-100 hover:bg-gray-50"
                  }`}
                  onClick={() => toggleSelection(idx)}
                >
                  <input type="checkbox" checked={selectedIds.has(idx)} readOnly className="accent-emerald-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700">{sf.studentName}</p>
                    <p className="text-[10px] text-gray-400">{sf.serviceTypeName}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-red-600">{sf.deficitMinutes} min deficit</p>
                    <p className="text-[10px] text-gray-400">{sf.deliveredMinutes}/{sf.requiredMinutes} delivered</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateObligationForm({ students, serviceRequirements, onClose, onCreated }: {
  students: any[];
  serviceRequirements: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [serviceRequirementId, setServiceRequirementId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [minutesOwed, setMinutesOwed] = useState("");
  const [agreedDate, setAgreedDate] = useState("");
  const [agreedWith, setAgreedWith] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId || !periodStart || !periodEnd || !minutesOwed) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSubmitting(true);
    try {
      await createCompensatoryObligation({
          studentId: Number(studentId),
          serviceRequirementId: serviceRequirementId ? Number(serviceRequirementId) : null,
          periodStart,
          periodEnd,
          minutesOwed: Number(minutesOwed),
          agreedDate: agreedDate || null,
          agreedWith: agreedWith || null,
          notes: notes || null,
        } as any);
      toast.success("Compensatory obligation created");
      onCreated();
    } catch {
      toast.error("Failed to create obligation");
    }
    setSubmitting(false);
  }

  const filteredSRs = studentId
    ? serviceRequirements.filter((sr: any) => sr.studentId === Number(studentId))
    : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600">New Compensatory Obligation</CardTitle>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Student *</label>
            <select value={studentId} onChange={e => setStudentId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Select student...</option>
              {students.map((s: any) => (
                <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Service Requirement</label>
            <select value={serviceRequirementId} onChange={e => setServiceRequirementId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Optional...</option>
              {filteredSRs.map((sr: any) => (
                <option key={sr.id} value={sr.id}>{sr.serviceTypeName || `Req #${sr.id}`} ({sr.requiredMinutes} min/{sr.intervalType})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Period Start *</label>
            <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Period End *</label>
            <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Minutes Owed *</label>
            <Input type="number" value={minutesOwed} onChange={e => setMinutesOwed(e.target.value)} className="text-sm" min={1} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Agreed Date</label>
            <Input type="date" value={agreedDate} onChange={e => setAgreedDate(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Agreed With</label>
            <Input type="text" value={agreedWith} onChange={e => setAgreedWith(e.target.value)} placeholder="Parent/guardian name" className="text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Notes</label>
            <Input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional context..." className="text-sm" />
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitting ? "Creating..." : "Create Obligation"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function LogCompSessionForm({ obligationId, onClose, onLogged }: {
  obligationId: number;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().substring(0, 10));
  const [durationMinutes, setDurationMinutes] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionDate || !durationMinutes) {
      toast.error("Date and duration are required");
      return;
    }
    setSubmitting(true);
    try {
      await logCompensatorySession(obligationId, {
          sessionDate,
          durationMinutes: Number(durationMinutes),
          startTime: startTime || null,
          endTime: endTime || null,
          notes: notes || null,
        } as any);
      toast.success("Comp session logged");
      onLogged();
    } catch {
      toast.error("Failed to log session");
    }
    setSubmitting(false);
  }

  return (
    <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-3">
      <p className="text-xs font-semibold text-gray-600">Log Compensatory Session</p>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Date *</label>
          <Input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} className="text-xs h-8" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Duration (min) *</label>
          <Input type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} className="text-xs h-8" min={1} />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Start Time</label>
          <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="text-xs h-8" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">End Time</label>
          <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="text-xs h-8" />
        </div>
        <div className="col-span-2 md:col-span-4">
          <Input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes..." className="text-xs h-8" />
        </div>
        <div className="col-span-2 md:col-span-4 flex gap-2 justify-end">
          <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={submitting} className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white">
            {submitting ? "Logging..." : "Log Session"}
          </Button>
        </div>
      </form>
    </div>
  );
}
