import { useState } from "react";
import { FileText, Edit, TrendingUp, Download } from "lucide-react";
import { Tabs } from "./shared";
import { ClaimsQueueTab } from "./ClaimsQueueTab";
import { CptMappingsTab } from "./CptMappingsTab";
import { RevenueDashboardTab } from "./RevenueDashboardTab";
import { ExportTab } from "./ExportTab";

export default function MedicaidBillingPage() {
  const [activeTab, setActiveTab] = useState("claims");

  const tabs = [
    { key: "claims", label: "Claims Queue", icon: FileText },
    { key: "mappings", label: "CPT Mappings", icon: Edit },
    { key: "revenue", label: "Revenue Dashboard", icon: TrendingUp },
    { key: "export", label: "Export", icon: Download },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Medicaid Billing</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">
          Generate claims from session logs, review, and export for Medicaid reimbursement
        </p>
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "claims" && <ClaimsQueueTab />}
      {activeTab === "mappings" && <CptMappingsTab />}
      {activeTab === "revenue" && <RevenueDashboardTab />}
      {activeTab === "export" && <ExportTab />}
    </div>
  );
}
