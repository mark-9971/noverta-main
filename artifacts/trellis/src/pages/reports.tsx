import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, TrendingUp, Shield, Heart, FileDown, Activity } from "lucide-react";
import { useRole, type UserRole } from "@/lib/role-context";
import { useSearch, useLocation } from "wouter";
import { ExecutiveSummaryTab } from "./reports/ExecutiveSummaryTab";
import { ComplianceTrendTab } from "./reports/ComplianceTrendTab";
import { AuditPackageTab } from "./reports/AuditPackageTab";
import { MinuteSummaryTab } from "./reports/MinuteSummaryTab";
import { MissedSessionsTab } from "./reports/MissedSessionsTab";
import { RiskTab } from "./reports/RiskTab";
import { ParentSummaryTab } from "./reports/ParentSummaryTab";
import { ComplianceExportsTab } from "./reports/ComplianceExportsTab";
import { PilotHealthTab } from "./reports/PilotHealthTab";

const EXPORT_ROLES: UserRole[] = ["admin", "case_manager", "coordinator"];

const TAB_KEYS = ["executive", "trend", "audit", "minutes", "missed", "risk", "parent", "exports", "pilot-health"] as const;
type TabKey = typeof TAB_KEYS[number];

function resolveTab(search: string): TabKey {
  const p = new URLSearchParams(search).get("tab");
  return (p && (TAB_KEYS as readonly string[]).includes(p) ? p : "executive") as TabKey;
}

export default function Reports() {
  const { user } = useRole();
  const search = useSearch();
  const [, navigate] = useLocation();
  const canExport = EXPORT_ROLES.includes(user.role as UserRole);
  const isAdmin = user.role === "admin";

  const [activeTab, setTabState] = useState<TabKey>(() => resolveTab(search));

  useEffect(() => {
    setTabState(resolveTab(search));
  }, [search]);

  function setTab(t: TabKey) {
    setTabState(t);
    navigate(`/reports?tab=${t}`, { replace: true });
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6" data-tour-id="showcase-reports">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Reports</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">Compliance, service delivery, and audit reports</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="flex-wrap h-auto gap-0.5 justify-start">
          <TabsTrigger value="executive" className="gap-1.5"><Shield className="w-3.5 h-3.5" /> Executive Summary</TabsTrigger>
          <TabsTrigger value="trend" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Compliance Trend</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Audit Package</TabsTrigger>
          <TabsTrigger value="minutes">Minutes</TabsTrigger>
          <TabsTrigger value="missed">Missed</TabsTrigger>
          <TabsTrigger value="risk">At-Risk</TabsTrigger>
          <TabsTrigger value="parent" className="gap-1.5"><Heart className="w-3.5 h-3.5" /> Parent Summary</TabsTrigger>
          {canExport && <TabsTrigger value="exports" className="gap-1.5"><FileDown className="w-3.5 h-3.5" /> Exports</TabsTrigger>}
          {isAdmin && <TabsTrigger value="pilot-health" className="gap-1.5"><Activity className="w-3.5 h-3.5" /> Pilot Health</TabsTrigger>}
        </TabsList>

        <TabsContent value="executive" className="mt-4"><ExecutiveSummaryTab /></TabsContent>
        <TabsContent value="trend" className="mt-4"><ComplianceTrendTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditPackageTab /></TabsContent>
        <TabsContent value="minutes" className="mt-4"><MinuteSummaryTab /></TabsContent>
        <TabsContent value="missed" className="mt-4"><MissedSessionsTab /></TabsContent>
        <TabsContent value="risk" className="mt-4"><RiskTab /></TabsContent>
        <TabsContent value="parent" className="mt-4"><ParentSummaryTab /></TabsContent>
        {canExport && <TabsContent value="exports" className="mt-4"><ComplianceExportsTab /></TabsContent>}
        {isAdmin && <TabsContent value="pilot-health" className="mt-4"><PilotHealthTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
