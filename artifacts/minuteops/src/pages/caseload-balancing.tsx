import { useState, useEffect, useMemo, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Users, AlertTriangle, CheckCircle, TrendingUp,
  ArrowRight, ChevronDown, ChevronUp, Printer,
  RefreshCw, Settings, UserMinus, UserPlus,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, Legend,
  LineChart, Line,
} from "recharts";

interface ProviderCaseload {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
  title: string | null;
  schoolId: number | null;
  schoolName: string;
  studentCount: number;
  totalServiceMinutes: number;
  serviceCount: number;
  threshold: number;
  utilization: number;
  status: "balanced" | "approaching" | "overloaded";
}

interface RoleSummary {
  count: number;
  totalStudents: number;
  avgStudents: number;
  overloaded: number;
  approaching: number;
  threshold: number;
}

interface Suggestion {
  fromProviderId: number;
  fromProviderName: string;
  fromStudentCount: number;
  toProviderId: number;
  toProviderName: string;
  toStudentCount: number;
  role: string;
  sameSchool: boolean;
  studentsToMove: number;
}

interface ProviderStudent {
  id: number;
  firstName: string;
  lastName: string;
  grade: string | null;
  schoolId: number | null;
  schoolName: string | null;
  assignmentType: string;
}

const STATUS_COLORS = {
  balanced: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", bar: "#10b981" },
  approaching: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", bar: "#f59e0b" },
  overloaded: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", bar: "#ef4444" },
};

const ROLE_LABELS: Record<string, string> = {
  bcba: "BCBA",
  provider: "Provider",
  sped_teacher: "SPED Teacher",
  para: "Paraprofessional",
  case_manager: "Case Manager",
  coordinator: "Coordinator",
  teacher: "Teacher",
  admin: "Admin",
};

