import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Users, TrendingUp, Clock, Download, Briefcase, Percent } from "lucide-react";
import { toast } from "sonner";
import { formatDollars, formatMinutesAsHours } from "./types";
import type { OverviewData, StudentBalance, BurndownPoint, RatesResponse } from "./types";
import { KpiCard } from "./KpiCard";
import { OverviewTab } from "./OverviewTab";
import { StudentBalancesTab } from "./StudentBalancesTab";
import { RateConfigTab } from "./RateConfigTab";

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
