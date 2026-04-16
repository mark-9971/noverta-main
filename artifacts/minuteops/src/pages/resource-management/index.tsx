import { useState, useEffect } from "react";
import { getResourceCaseload, getProviderUtilization, getResourceBudget, getRebalancingSuggestions } from "@workspace/api-client-react";
import { useSchoolContext } from "@/lib/school-context";
import { Users, DollarSign, Scale } from "lucide-react";
import type { Tab, SchoolCaseload, ProviderUtil, BudgetData, Suggestion } from "./types";
import { CaseloadTab } from "./CaseloadTab";
import { UtilizationTab } from "./UtilizationTab";
import { BudgetTab } from "./BudgetTab";

export default function ResourceManagement() {
  const [tab, setTab] = useState<Tab>("caseload");
  const { selectedSchoolId, selectedDistrictId } = useSchoolContext();

  const [caseloadData, setCaseloadData] = useState<{ schools: SchoolCaseload[] } | null>(null);
  const [utilData, setUtilData] = useState<ProviderUtil[] | null>(null);
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const qs = selectedSchoolId ? `?schoolId=${selectedSchoolId}` : selectedDistrictId ? `?districtId=${selectedDistrictId}` : "";

  useEffect(() => {
    setLoading(true);
    const params = qs ? Object.fromEntries(new URLSearchParams(qs.slice(1))) as any : undefined;
    Promise.all([
      getResourceCaseload(params),
      getProviderUtilization(params),
      getResourceBudget(params),
      getRebalancingSuggestions(params),
    ]).then(([cl, ut, bg, sg]) => {
      setCaseloadData(cl);
      setUtilData(ut as any);
      setBudgetData(bg);
      setSuggestions(sg);
    }).finally(() => setLoading(false));
  }, [selectedSchoolId, selectedDistrictId]);

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "caseload", label: "Caseload Balance", icon: Scale },
    { id: "utilization", label: "Provider Utilization", icon: Users },
    { id: "budget", label: "Budget & Cost", icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Resource Management</h1>
          <p className="text-sm text-gray-500 mt-1">Caseload balancing, provider utilization, and cost analysis</p>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex -mb-px space-x-6">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-emerald-600 text-emerald-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : (
        <>
          {tab === "caseload" && caseloadData && <CaseloadTab data={caseloadData} suggestions={suggestions} />}
          {tab === "utilization" && utilData && <UtilizationTab data={utilData} onRateUpdate={(staffId, rate) => {
            setUtilData(prev => prev ? prev.map(p => p.staffId === staffId ? { ...p, hourlyRate: rate } : p) : prev);
          }} />}
          {tab === "budget" && budgetData && <BudgetTab data={budgetData} />}
        </>
      )}
    </div>
  );
}