export default function CaseloadBalancingPage() {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ProviderCaseload[]>([]);
  const [roleSummary, setRoleSummary] = useState<Record<string, RoleSummary>>({});
  const [totals, setTotals] = useState({ totalProviders: 0, overloaded: 0, approaching: 0, balanced: 0 });
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedProvider, setSelectedProvider] = useState<ProviderCaseload | null>(null);
  const [providerStudents, setProviderStudents] = useState<ProviderStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  const [thresholdDialog, setThresholdDialog] = useState(false);
  const [editThresholds, setEditThresholds] = useState<Record<string, number>>({});
  const [customThresholds, setCustomThresholds] = useState<Record<string, number> | null>(null);

  const [trendData, setTrendData] = useState<Record<string, Array<{ month: string; studentCount: number; providerCount: number; avgPerProvider: number }>>>({});
  const [trendLoading, setTrendLoading] = useState(false);
  const [showTrend, setShowTrend] = useState(false);

  const [reassignDialog, setReassignDialog] = useState<{ student: ProviderStudent; fromProvider: ProviderCaseload } | null>(null);
  const [reassignTarget, setReassignTarget] = useState("");
  const [reassigning, setReassigning] = useState(false);

  const buildThresholdParam = useCallback((t: Record<string, number> | null) => {
    if (!t) return "";
    return `?thresholds=${encodeURIComponent(JSON.stringify(t))}`;
  }, []);

  const fetchData = useCallback(async (t?: Record<string, number> | null) => {
    setLoading(true);
    try {
      const param = buildThresholdParam(t ?? customThresholds);
      const res = await authFetch(`/api/caseload-balancing/summary${param}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProviders(data.providers);
      setRoleSummary(data.roleSummary);
      setTotals(data.totals);
      setThresholds(data.thresholds);
    } catch {
      toast.error("Failed to load caseload data");
    } finally {
      setLoading(false);
    }
  }, [customThresholds, buildThresholdParam]);

  const fetchSuggestions = useCallback(async (t?: Record<string, number> | null) => {
    setSuggestionsLoading(true);
    try {
      const param = buildThresholdParam(t ?? customThresholds);
      const res = await authFetch(`/api/caseload-balancing/suggestions${param}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSuggestions(data.suggestions);
    } catch {
      toast.error("Failed to load suggestions");
    } finally {
      setSuggestionsLoading(false);
    }
  }, [customThresholds, buildThresholdParam]);

  const fetchTrends = useCallback(async () => {
    setTrendLoading(true);
    try {
      const res = await authFetch("/api/caseload-balancing/trends?months=6");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTrendData(data.trends || {});
    } catch {
      toast.error("Failed to load trend data");
    } finally {
      setTrendLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); fetchSuggestions(); }, [fetchData, fetchSuggestions]);

  const fetchProviderStudents = async (provider: ProviderCaseload) => {
    setSelectedProvider(provider);
    setStudentsLoading(true);
    try {
      const res = await authFetch(`/api/caseload-balancing/provider/${provider.id}/students`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProviderStudents(data.students);
    } catch {
      toast.error("Failed to load provider students");
    } finally {
      setStudentsLoading(false);
    }
  };

  const handleReassign = async () => {
    if (!reassignDialog || !reassignTarget) return;
    setReassigning(true);
    try {
      const res = await authFetch("/api/caseload-balancing/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: reassignDialog.student.id,
          fromProviderId: reassignDialog.fromProvider.id,
          toProviderId: parseInt(reassignTarget, 10),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Reassignment failed");
        return;
      }
      toast.success("Student reassigned successfully");
      setReassignDialog(null);
      setReassignTarget("");
      fetchData();
      fetchSuggestions();
      if (selectedProvider) fetchProviderStudents(selectedProvider);
    } catch {
      toast.error("Reassignment failed");
    } finally {
      setReassigning(false);
    }
  };

  const filteredProviders = useMemo(() => {
    return providers.filter(p => {
      if (filterRole !== "all" && p.role !== filterRole) return false;
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          p.schoolName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [providers, filterRole, filterStatus, searchQuery]);

  const chartData = useMemo(() => {
    return filteredProviders.slice(0, 25).map(p => ({
      name: `${p.firstName} ${p.lastName.charAt(0)}.`,
      students: p.studentCount,
      threshold: p.threshold,
      status: p.status,
      fullName: `${p.firstName} ${p.lastName}`,
      role: p.role,
    }));
  }, [filteredProviders]);

  const availableRoles = useMemo(() => {
    const roles = new Set(providers.map(p => p.role));
    return Array.from(roles).sort();
  }, [providers]);

  const eligibleTargets = useMemo(() => {
    if (!reassignDialog) return [];
    return providers.filter(p =>
      p.id !== reassignDialog.fromProvider.id &&
      p.role === reassignDialog.fromProvider.role &&
      p.status !== "overloaded"
    ).sort((a, b) => a.utilization - b.utilization);
  }, [reassignDialog, providers]);

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 print:p-2">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Caseload Balancing</h1>
          <p className="text-sm text-gray-500 mt-1">Visualize provider workloads and rebalance caseloads</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => { setEditThresholds({ ...thresholds }); setThresholdDialog(true); }}>
            <Settings className="w-4 h-4 mr-1" /> Thresholds
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => { fetchData(); fetchSuggestions(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total Providers</p>
                <p className="text-2xl font-bold mt-1">{totals.totalProviders}</p>
              </div>
              <Users className="w-8 h-8 text-gray-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-600 uppercase tracking-wide">Overloaded</p>
                <p className="text-2xl font-bold text-red-700 mt-1">{totals.overloaded}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-600 uppercase tracking-wide">Approaching</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{totals.approaching}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-amber-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-600 uppercase tracking-wide">Balanced</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{totals.balanced}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-emerald-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 print:hidden">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search providers or schools..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {availableRoles.map(r => (
              <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="overloaded">Overloaded</SelectItem>
            <SelectItem value="approaching">Approaching</SelectItem>
            <SelectItem value="balanced">Balanced</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Caseload Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 32)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
                        <p className="font-medium">{d.fullName}</p>
                        <p className="text-gray-500">{ROLE_LABELS[d.role] || d.role}</p>
                        <p className="mt-1">Students: <span className="font-medium">{d.students}</span></p>
                        <p>Threshold: <span className="font-medium">{d.threshold}</span></p>
                      </div>
                    );
                  }}
                />
                <Legend />
                <ReferenceLine x={0} stroke="#e5e7eb" />
                <Bar dataKey="students" name="Students" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={STATUS_COLORS[entry.status].bar} />
                  ))}
                </Bar>
                <Bar dataKey="threshold" name="Threshold" fill="none" stroke="#9ca3af" strokeDasharray="4 4" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Caseload Trends
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { if (!showTrend) fetchTrends(); setShowTrend(!showTrend); }}
            >
              {showTrend ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
              {showTrend ? "Hide" : "Show"} Trends
            </Button>
          </CardTitle>
        </CardHeader>
        {showTrend && (
          <CardContent>
            {trendLoading ? (
              <Skeleton className="h-64" />
            ) : Object.keys(trendData).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No trend data available yet</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(trendData).map(([role, data]) => (
                  <div key={role}>
                    <p className="text-sm font-medium mb-2">{ROLE_LABELS[role] || role}</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={data} margin={{ left: 0, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.[0]) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-white border rounded-lg shadow-lg p-2 text-xs">
                                <p className="font-medium">{d.month}</p>
                                <p>Total Students: {d.studentCount}</p>
                                <p>Providers: {d.providerCount}</p>
                                <p>Avg per Provider: {d.avgPerProvider}</p>
                              </div>
                            );
                          }}
                        />
                        <Line type="monotone" dataKey="avgPerProvider" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Avg per Provider" />
                        <Line type="monotone" dataKey="studentCount" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Total Students" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {Object.keys(roleSummary).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Summary by Role</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Object.entries(roleSummary).map(([role, summary]) => (
                <div key={role} className="p-3 bg-gray-50 rounded-lg border">
                  <p className="font-medium text-sm">{ROLE_LABELS[role] || role}</p>
                  <div className="mt-2 space-y-1 text-xs text-gray-600">
                    <div className="flex justify-between"><span>Providers</span><span className="font-medium">{summary.count}</span></div>
                    <div className="flex justify-between"><span>Avg Students</span><span className="font-medium">{summary.avgStudents}</span></div>
                    <div className="flex justify-between"><span>Threshold</span><span className="font-medium">{summary.threshold}</span></div>
                    {summary.overloaded > 0 && (
                      <div className="flex justify-between text-red-600"><span>Overloaded</span><span className="font-medium">{summary.overloaded}</span></div>
                    )}
                    {summary.approaching > 0 && (
                      <div className="flex justify-between text-amber-600"><span>Approaching</span><span className="font-medium">{summary.approaching}</span></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Provider Caseloads ({filteredProviders.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {filteredProviders.map(p => {
                  const colors = STATUS_COLORS[p.status];
                  return (
                    <div
                      key={p.id}
                      className={`p-4 hover:bg-gray-50/50 cursor-pointer transition-colors ${selectedProvider?.id === p.id ? "bg-emerald-50/50 border-l-2 border-l-emerald-500" : ""}`}
                      onClick={() => fetchProviderStudents(p)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${p.status === "overloaded" ? "bg-red-500" : p.status === "approaching" ? "bg-amber-500" : "bg-emerald-500"}`} />
                          <div>
                            <p className="font-medium text-sm">{p.firstName} {p.lastName}</p>
                            <p className="text-xs text-gray-500">{ROLE_LABELS[p.role] || p.role} — {p.schoolName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-medium">{p.studentCount} <span className="text-gray-400 font-normal">/ {p.threshold}</span></p>
                            <p className="text-xs text-gray-400">{p.utilization}% utilized</p>
                          </div>
                          <Badge variant="outline" className={`${colors.bg} ${colors.border} ${colors.text} text-xs`}>
                            {p.status === "overloaded" ? "Over" : p.status === "approaching" ? "Near" : "OK"}
                          </Badge>
                        </div>
                      </div>
                      {p.totalServiceMinutes > 0 && (
                        <p className="text-xs text-gray-400 mt-1 ml-5">{p.serviceCount} services — {p.totalServiceMinutes.toLocaleString()} min/month</p>
                      )}
                    </div>
                  );
                })}
                {filteredProviders.length === 0 && (
                  <div className="p-8 text-center text-gray-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No providers match your filters</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          {selectedProvider ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{selectedProvider.firstName} {selectedProvider.lastName}</span>
                  <Badge variant="outline" className={`${STATUS_COLORS[selectedProvider.status].bg} ${STATUS_COLORS[selectedProvider.status].text} text-xs`}>
                    {selectedProvider.studentCount}/{selectedProvider.threshold}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-gray-500">{ROLE_LABELS[selectedProvider.role] || selectedProvider.role} — {selectedProvider.schoolName}</p>
              </CardHeader>
              <CardContent>
                {studentsLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
                ) : providerStudents.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No students assigned</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {providerStudents.map(s => (
                      <div key={s.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                        <div>
                          <p className="font-medium">{s.firstName} {s.lastName}</p>
                          <p className="text-xs text-gray-400">{s.grade ? `Grade ${s.grade}` : ""} {s.schoolName ? `— ${s.schoolName}` : ""}</p>
                        </div>
                        {selectedProvider.status !== "balanced" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-gray-400 hover:text-emerald-600"
                            onClick={(e) => { e.stopPropagation(); setReassignDialog({ student: s, fromProvider: selectedProvider }); }}
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-400">
                <UserMinus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select a provider to view their caseload</p>
              </CardContent>
            </Card>
          )}

          {suggestions.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Rebalancing Suggestions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg border text-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-red-600">{s.fromProviderName}</span>
                        <span className="text-gray-400">({s.fromStudentCount})</span>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                        <span className="font-medium text-emerald-600">{s.toProviderName}</span>
                        <span className="text-gray-400">({s.toStudentCount})</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="outline" className="text-xs">{ROLE_LABELS[s.role] || s.role}</Badge>
                        <span className="text-xs text-gray-500">Move ~{s.studentsToMove} student{s.studentsToMove > 1 ? "s" : ""}</span>
                        {s.sameSchool && <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">Same School</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={thresholdDialog} onOpenChange={setThresholdDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Caseload Thresholds</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Set the maximum number of students per provider for each role.</p>
            {Object.entries(editThresholds).map(([role, value]) => (
              <div key={role} className="flex items-center gap-3">
                <Label className="w-32 text-sm">{ROLE_LABELS[role] || role}</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={value}
                  onChange={e => setEditThresholds(t => ({ ...t, [role]: parseInt(e.target.value, 10) || 1 }))}
                  className="w-24"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThresholdDialog(false)}>Cancel</Button>
            <Button onClick={() => { setCustomThresholds(editThresholds); setThresholds(editThresholds); setThresholdDialog(false); fetchData(editThresholds); fetchSuggestions(editThresholds); }}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reassignDialog} onOpenChange={(open) => { if (!open) { setReassignDialog(null); setReassignTarget(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Student</DialogTitle>
          </DialogHeader>
          {reassignDialog && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium">{reassignDialog.student.firstName} {reassignDialog.student.lastName}</p>
                <p className="text-xs text-gray-500">{reassignDialog.student.grade ? `Grade ${reassignDialog.student.grade}` : "No grade"}</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">From:</span>
                <span className="font-medium">{reassignDialog.fromProvider.firstName} {reassignDialog.fromProvider.lastName}</span>
                <Badge variant="outline" className="text-xs bg-red-50 text-red-600">
                  {reassignDialog.fromProvider.studentCount}/{reassignDialog.fromProvider.threshold}
                </Badge>
              </div>
              <div>
                <Label className="text-sm">Reassign to:</Label>
                <Select value={reassignTarget} onValueChange={setReassignTarget}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {eligibleTargets.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.firstName} {t.lastName} ({t.studentCount}/{t.threshold}) — {t.schoolName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReassignDialog(null); setReassignTarget(""); }}>Cancel</Button>
            <Button onClick={handleReassign} disabled={!reassignTarget || reassigning}>
              {reassigning ? "Reassigning..." : "Confirm Reassignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
