import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DollarSign, Users, TrendingUp, Clock, Download, Settings,
  ChevronDown, ChevronRight, ExternalLink, ArrowUpDown, Building2,
  UserCircle, Briefcase, X, Plus, Percent
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell
} from "recharts";
import { Link } from "wouter";
import { toast } from "sonner";

interface OverviewData {
  totalMinutesOwed: number;
  totalMinutesDelivered: number;
  totalDollarsOwed: number;
  totalDollarsDelivered: number;
  studentsAffected: number;
  obligationCount: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  byServiceType: Array<{ serviceTypeId: number; name: string; minutesOwed: number; minutesDelivered: number; dollarsOwed: number; dollarsDelivered: number; count: number }>;
  bySchool: Array<{ schoolId: number; name: string; minutesOwed: number; dollarsOwed: number; count: number }>;
  byProvider: Array<{ providerId: number; name: string; minutesOwed: number; dollarsOwed: number; count: number }>;
}

interface StudentBalance {
  studentId: number;
  studentName: string;
  schoolName: string;
  totalMinutesOwed: number;
  totalMinutesDelivered: number;
  totalDollarsOwed: number;
  totalDollarsDelivered: number;
  remainingDollars: number;
  pctDelivered: number;
  obligationCount: number;
  pendingCount: number;
  services: Array<{ serviceTypeId: number; name: string; minutesOwed: number; minutesDelivered: number; dollarsOwed: number }>;
}

interface BurndownPoint {
  month: string;
  accruedMinutes: number;
  deliveredMinutes: number;
  accruedDollars: number;
  deliveredDollars: number;
  cumulativeOwed: number;
  cumulativeOwedDollars: number;
}

interface RateConfig {
  id: number;
  serviceTypeId: number;
  serviceTypeName: string;
  inHouseRate: string | null;
  contractedRate: string | null;
  effectiveDate: string;
  notes: string | null;
  defaultRate: string | null;
}

