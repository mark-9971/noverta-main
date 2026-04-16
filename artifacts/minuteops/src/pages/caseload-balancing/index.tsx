import { useState, useEffect, useMemo, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Printer, RefreshCw, Settings } from "lucide-react";
import {
  ProviderCaseload, RoleSummary, Suggestion, ProviderStudent, TrendPoint,
} from "./types";
import { StatsCards } from "./StatsCards";
import { FilterBar } from "./FilterBar";
import { DistributionChart } from "./DistributionChart";
import { TrendsCard } from "./TrendsCard";
import { RoleSummaryCard } from "./RoleSummaryCard";
import { ProviderListPanel } from "./ProviderListPanel";
import { ProviderDetailPanel } from "./ProviderDetailPanel";
import { SuggestionsCard } from "./SuggestionsCard";
import { ThresholdDialog } from "./ThresholdDialog";
import { ReassignDialog } from "./ReassignDialog";

export default function CaseloadBalancingPage() {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ProviderCaseload[]>([]);
  const [roleSummary, setRoleSummary] = useState<Record<string, RoleSummary>>({});
  const [totals, setTotals] = useState({ totalProviders: 0, overloaded: 0, approaching: 0, balanced: 0 });
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [, setSuggestionsLoading] = useState(false);

  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedProvider, setSelectedProvider] = useState<ProviderCaseload | null>(null);
  const [providerStudents, setProviderStudents] = useState<ProviderStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  const [thresholdDialog, setThresholdDialog] = useState(false);
  const [editThresholds, setEditThresholds] = useState<Record<string, number>>({});
  const [customThresholds, setCustomThresholds] = useState<Record<string, number> | null>(null);

  const [trendData, setTrendData] = useState<Record<string, TrendPoint[]>>({});
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

  const filteredProviders = useMemo(() => providers.filter(p => {
    if (filterRole !== "all" && p.role !== filterRole) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        p.schoolName.toLowerCase().includes(q);
    }
    return true;
  }), [providers, filterRole, filterStatus, searchQuery]);

  const chartData = useMemo(() => filteredProviders.slice(0, 25).map(p => ({
    name: `${p.firstName} ${p.lastName.charAt(0)}.`,
    students: p.studentCount,
    threshold: p.threshold,
    status: p.status,
    fullName: `${p.firstName} ${p.lastName}`,
    role: p.role,
  })), [filteredProviders]);

  const availableRoles = useMemo(() => Array.from(new Set(providers.map(p => p.role))).sort(), [providers]);

  const eligibleTargets = useMemo(() => {
    if (!reassignDialog) return [];
    return providers.filter(p =>
      p.id !== reassignDialog.fromProvider.id &&
      p.role === reassignDialog.fromProvider.role &&
      p.status !== "overloaded"
    ).sort((a, b) => a.utilization - b.utilization);
  }, [reassignDialog, providers]);

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
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => { fetchData(); fetchSuggestions(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <StatsCards totals={totals} />

      <FilterBar
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        filterRole={filterRole} setFilterRole={setFilterRole}
        filterStatus={filterStatus} setFilterStatus={setFilterStatus}
        availableRoles={availableRoles}
      />

      <DistributionChart chartData={chartData} />

      <TrendsCard
        showTrend={showTrend}
        trendLoading={trendLoading}
        trendData={trendData}
        onToggle={() => { if (!showTrend) fetchTrends(); setShowTrend(!showTrend); }}
      />

      <RoleSummaryCard roleSummary={roleSummary} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ProviderListPanel
            providers={filteredProviders}
            selectedProvider={selectedProvider}
            onSelect={fetchProviderStudents}
          />
        </div>
        <div>
          <ProviderDetailPanel
            selectedProvider={selectedProvider}
            providerStudents={providerStudents}
            studentsLoading={studentsLoading}
            onReassign={(student, fromProvider) => setReassignDialog({ student, fromProvider })}
          />
          <SuggestionsCard suggestions={suggestions} />
        </div>
      </div>

      <ThresholdDialog
        open={thresholdDialog}
        onOpenChange={setThresholdDialog}
        editThresholds={editThresholds}
        setEditThresholds={setEditThresholds}
        onApply={() => {
          setCustomThresholds(editThresholds);
          setThresholds(editThresholds);
          setThresholdDialog(false);
          fetchData(editThresholds);
          fetchSuggestions(editThresholds);
        }}
      />

      <ReassignDialog
        reassignDialog={reassignDialog}
        onClose={() => { setReassignDialog(null); setReassignTarget(""); }}
        reassignTarget={reassignTarget}
        setReassignTarget={setReassignTarget}
        eligibleTargets={eligibleTargets}
        reassigning={reassigning}
        onConfirm={handleReassign}
      />
    </div>
  );
}
