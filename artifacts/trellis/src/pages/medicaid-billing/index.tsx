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
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Medicaid Claim Prep</h1>
        <p className="text-xs md:text-sm text-gray-500 mt-1">
          Build claim drafts from logged sessions, review them, and export a CSV for upload to your district's Medicaid billing system or clearinghouse.
        </p>
        <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 inline-block">
          <b>Trellis does not file claims with Medicaid.</b> It prepares the data and tracks it through your internal review.
          Submission, adjudication, and reimbursement are handled by your district or its billing vendor.
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
