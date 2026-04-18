import { useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { FileText, Edit, TrendingUp, Download, BarChart2 } from "lucide-react";
import { Tabs } from "./shared";
import { ClaimsQueueTab } from "./ClaimsQueueTab";
import { CptMappingsTab } from "./CptMappingsTab";
import { RevenueDashboardTab } from "./RevenueDashboardTab";
import { ExportTab } from "./ExportTab";
import { BillingReportsTab } from "./BillingReportsTab";

export type DrillFilter = {
  status?: string;
  ageBucket?: string;
  rejectionReason?: string;
  dateFrom?: string;
  dateTo?: string;
  label?: string;
};

const DRILL_KEYS = ["status", "ageBucket", "rejectionReason", "dateFrom", "dateTo", "label"] as const;

export default function MedicaidBillingPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const sp = useMemo(() => new URLSearchParams(search), [search]);

  const rawTab = sp.get("tab");
  const activeTab = ["claims", "mappings", "revenue", "reports", "export"].includes(rawTab ?? "")
    ? (rawTab as string)
    : "claims";

  const drillFilter = useMemo<DrillFilter | null>(() => {
    const f: DrillFilter = {};
    let hasAny = false;
    for (const k of DRILL_KEYS) {
      const v = sp.get(k);
      if (v == null || v === "") continue;
      f[k] = v;
      if (k !== "label") hasAny = true;
    }
    return hasAny ? f : null;
  }, [sp]);

  function setActiveTab(tab: string) {
    const next = new URLSearchParams(sp);
    next.set("tab", tab);
    if (tab !== "claims") {
      for (const k of DRILL_KEYS) next.delete(k);
    }
    navigate(`/medicaid-billing?${next.toString()}`, { replace: true });
  }

  function handleClearDrill() {
    const next = new URLSearchParams(sp);
    for (const k of DRILL_KEYS) next.delete(k);
    if (!next.get("tab")) next.set("tab", "claims");
    navigate(`/medicaid-billing?${next.toString()}`, { replace: true });
  }

  const tabs = [
    { key: "claims", label: "Claims Queue", icon: FileText },
    { key: "mappings", label: "CPT Mappings", icon: Edit },
    { key: "revenue", label: "Revenue Dashboard", icon: TrendingUp },
    { key: "reports", label: "Billing Reports", icon: BarChart2 },
    { key: "export", label: "Export", icon: Download },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto" data-tour-id="showcase-medicaid">
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

      {activeTab === "claims" && <ClaimsQueueTab drillFilter={drillFilter} onClearDrill={handleClearDrill} />}
      {activeTab === "mappings" && <CptMappingsTab />}
      {activeTab === "revenue" && <RevenueDashboardTab />}
      {activeTab === "reports" && <BillingReportsTab />}
      {activeTab === "export" && <ExportTab />}
    </div>
  );
}
