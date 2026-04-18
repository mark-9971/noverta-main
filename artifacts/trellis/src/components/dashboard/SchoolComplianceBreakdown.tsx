import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";

interface SchoolRow {
  schoolId: number | null;
  schoolName: string;
  totalStudents: number;
  onTrack: number;
  atRisk: number;
  rate: number;
}

function rateColor(rate: number) {
  if (rate >= 90) return { bar: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" };
  if (rate >= 75) return { bar: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50" };
  return { bar: "bg-red-500", text: "text-red-700", bg: "bg-red-50" };
}

export default function SchoolComplianceBreakdown() {
  const { filterParams } = useSchoolContext();
  const qs = new URLSearchParams(filterParams).toString();
  const params = qs ? `?${qs}` : "";

  const { data: schools, isLoading } = useQuery<SchoolRow[]>({
    queryKey: ["dashboard/school-compliance", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/dashboard/school-compliance${params}`);
      if (!r.ok) throw new Error("school-compliance failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-gray-900">Compliance by School</h2>
        </div>
        <div className="px-5 pb-5 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
              <div className="h-1.5 bg-gray-100 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!schools || schools.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-gray-900">Compliance by School</h2>
        </div>
        <p className="px-5 pb-5 text-sm text-gray-400">No school data available.</p>
      </div>
    );
  }

  const districtAvg = Math.round(schools.reduce((sum, s) => sum + s.rate, 0) / schools.length);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-gray-900">Compliance by School</h2>
        </div>
        <span className="text-xs text-gray-400">This school year</span>
      </div>

      <ul className="divide-y divide-gray-100">
        {schools.map(s => {
          const c = rateColor(s.rate);
          const href = s.schoolId
            ? `/compliance?schoolId=${s.schoolId}`
            : "/compliance";
          return (
            <li key={s.schoolId ?? s.schoolName}>
              <Link href={href}>
                <a className="px-5 py-3.5 hover:bg-gray-50 cursor-pointer flex items-center gap-3 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-medium text-gray-800 truncate">{s.schoolName}</span>
                      <span className={`text-xs font-bold tabular-nums ml-2 flex-shrink-0 ${c.text}`}>{s.rate}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${c.bar}`} style={{ width: `${s.rate}%` }} />
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[11px] text-gray-400">{s.totalStudents} student{s.totalStudents !== 1 ? "s" : ""}</span>
                      {s.atRisk > 0 && (
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                          {s.atRisk} at risk
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                </a>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          District average: <span className="font-semibold text-gray-600">{districtAvg}%</span>
        </span>
        <Link href="/compliance">
          <a className="text-xs text-emerald-700 hover:text-emerald-800 font-medium">View full report →</a>
        </Link>
      </div>
    </div>
  );
}
