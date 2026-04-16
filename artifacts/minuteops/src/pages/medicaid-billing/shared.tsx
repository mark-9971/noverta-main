export type ClaimStatus = "pending" | "approved" | "rejected" | "exported" | "void";

export const STATUS_COLORS: Record<ClaimStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  exported: "bg-blue-50 text-blue-700",
  void: "bg-gray-100 text-gray-500",
};

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
