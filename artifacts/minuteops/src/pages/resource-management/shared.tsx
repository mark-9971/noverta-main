export function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    over_capacity: { bg: "bg-gray-200", text: "text-gray-900", label: "Over Capacity" },
    high_load: { bg: "bg-gray-150 bg-gray-100", text: "text-gray-700", label: "High Load" },
    balanced: { bg: "bg-emerald-600/10", text: "text-emerald-600", label: "Balanced" },
    under_utilized: { bg: "bg-gray-50", text: "text-gray-500", label: "Under-Utilized" },
  };
  const s = map[status] || map.balanced;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

export function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function fmtMin(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function downloadCsv(rows: Record<string, string | number | boolean | null | undefined>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(","),
    ...rows.map(r => headers.map(h => {
      const v = r[h];
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function UtilBar({ pct }: { pct: number }) {
  const color = pct > 100 ? "bg-gray-900" : pct > 80 ? "bg-gray-600" : pct > 40 ? "bg-emerald-600" : "bg-gray-300";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-8">{pct}%</span>
    </div>
  );
}

export function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {icon}
      </div>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
