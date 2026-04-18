import { Users, AlertTriangle, TrendingDown } from "lucide-react";

const providers = [
  { name: "Sarah Chen", role: "Speech-Language Pathologist", students: 8, delivered: 312, required: 320, missed: 2, pct: 98 },
  { name: "Marcus Rivera", role: "Occupational Therapist", students: 7, delivered: 228, required: 280, missed: 8, pct: 81 },
  { name: "Priya Patel", role: "Physical Therapist", students: 5, delivered: 160, required: 180, missed: 4, pct: 89 },
  { name: "James O'Brien", role: "ABA Specialist", students: 9, delivered: 290, required: 430, missed: 14, pct: 67 },
  { name: "Emily Washington", role: "Special Ed Teacher", students: 6, delivered: 205, required: 220, missed: 1, pct: 93 },
];

function pctColor(pct: number) {
  if (pct >= 90) return { text: "text-emerald-700", ring: "ring-emerald-200 bg-emerald-50" };
  if (pct >= 80) return { text: "text-amber-700", ring: "ring-amber-200 bg-amber-50" };
  return { text: "text-red-700", ring: "ring-red-100 bg-red-50" };
}

export function ProviderPulse() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-6">
      <div className="w-full max-w-[560px] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Provider Delivery</h2>
          </div>
          <span className="text-xs text-gray-400">April 2026</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide">Provider</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-400 uppercase tracking-wide">Students</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-400 uppercase tracking-wide">Min Delivered</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-400 uppercase tracking-wide">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {providers.map((p) => {
                const c = pctColor(p.pct);
                return (
                  <tr key={p.name} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900 text-[13px]">{p.name}</div>
                      <div className="text-[11px] text-gray-400 truncate max-w-[180px]">{p.role}</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[13px] text-gray-600">{p.students}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="tabular-nums text-[13px] text-gray-700">{p.delivered.toLocaleString()}</div>
                      <div className="text-[11px] text-gray-400">of {p.required}</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${c.ring} ${c.text}`}>
                        {p.pct < 80 && <TrendingDown className="w-3 h-3" />}
                        {p.pct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span className="text-xs text-gray-500">1 provider below 70% delivery — compensatory risk is accumulating</span>
        </div>
      </div>
    </div>
  );
}
