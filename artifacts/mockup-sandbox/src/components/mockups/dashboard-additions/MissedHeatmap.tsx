import { CalendarDays } from "lucide-react";

const services = ["Speech", "OT", "PT", "ABA", "SpEd"];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const data: Record<string, number[]> = {
  Speech: [2, 0, 1, 3, 1],
  OT: [1, 4, 0, 2, 0],
  PT: [0, 1, 0, 1, 0],
  ABA: [3, 5, 2, 6, 4],
  SpEd: [0, 0, 1, 0, 0],
};

function heatColor(val: number): string {
  if (val === 0) return "bg-gray-100 text-gray-300";
  if (val <= 1) return "bg-amber-100 text-amber-700";
  if (val <= 3) return "bg-amber-400 text-white";
  return "bg-red-500 text-white";
}

export function MissedHeatmap() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-6">
      <div className="w-full max-w-[500px] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-rose-500" />
            <h2 className="text-sm font-semibold text-gray-900">Missed Sessions by Day</h2>
          </div>
          <span className="text-xs text-gray-400">Last 4 weeks</span>
        </div>

        <div className="px-5 pb-4">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "72px repeat(5, 1fr)" }}>
            <div /> {/* empty corner */}
            {days.map(d => (
              <div key={d} className="text-center text-[11px] font-medium text-gray-400 pb-1">{d}</div>
            ))}
            {services.map(svc => (
              <>
                <div key={svc + "-label"} className="text-[12px] text-gray-500 font-medium flex items-center pr-2 truncate">{svc}</div>
                {data[svc].map((val, di) => (
                  <div
                    key={svc + "-" + di}
                    className={`rounded-md h-9 flex items-center justify-center text-[11px] font-bold transition-colors ${heatColor(val)}`}
                    title={`${val} missed`}
                  >
                    {val > 0 ? val : ""}
                  </div>
                ))}
              </>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
            <span className="text-[11px] text-gray-400">Scale:</span>
            {[
              { label: "0", cls: "bg-gray-100" },
              { label: "1", cls: "bg-amber-100" },
              { label: "2–3", cls: "bg-amber-400" },
              { label: "4+", cls: "bg-red-500" },
            ].map(({ label, cls }) => (
              <div key={label} className="flex items-center gap-1">
                <div className={`w-4 h-4 rounded ${cls}`} />
                <span className="text-[11px] text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
