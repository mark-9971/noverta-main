import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, Plus, Calculator, TrendingDown } from "lucide-react";
import CostAvoidanceDashboard from "@/pages/cost-avoidance";
import { toast } from "sonner";
import { useSchoolContext } from "@/lib/school-context";
import {
  listCompensatoryObligations, getCompensatoryObligation, updateCompensatoryObligation,
  calculateShortfalls, generateFromShortfalls, listStudents, listServiceRequirements
} from "@workspace/api-client-react";
import { STATUS_CONFIG } from "./types";
import type { Obligation, Shortfall } from "./types";
import { ShortfallCalculator } from "./ShortfallCalculator";
import { CreateObligationForm } from "./CreateObligationForm";
import { ObligationList } from "./ObligationList";

export default function CompensatoryServices() {
  const { selectedSchoolId } = useSchoolContext();
  const search = useSearch();
  const [, navigate] = useLocation();
  const rawTab = new URLSearchParams(search).get("tab");
  const activeTab: "obligations" | "cost-avoidance" = rawTab === "cost-avoidance" ? "cost-avoidance" : "obligations";
  function setActiveTab(t: "obligations" | "cost-avoidance") {
    navigate(`/compensatory-services?tab=${t}`, { replace: true });
  }
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
      setShortfalls(data as any);
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

  function handleLogged(id: number) {
    setShowLogSession(null);
    fetchObligations();
    toggleExpanded(id);
    setTimeout(() => toggleExpanded(id), 100);
  }

  const TABS = [
    { key: "obligations" as const, label: "Obligations", icon: Gift },
    { key: "cost-avoidance" as const, label: "Cost Avoidance", icon: TrendingDown },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6" data-tour-id="showcase-compensatory">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Gift className="w-6 h-6 text-emerald-600" />
            Compensatory Services
          </h1>
          <p className="text-sm text-gray-400 mt-1">Track owed minutes and prevent financial exposure</p>
        </div>
        {activeTab === "obligations" && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCalculator(!showCalculator)} className="gap-1.5">
              <Calculator className="w-4 h-4" /> Calculate Shortfalls
            </Button>
            <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="w-4 h-4" /> Add Obligation
            </Button>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 -mt-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "obligations" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-gray-800">{totalOwed}</p><p className="text-[11px] text-gray-400">Total Minutes Owed</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-emerald-700">{totalDelivered}</p><p className="text-[11px] text-gray-400">Minutes Delivered</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-gray-800">{totalRemaining}</p><p className="text-[11px] text-gray-400">Minutes Remaining</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-gray-800">{pendingCount}</p><p className="text-[11px] text-gray-400">Active Obligations</p></CardContent></Card>
          </div>

          {showCalculator && (
            <ShortfallCalculator
              onClose={() => { setShowCalculator(false); setShortfalls([]); }}
              onCalculate={runCalculateShortfalls}
              shortfalls={shortfalls}
              loading={calcLoading}
              onGenerate={generateObligations}
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

          <ObligationList
            obligations={obligations}
            loading={loading}
            expandedId={expandedId}
            expandedDetail={expandedDetail}
            expandedLoading={expandedLoading}
            showLogSession={showLogSession}
            onToggleExpanded={toggleExpanded}
            onUpdateStatus={updateStatus}
            onShowLog={(id) => setShowLogSession(id)}
            onCloseLog={() => setShowLogSession(null)}
            onLogged={handleLogged}
          />
        </>
      )}

      {activeTab === "cost-avoidance" && (
        <CostAvoidanceDashboard embedded />
      )}
    </div>
  );
}
