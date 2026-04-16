import { useState, useMemo, useEffect } from "react";
import { useGetComplianceTrendReport } from "@workspace/api-client-react";
import type { GetComplianceTrendReportParams } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { downloadCsv, formatPeriodLabel } from "./utils";

export function ComplianceTrendTab() {
  const { filterParams } = useSchoolContext();
  const { user } = useRole();
  const [granularity, setGranularity] = useState<string>("monthly");
  const [selectedSchools, setSelectedSchools] = useState<Set<number>>(new Set());

  const now = new Date();
  const [startDate, setStartDate] = useState(() => new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => now.toISOString().split("T")[0]);

  const queryParams: GetComplianceTrendReportParams = { startDate, endDate, granularity: granularity as "weekly" | "monthly", preparedBy: user.name };
  if (filterParams.schoolId) queryParams.schoolId = Number(filterParams.schoolId);
  if (filterParams.districtId) queryParams.districtId = Number(filterParams.districtId);

  const { data, isLoading: loading } = useGetComplianceTrendReport(queryParams);

  useEffect(() => {
    if (data?.schools && data.schools.length > 0 && selectedSchools.size === 0) {
      setSelectedSchools(new Set(data.schools.map(s => s.schoolId)));
    }
  }, [data?.schools]);

  const chartData = useMemo(() => {
    if (!data?.trend) return [];
    return data.trend.map(t => {
      const point: Record<string, string | number | null> = {
        period: t.period,
        label: formatPeriodLabel(t.period, granularity),
        overall: t.compliancePercent,
      };
      if (data.schools) {
        for (const school of data.schools) {
          if (selectedSchools.has(school.schoolId)) {
            const sp = school.trend.find(st => st.period === t.period);
            point[`school_${school.schoolId}`] = sp?.compliancePercent ?? null;
          }
        }
      }
      return point;
    });
  }, [data, selectedSchools, granularity]);

  const semesterLines = useMemo(() => {
    if (!data?.semesterMarkers || !chartData.length) return [];
    return ((data as any).semesterMarkers.map((m: any) => {
      const closest = chartData.reduce<{ label: string; dist: number }>((best, pt) => {
        const dist = Math.abs(new Date(pt.period as string).getTime() - new Date(m.date as string).getTime());
        return dist < best.dist ? { label: pt.label as string, dist } : best;
      }, { label: "", dist: Infinity });
      return { label: m.label as string, x: closest.label };
    }) as { label: string; x: string }[]).filter(m => m.x);
  }, [data?.semesterMarkers, chartData]);

  const SCHOOL_COLORS = ["#059669", "#dc2626", "#6b7280", "#d97706"];

  function toggleSchool(id: number) {
    setSelectedSchools(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportTrend() {
    if (!data?.trend) return;
    downloadCsv("compliance_trend.csv",
      ["Period", "Compliance %", "Students Tracked", "Minutes Delivered"],
      data.trend.map(t => [t.period, String(t.compliancePercent), String(t.studentsTracked), String(t.totalDelivered)]),
      { generatedAt: data.generatedAt, preparedBy: data.preparedBy }
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Granularity</label>
            <select value={granularity} onChange={e => setGranularity(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportTrend} disabled={!data?.trend?.length}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>

      {data?.schools && data.schools.length > 1 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400">Schools:</span>
          {data.schools.map((s, i) => (
            <button key={s.schoolId} onClick={() => toggleSchool(s.schoolId)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectedSchools.has(s.schoolId) ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200"}`}>
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: SCHOOL_COLORS[i % SCHOOL_COLORS.length] }} />
              {s.schoolName}
            </button>
          ))}
        </div>
      )}

      <Card className="border-gray-200/60">
        <CardContent className="p-4">
          {loading ? <Skeleton className="h-72" /> : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(v: number) => [`${v}%`, ""]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {semesterLines.map((m: { label: string; x: string }, i: number) => (
                  <ReferenceLine key={i} x={m.x} stroke="#d1d5db" strokeDasharray="4 4" label={{ value: m.label, position: "top" as any, fontSize: 10, fill: "#9ca3af" }} />
                ))}
                <Line type="monotone" dataKey="overall" name="District Overall" stroke="#111827" strokeWidth={2.5} dot={{ r: 3 }} />
                {data?.schools?.filter(s => selectedSchools.has(s.schoolId)).map((s, i) => (
                  <Line
                    key={s.schoolId}
                    type="monotone"
                    dataKey={`school_${s.schoolId}`}
                    name={s.schoolName}
                    stroke={SCHOOL_COLORS[i % SCHOOL_COLORS.length]}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={{ r: 2 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-72 flex items-center justify-center text-sm text-gray-400">No trend data available for this date range</div>
          )}
        </CardContent>
      </Card>

      {data?.trend && data.trend.length > 0 && (
        <Card className="border-gray-200/60">
          <CardContent className="p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Period</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Compliance</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Students</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Minutes Delivered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.trend.map(t => (
                  <tr key={t.period}>
                    <td className="px-4 py-2 text-[13px] text-gray-700 font-medium">{formatPeriodLabel(t.period, granularity)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`text-[12px] font-bold ${t.compliancePercent >= 85 ? "text-emerald-600" : t.compliancePercent >= 70 ? "text-gray-600" : "text-red-600"}`}>
                        {t.compliancePercent}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[13px] text-gray-600 text-right">{t.studentsTracked}</td>
                    <td className="px-4 py-2 text-[13px] text-gray-600 font-mono text-right">{t.totalDelivered.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
