import { useState, useEffect, lazy, Suspense } from "react";
import { Settings, CalendarDays, Database, Shield, Trash2, Activity, Scale, DollarSign } from "lucide-react";

const SetupPage = lazy(() => import("@/pages/setup"));
const SchoolYearPage = lazy(() => import("@/pages/school-year"));
const SisSettingsPage = lazy(() => import("@/pages/sis-settings"));
const AuditLogPage = lazy(() => import("@/pages/audit-log"));
const RecentlyDeletedPage = lazy(() => import("@/pages/recently-deleted"));
const SystemStatusPage = lazy(() => import("@/pages/system-status"));
const LegalCompliancePage = lazy(() => import("@/pages/legal-compliance"));
const BillingRatesPage = lazy(() => import("@/pages/billing-rates"));

const TABS = [
  { key: "general", label: "General", icon: Settings },
  { key: "school-year", label: "School Year", icon: CalendarDays },
  { key: "billing-rates", label: "Billing Rates", icon: DollarSign },
  { key: "sis", label: "SIS Integration", icon: Database },
  { key: "audit-log", label: "Audit Log", icon: Shield },
  { key: "recently-deleted", label: "Recently Deleted", icon: Trash2 },
  { key: "system-status", label: "System Status", icon: Activity },
  { key: "legal", label: "Legal & Compliance", icon: Scale },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function TabLoader() {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="w-6 h-6 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
    </div>
  );
}

function getTabFromHash(): TabKey | null {
  const hash = window.location.hash.replace("#", "");
  const found = TABS.find(t => t.key === hash);
  return found ? found.key : null;
}

export default function SettingsHubPage() {
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    return getTabFromHash() ?? "general";
  });

  useEffect(() => {
    const onHashChange = () => {
      const tab = getTabFromHash();
      if (tab) setActiveTab(tab);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    const hash = key === "general" ? "" : `#${key}`;
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
    window.history.replaceState(null, "", `${base}/settings${hash}`);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
          <Settings className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Manage your district configuration, integrations, and system tools.</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-gray-100 -mx-1 px-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[12px] font-medium whitespace-nowrap transition-colors border-b-2 ${
                isActive
                  ? "border-emerald-600 text-emerald-700 bg-emerald-50/50"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <Suspense fallback={<TabLoader />}>
        {activeTab === "general" && <SetupPage />}
        {activeTab === "school-year" && <SchoolYearPage />}
        {activeTab === "billing-rates" && <BillingRatesPage />}
        {activeTab === "sis" && <SisSettingsPage />}
        {activeTab === "audit-log" && <AuditLogPage />}
        {activeTab === "recently-deleted" && <RecentlyDeletedPage />}
        {activeTab === "system-status" && <SystemStatusPage />}
        {activeTab === "legal" && <LegalCompliancePage />}
      </Suspense>
    </div>
  );
}