interface RatesResponse {
  configs: RateConfig[];
  serviceTypes: Array<{ id: number; name: string; defaultBillingRate: string | null }>;
}

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function formatDollars(val: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function formatMinutesAsHours(minutes: number): string {
  const hours = Math.round(minutes / 60 * 10) / 10;
  return `${hours}h`;
}

export default function CompensatoryFinancePage() {
  const [activeTab, setActiveTab] = useState<"overview" | "students" | "rates">("overview");
  const [showRateForm, setShowRateForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: overview, isLoading: loadingOverview } = useQuery<OverviewData>({
    queryKey: ["compensatory-finance-overview"],
    queryFn: () => authFetch("/api/compensatory-finance/overview").then(r => {
      if (!r.ok) throw new Error("Failed to load overview");
      return r.json();
    }),
  });

  const { data: students, isLoading: loadingStudents } = useQuery<StudentBalance[]>({
    queryKey: ["compensatory-finance-students"],
    queryFn: () => authFetch("/api/compensatory-finance/students").then(r => {
      if (!r.ok) throw new Error("Failed to load students");
      return r.json();
    }),
    enabled: activeTab === "students" || activeTab === "overview",
  });

  const { data: burndown, isLoading: loadingBurndown } = useQuery<BurndownPoint[]>({
    queryKey: ["compensatory-finance-burndown"],
    queryFn: () => authFetch("/api/compensatory-finance/burndown").then(r => {
      if (!r.ok) throw new Error("Failed to load burndown");
      return r.json();
    }),
  });

  const { data: ratesData, isLoading: loadingRates } = useQuery<RatesResponse>({
    queryKey: ["compensatory-finance-rates"],
    queryFn: () => authFetch("/api/compensatory-finance/rates").then(r => {
      if (!r.ok) throw new Error("Failed to load rates");
      return r.json();
    }),
    enabled: activeTab === "rates",
  });

  const handleExport = async () => {
    try {
      const res = await authFetch("/api/compensatory-finance/export.csv");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compensatory-obligations-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch {
      toast.error("Export failed");
    }
  };

  const totalRemaining = overview ? overview.totalDollarsOwed - overview.totalDollarsDelivered : 0;
  const pctDelivered = overview && overview.totalDollarsOwed > 0 ? Math.round((overview.totalDollarsDelivered / overview.totalDollarsOwed) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compensatory Services Financial Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">Track dollar-value exposure for compensatory service obligations</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {loadingOverview ? (
        <Skeleton className="h-32 w-full" />
      ) : overview ? (
        <div className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-100">Total Outstanding Obligation</p>
              <p className="text-4xl font-bold mt-1">{formatDollars(totalRemaining)}</p>
              <p className="text-sm text-blue-200 mt-2">
                {formatDollars(overview.totalDollarsDelivered)} delivered of {formatDollars(overview.totalDollarsOwed)} total ({pctDelivered}% fulfilled)
              </p>
            </div>
            <div className="text-right space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4" />
                <span>{overview.studentsAffected} students affected</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                <span>{formatMinutesAsHours(overview.totalMinutesOwed - overview.totalMinutesDelivered)} remaining</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Briefcase className="h-4 w-4" />
                <span>{overview.pendingCount + overview.inProgressCount} active obligations</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Total Owed" value={formatDollars(overview?.totalDollarsOwed || 0)} loading={loadingOverview} />
        <KpiCard icon={TrendingUp} label="Total Delivered" value={formatDollars(overview?.totalDollarsDelivered || 0)} loading={loadingOverview} />
        <KpiCard icon={Users} label="Students Affected" value={String(overview?.studentsAffected || 0)} loading={loadingOverview} />
        <KpiCard icon={Percent} label="Fulfillment Rate" value={`${pctDelivered}%`} loading={loadingOverview} />
      </div>

      <div className="flex gap-2 border-b">
        {(["overview", "students", "rates"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "overview" ? "Overview" : tab === "students" ? "Student Balances" : "Rate Configuration"}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <OverviewTab overview={overview} burndown={burndown} loadingBurndown={loadingBurndown} />
      )}

      {activeTab === "students" && (
        <StudentBalancesTab students={students || []} loading={loadingStudents} />
      )}

      {activeTab === "rates" && (
        <RateConfigTab
          ratesData={ratesData}
          loading={loadingRates}
          showForm={showRateForm}
          onToggleForm={() => setShowRateForm(!showRateForm)}
          queryClient={queryClient}
        />
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, loading }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <Icon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-xl font-bold">{value}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewTab({ overview, burndown, loadingBurndown }: {
  overview: OverviewData | undefined;
  burndown: BurndownPoint[] | undefined;
  loadingBurndown: boolean;
}) {
  if (!overview) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4" /> By Service Type</CardTitle></CardHeader>
          <CardContent>
            {overview.byServiceType.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No obligations by service type</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={overview.byServiceType} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatDollars(v)} />
                  <Bar dataKey="dollarsOwed" name="Owed" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="dollarsDelivered" name="Delivered" stackId="b" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> By School</CardTitle></CardHeader>
          <CardContent>
            {overview.bySchool.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No obligations by school</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={overview.bySchool} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatDollars(v)} />
                  <Bar dataKey="dollarsOwed" name="Owed" fill="#f59e0b">
                    {overview.bySchool.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Compensatory Burn-Down</CardTitle></CardHeader>
        <CardContent>
          {loadingBurndown ? (
            <Skeleton className="h-64 w-full" />
          ) : !burndown || burndown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No trend data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={burndown} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatDollars(v as number)} />
                <Legend />
                <Line type="monotone" dataKey="accruedDollars" name="Accrued" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="deliveredDollars" name="Delivered" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cumulativeOwedDollars" name="Cumulative Outstanding" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {overview.byProvider.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserCircle className="h-4 w-4" /> By Provider</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y">
              {overview.byProvider.map((p) => (
                <div key={p.providerId} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.count} obligation{p.count !== 1 ? "s" : ""} &middot; {formatMinutesAsHours(p.minutesOwed)}</p>
                  </div>
                  <p className="font-semibold text-sm">{formatDollars(p.dollarsOwed)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StudentBalancesTab({ students, loading }: { students: StudentBalance[]; loading: boolean }) {
  const [sortField, setSortField] = useState<"remainingDollars" | "studentName" | "pctDelivered">("remainingDollars");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const sorted = useMemo(() => {
    const arr = [...students];
    arr.sort((a, b) => {
      const av = sortField === "studentName" ? a.studentName : a[sortField];
      const bv = sortField === "studentName" ? b.studentName : b[sortField];
      if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return arr;
  }, [students, sortField, sortDir]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "studentName" ? "asc" : "desc");
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-muted-foreground">No students with compensatory obligations</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 pr-4">
                  <button onClick={() => toggleSort("studentName")} className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
                    Student <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="pb-2 pr-4 text-muted-foreground font-medium">School</th>
                <th className="pb-2 pr-4">
                  <button onClick={() => toggleSort("remainingDollars")} className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
                    Remaining <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="pb-2 pr-4 text-muted-foreground font-medium">Hours Owed</th>
                <th className="pb-2 pr-4">
                  <button onClick={() => toggleSort("pctDelivered")} className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
                    Fulfilled <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="pb-2 text-muted-foreground font-medium">Obligations</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map(s => (
                <StudentRow
                  key={s.studentId}
                  student={s}
                  expanded={expandedId === s.studentId}
                  onToggle={() => setExpandedId(expandedId === s.studentId ? null : s.studentId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentRow({ student: s, expanded, onToggle }: {
  student: StudentBalance;
  expanded: boolean;
  onToggle: () => void;
}) {
  const remainingMinutes = s.totalMinutesOwed - s.totalMinutesDelivered;

  return (
    <>
      <tr className="hover:bg-muted/50 cursor-pointer" onClick={onToggle}>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <Link href={`/students/${s.studentId}`} onClick={(e: React.MouseEvent) => e.stopPropagation()} className="text-blue-600 hover:underline font-medium">
              {s.studentName}
            </Link>
          </div>
        </td>
        <td className="py-3 pr-4 text-muted-foreground">{s.schoolName}</td>
        <td className="py-3 pr-4 font-semibold">{formatDollars(s.remainingDollars)}</td>
        <td className="py-3 pr-4">{formatMinutesAsHours(remainingMinutes)}</td>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-20 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${s.pctDelivered >= 75 ? "bg-green-500" : s.pctDelivered >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                style={{ width: `${Math.min(s.pctDelivered, 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{s.pctDelivered}%</span>
          </div>
        </td>
        <td className="py-3">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
            {s.pendingCount} active
          </span>
        </td>
      </tr>
      {expanded && s.services.length > 0 && (
        <tr>
          <td colSpan={6} className="pb-3 px-8">
            <div className="bg-muted/30 rounded-lg p-3 mt-1">
              <p className="text-xs font-medium text-muted-foreground mb-2">Service Breakdown</p>
              <div className="space-y-1">
                {s.services.map(svc => (
                  <div key={svc.serviceTypeId} className="flex items-center justify-between text-xs">
                    <span>{svc.name}</span>
                    <span>{formatMinutesAsHours(svc.minutesOwed - svc.minutesDelivered)} remaining &middot; {formatDollars(svc.dollarsOwed)}</span>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function RateConfigTab({ ratesData, loading, showForm, onToggleForm, queryClient }: {
  ratesData: RatesResponse | undefined;
  loading: boolean;
  showForm: boolean;
  onToggleForm: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [formServiceTypeId, setFormServiceTypeId] = useState("");
  const [formInHouseRate, setFormInHouseRate] = useState("");
  const [formContractedRate, setFormContractedRate] = useState("");
  const [formEffectiveDate, setFormEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/compensatory-finance/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceTypeId: Number(formServiceTypeId),
          inHouseRate: formInHouseRate ? Number(formInHouseRate) : null,
          contractedRate: formContractedRate ? Number(formContractedRate) : null,
          effectiveDate: formEffectiveDate,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compensatory-finance-rates"] });
      queryClient.invalidateQueries({ queryKey: ["compensatory-finance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["compensatory-finance-students"] });
      queryClient.invalidateQueries({ queryKey: ["compensatory-finance-burndown"] });
      toast.success("Rate saved");
      onToggleForm();
      setFormServiceTypeId("");
      setFormInHouseRate("");
      setFormContractedRate("");
    },
    onError: () => toast.error("Failed to save rate"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/compensatory-finance/rates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compensatory-finance-rates"] });
      queryClient.invalidateQueries({ queryKey: ["compensatory-finance-overview"] });
      toast.success("Rate deleted");
    },
    onError: () => toast.error("Failed to delete rate"),
  });

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure in-house and contracted rates per service type. These rates are used to calculate dollar values for compensatory obligations.
        </p>
        <Button variant="outline" size="sm" onClick={onToggleForm} className="gap-2">
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Add Rate"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs">Service Type</Label>
                <select
                  value={formServiceTypeId}
                  onChange={e => setFormServiceTypeId(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background"
                >
                  <option value="">Select...</option>
                  {ratesData?.serviceTypes.map(st => (
                    <option key={st.id} value={st.id}>{st.name} {st.defaultBillingRate ? `(default: $${st.defaultBillingRate}/hr)` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">In-House Rate ($/hr)</Label>
                <Input type="number" step="0.01" value={formInHouseRate} onChange={e => setFormInHouseRate(e.target.value)} className="mt-1" placeholder="e.g. 75.00" />
              </div>
              <div>
                <Label className="text-xs">Contracted Rate ($/hr)</Label>
                <Input type="number" step="0.01" value={formContractedRate} onChange={e => setFormContractedRate(e.target.value)} className="mt-1" placeholder="e.g. 125.00" />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Effective Date</Label>
                  <Input type="date" value={formEffectiveDate} onChange={e => setFormEffectiveDate(e.target.value)} className="mt-1" />
                </div>
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={!formServiceTypeId || saveMutation.isPending}
                >
                  Save
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          {!ratesData?.configs.length ? (
            <p className="text-center text-muted-foreground py-8">No custom rates configured. Default service type rates will be used.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">Service Type</th>
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">In-House Rate</th>
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">Contracted Rate</th>
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">Default Rate</th>
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">Effective Date</th>
                  <th className="pb-2 text-muted-foreground font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ratesData.configs.map(c => (
                  <tr key={c.id} className="hover:bg-muted/50">
                    <td className="py-2.5 pr-4 font-medium">{c.serviceTypeName}</td>
                    <td className="py-2.5 pr-4">{c.inHouseRate ? `$${parseFloat(c.inHouseRate).toFixed(2)}/hr` : "-"}</td>
                    <td className="py-2.5 pr-4">{c.contractedRate ? `$${parseFloat(c.contractedRate).toFixed(2)}/hr` : "-"}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{c.defaultRate ? `$${parseFloat(c.defaultRate).toFixed(2)}/hr` : "-"}</td>
                    <td className="py-2.5 pr-4">{c.effectiveDate}</td>
                    <td className="py-2.5">
                      <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(c.id)} disabled={deleteMutation.isPending}>
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
