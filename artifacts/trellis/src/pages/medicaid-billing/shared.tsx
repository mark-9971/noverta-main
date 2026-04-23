export type ClaimStatus = "pending" | "approved" | "rejected" | "exported" | "void";

export const STATUS_COLORS: Record<ClaimStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  exported: "bg-blue-50 text-blue-700",
  void: "bg-gray-100 text-gray-500",
};

// Honest, non-Medicaid-implying labels. None of these statuses reflect any
// communication with Medicaid — Noverta never files claims or receives
// adjudication. Every status describes only what happened inside this tool.
export const STATUS_LABELS: Record<ClaimStatus, { label: string; title: string }> = {
  pending: { label: "Draft", title: "Generated from session logs. Awaiting internal review by your billing admin." },
  approved: { label: "Internal OK", title: "An admin in Noverta approved this draft for export. This is NOT a Medicaid approval — Medicaid has not seen it." },
  rejected: { label: "Internal Reject", title: "An admin in Noverta rejected or flagged this draft. It will not be included in the next export." },
  exported: { label: "Exported", title: "The CSV/JSON file containing this draft was downloaded from Noverta. Noverta does not know whether it has been uploaded to or accepted by Medicaid." },
  void: { label: "Voided", title: "Marked void in Noverta (e.g. duplicate or no longer billable). Not exported and not filed." },
};

export const STATUS_FILTERS: { value: string; label: string; title: string }[] = [
  { value: "pending", label: "Draft", title: STATUS_LABELS.pending.title },
  { value: "approved", label: "Internal OK", title: STATUS_LABELS.approved.title },
  { value: "rejected", label: "Internal Reject", title: STATUS_LABELS.rejected.title },
  { value: "exported", label: "Exported", title: STATUS_LABELS.exported.title },
  { value: "void", label: "Voided", title: STATUS_LABELS.void.title },
  { value: "", label: "All", title: "Show all draft claims regardless of internal status." },
];

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; icon: any }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-6">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
            active === t.key ? "border-emerald-500 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <t.icon className="w-4 h-4" />
          {t.label}
        </button>
      ))}
    </div>
  );
}
