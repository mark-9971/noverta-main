import { useState, useEffect, lazy, Suspense } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Settings, CalendarDays, Database, Shield, Trash2, Activity, Scale, DollarSign, LayoutDashboard, Compass, HardDrive, Bell, LifeBuoy, MailX, Gauge, Clock } from "lucide-react";
import ChecklistVisibilityToggle from "@/components/onboarding/ChecklistVisibilityToggle";
import TimerThresholdsCard from "@/components/settings/TimerThresholdsCard";
import { startShowcaseTour } from "@/components/ShowcaseTour";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";

const SetupPage = lazy(() => import("@/pages/setup"));
const SchoolYearPage = lazy(() => import("@/pages/school-year"));
const SisSettingsPage = lazy(() => import("@/pages/sis-settings"));
const AuditLogPage = lazy(() => import("@/pages/audit-log"));
const RecentlyDeletedPage = lazy(() => import("@/pages/recently-deleted"));
const SystemStatusPage = lazy(() => import("@/pages/system-status"));
const LegalCompliancePage = lazy(() => import("@/pages/legal-compliance"));
const BillingRatesPage = lazy(() => import("@/pages/billing-rates"));
const DistrictDataPage = lazy(() => import("@/pages/district-data"));
const NotificationPreferencesPage = lazy(() => import("@/pages/notification-preferences"));
const SupportSessionsAdminPage = lazy(() => import("@/pages/support-sessions-admin"));
const PilotConfigPage = lazy(() => import("@/pages/pilot-config"));
const UploadQuotaPage = lazy(() => import("@/pages/upload-quota"));

const TABS = [
  { key: "general", label: "General", icon: Settings },
  { key: "pilot", label: "Pilot Configuration", icon: Gauge },
  { key: "school-year", label: "School Year", icon: CalendarDays },
  { key: "billing-rates", label: "Billing Rates", icon: DollarSign },
  { key: "sis", label: "SIS Integration", icon: Database },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "audit-log", label: "Audit Log", icon: Shield },
  { key: "support-sessions", label: "Trellis Support Access", icon: LifeBuoy },
  { key: "recently-deleted", label: "Recently Deleted", icon: Trash2 },
  { key: "upload-quota", label: "Upload Quota", icon: HardDrive },
  { key: "system-status", label: "System Status", icon: Activity },
  { key: "legal", label: "Legal & Compliance", icon: Scale },
  { key: "data-privacy", label: "Data & Privacy", icon: HardDrive },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function TabLoader() {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="w-6 h-6 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
    </div>
  );
}

function resolveTab(search: string): TabKey {
  const p = new URLSearchParams(search).get("tab");
  const found = TABS.find(t => t.key === p);
  return found ? found.key : "general";
}

export default function SettingsHubPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { role } = useRole();
  const isAdmin = role === "admin";
  const visibleTabs = TABS.filter(t => t.key !== "upload-quota" || isAdmin);
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const t = resolveTab(search);
    return t === "upload-quota" && !isAdmin ? "general" : t;
  });

  const { data: healthData } = useQuery<{ email: "configured" | "not_configured" }>({
    queryKey: ["health"],
    queryFn: async () => {
      const r = await authFetch("/api/health");
      if (!r.ok) throw new Error("health check failed");
      return r.json();
    },
    staleTime: 60_000,
  });
  const emailNotConfigured = healthData?.email === "not_configured";

  // Showcase tour requires sample data to be loaded; hide its replay
  // control otherwise so the button isn't a dead click.
  const { data: sampleStatus } = useQuery<{ hasSampleData: boolean }>({
    queryKey: ["sample-data/status"],
    queryFn: async () => {
      const r = await authFetch("/api/sample-data");
      if (!r.ok) throw new Error("sample-data status failed");
      return r.json();
    },
    staleTime: 60_000,
  });
  const hasSampleData = sampleStatus?.hasSampleData === true;

  useEffect(() => {
    setActiveTab(resolveTab(search));
  }, [search]);

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    navigate(`/settings?tab=${key}`, { replace: true });
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
        {visibleTabs.map(tab => {
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

      {emailNotConfigured && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <MailX className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold text-amber-900">Email delivery is not configured</p>
            <p className="text-amber-800 text-xs mt-0.5">
              Parent notifications, missed-service alerts, weekly compliance digests, and pilot scorecards are all silently skipped.{" "}
              <button
                type="button"
                className="underline underline-offset-2 font-medium hover:text-amber-900"
                onClick={() => handleTabChange("system-status")}
              >
                View setup instructions →
              </button>
            </p>
          </div>
        </div>
      )}

      <Suspense fallback={<TabLoader />}>
        {activeTab === "general" && (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-700">Dashboard preferences</h2>
              </div>
              <ChecklistVisibilityToggle />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-700">Session timers</h2>
              </div>
              <TimerThresholdsCard />
            </div>
            {/* Replay control for the cross-module showcase tour. Only
                rendered when the district has sample data loaded — the
                tour itself is gated to that case, so without it the
                button would be a dead click. */}
            {hasSampleData && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-gray-500" />
                  <h2 className="text-sm font-semibold text-gray-700">Guided tours</h2>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">Showcase tour</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Replays the cross-module walkthrough that visits the strongest screen of each Trellis module.
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="button-settings-replay-showcase"
                    onClick={() => startShowcaseTour()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors flex-shrink-0"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    Replay showcase tour
                  </button>
                </div>
              </div>
            )}
            <div className="border-t border-gray-100 pt-4">
              <SetupPage />
            </div>
          </div>
        )}
        {activeTab === "pilot" && <PilotConfigPage />}
        {activeTab === "school-year" && <SchoolYearPage />}
        {activeTab === "billing-rates" && <BillingRatesPage />}
        {activeTab === "sis" && <SisSettingsPage />}
        {activeTab === "notifications" && <NotificationPreferencesPage />}
        {activeTab === "audit-log" && <AuditLogPage />}
        {activeTab === "support-sessions" && <SupportSessionsAdminPage />}
        {activeTab === "recently-deleted" && <RecentlyDeletedPage />}
        {activeTab === "upload-quota" && <UploadQuotaPage />}
        {activeTab === "system-status" && <SystemStatusPage />}
        {activeTab === "legal" && <LegalCompliancePage />}
        {activeTab === "data-privacy" && <DistrictDataPage />}
      </Suspense>
    </div>
  );
}
