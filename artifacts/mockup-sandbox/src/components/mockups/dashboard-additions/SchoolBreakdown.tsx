import { ShieldCheck, ChevronRight } from "lucide-react";

const schools = [
  { name: "Framingham High School", students: 12, onTrack: 11, rate: 92, trend: +2 },
  { name: "Natick Elementary", students: 9, onTrack: 8, rate: 89, trend: -1 },
  { name: "MetroWest Regional High", students: 11, onTrack: 7, rate: 64, trend: -5 },
  { name: "Holliston Middle School", students: 6, onTrack: 6, rate: 100, trend: 0 },
  { name: "Hopkinton Elementary", students: 4, onTrack: 3, rate: 75, trend: +3 },
];

function rateColor(rate: number) {
  if (rate >= 90) return { bar: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" };
  if (rate >= 75) return { bar: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50" };
  return { bar: "bg-red-500", text: "text-red-700", bg: "bg-red-50" };
}

export function SchoolBreakdown() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-6">
      <div className="w-full max-w-[540px] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-gray-900">Compliance by School</h2>
          </div>
          <span className="text-xs text-gray-400">This month</span>
        </div>

        <ul className="divide-y divide-gray-100">
          {schools.map((s) => {
            const c = rateColor(s.rate);
            const atRisk = s.students - s.onTrack;
            return (
              <li key={s.name} className="px-5 py-3.5 hover:bg-gray-50 cursor-pointer flex items-center gap-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] font-medium text-gray-800 truncate">{s.name}</span>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      {s.trend !== 0 && (
                        <span className={`text-[10px] font-semibold ${s.trend > 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {s.trend > 0 ? "▲" : "▼"}{Math.abs(s.trend)}%
                        </span>
                      )}
                      <span className={`text-xs font-bold tabular-nums ${c.text}`}>{s.rate}%</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${c.bar}`} style={{ width: `${s.rate}%` }} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[11px] text-gray-400">{s.students} students</span>
                    {atRisk > 0 && (
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                        {atRisk} at risk
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
              </li>
            );
          })}
        </ul>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">District average: <span className="font-semibold text-gray-600">84%</span></span>
          <button className="text-xs text-emerald-700 hover:text-emerald-800 font-medium">View full report →</button>
        </div>
      </div>
    </div>
  );
}
