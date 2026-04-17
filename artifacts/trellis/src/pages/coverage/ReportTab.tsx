import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import { FileText, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

export function ReportTab({ schoolId }: { schoolId?: number | null }) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState("3");
  const [view, setView] = useState<"substitutes" | "absences">("substitutes");

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ months });
      if (schoolId) params.set("schoolId", String(schoolId));
      const r = await authFetch(`/api/coverage/substitute-report?${params}`);
      const data = await r.json();
      setReport(data);
    } catch {
      toast.error("Failed to load substitute report");
    } finally {
      setLoading(false);
    }
  }, [months, schoolId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const substitutes = report?.substitutes ?? [];
  const absences = report?.absences ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-[12px] text-gray-500 whitespace-nowrap">Period</Label>
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="h-8 text-[13px] w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last month</SelectItem>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={loadReport} className="h-8 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
        <div className="ml-auto flex gap-1">
          <Button
            variant={view === "substitutes" ? "default" : "outline"}
            size="sm"
            className={`h-7 text-[12px] ${view === "substitutes" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
            onClick={() => setView("substitutes")}
          >
            Substitutes
          </Button>
          <Button
            variant={view === "absences" ? "default" : "outline"}
            size="sm"
            className={`h-7 text-[12px] ${view === "absences" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
            onClick={() => setView("absences")}
          >
            Absences
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : view === "substitutes" ? (
        <>
          {substitutes.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-[13px]">No substitute coverage data for this period.</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(150, substitutes.length * 32 + 40)}>
                <BarChart data={substitutes} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border rounded-lg shadow-lg p-2 text-xs">
                        <p className="font-medium">{d.name}</p>
                        <p>Sessions covered: {d.sessionsCovered}</p>
                        <p>Unique dates: {d.uniqueDates}</p>
                        <p>Providers covered for: {d.providersCoveredFor}</p>
                      </div>
                    );
                  }} />
                  <Bar dataKey="sessionsCovered" name="Sessions Covered" radius={[0, 4, 4, 0]}>
                    {substitutes.map((_: any, i: number) => (
                      <Cell key={i} fill={i === 0 ? "#10b981" : i < 3 ? "#34d399" : "#6ee7b7"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-1">
                {substitutes.map((s: any) => (
                  <div key={s.staffId} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-gray-100 bg-white text-[13px]">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-800">{s.name}</span>
                      <span className="ml-1.5 text-[11px] text-gray-400 capitalize">{(s.role ?? "").replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[12px] text-gray-500">
                      <span><strong className="text-gray-700">{s.sessionsCovered}</strong> sessions</span>
                      <span><strong className="text-gray-700">{s.uniqueDates}</strong> days</span>
                      <span><strong className="text-gray-700">{s.providersCoveredFor}</strong> providers</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {absences.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-[13px]">No absence data for this period.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {absences.map((a: any) => (
                <div key={a.staffId} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-gray-100 bg-white text-[13px]">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-800">{a.name}</span>
                    <span className="ml-1.5 text-[11px] text-gray-400 capitalize">{(a.role ?? "").replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[12px] text-gray-500">
                    <span><strong className="text-gray-700">{a.absenceDates}</strong> absence days</span>
                    <span><strong className="text-gray-700">{a.sessionsAffected}</strong> sessions affected</span>
                    <span>
                      <strong className={`${a.coverageRate >= 80 ? "text-emerald-600" : a.coverageRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                        {a.coverageRate}%
                      </strong> covered
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
