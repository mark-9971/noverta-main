import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, TrendingUp, Shield, Heart, FileDown } from "lucide-react";
import { useRole, type UserRole } from "@/lib/role-context";
import { ExecutiveSummaryTab } from "./reports/ExecutiveSummaryTab";
import { ComplianceTrendTab } from "./reports/ComplianceTrendTab";
import { AuditPackageTab } from "./reports/AuditPackageTab";
import { MinuteSummaryTab } from "./reports/MinuteSummaryTab";
import { MissedSessionsTab } from "./reports/MissedSessionsTab";
import { RiskTab } from "./reports/RiskTab";
import { ParentSummaryTab } from "./reports/ParentSummaryTab";
import { ComplianceExportsTab } from "./reports/ComplianceExportsTab";

const EXPORT_ROLES: UserRole[] = ["admin", "case_manager", "coordinator"];

export default function Reports() {
  const { user } = useRole();
  const canExport = EXPORT_ROLES.includes(user.role as UserRole);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Reports</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">Compliance, service delivery, and audit reports</p>
      </div>

      <Tabs defaultValue="executive">
        <TabsList className="flex-wrap">
          <TabsTrigger value="executive" className="gap-1.5"><Shield className="w-3.5 h-3.5" /> Executive Summary</TabsTrigger>
          <TabsTrigger value="trend" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Compliance Trend</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Audit Package</TabsTrigger>
          <TabsTrigger value="minutes">Minutes</TabsTrigger>
          <TabsTrigger value="missed">Missed</TabsTrigger>
          <TabsTrigger value="risk">At-Risk</TabsTrigger>
          <TabsTrigger value="parent" className="gap-1.5"><Heart className="w-3.5 h-3.5" /> Parent Summary</TabsTrigger>
          {canExport && <TabsTrigger value="exports" className="gap-1.5"><FileDown className="w-3.5 h-3.5" /> Exports</TabsTrigger>}
        </TabsList>

        <TabsContent value="executive" className="mt-4"><ExecutiveSummaryTab /></TabsContent>
        <TabsContent value="trend" className="mt-4"><ComplianceTrendTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditPackageTab /></TabsContent>
        <TabsContent value="minutes" className="mt-4"><MinuteSummaryTab /></TabsContent>
        <TabsContent value="missed" className="mt-4"><MissedSessionsTab /></TabsContent>
        <TabsContent value="risk" className="mt-4"><RiskTab /></TabsContent>
        <TabsContent value="parent" className="mt-4"><ParentSummaryTab /></TabsContent>
        {canExport && <TabsContent value="exports" className="mt-4"><ComplianceExportsTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
