import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, ChevronDown, ChevronUp, Users } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { ROLE_LABELS, TrendPoint, ProviderTrendSeries } from "./types";

const CHART_COLORS = [
  "#10b981", "#6366f1", "#f59e0b", "#ef4444", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
  "#64748b", "#dc2626", "#0ea5e9", "#a3e635", "#fb923c",
];

interface ProviderChartRow {
  week: string;
  [key: string]: string | number | undefined;
}

interface Props {
  showTrend: boolean;
  trendLoading: boolean;
  trendData: Record<string, TrendPoint[]>;
  providerTrends: ProviderTrendSeries[];
  providerTrendsLoading: boolean;
  onToggle: () => void;
}

type ViewMode = "role" | "provider";

export function TrendsCard({
  showTrend,
  trendLoading,
  trendData,
  providerTrends,
  providerTrendsLoading,
  onToggle,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("provider");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<number>>(new Set());

  const availableRoles = useMemo(() => {
    const roles = Array.from(new Set(providerTrends.map(p => p.role))).sort();
    return roles;
  }, [providerTrends]);

  const roleFilteredProviders = useMemo(() => {
    const filtered = selectedRole === "all"
      ? providerTrends
      : providerTrends.filter(p => p.role === selectedRole);
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [providerTrends, selectedRole]);

  // Drop selections that are no longer in the role-filtered list
  useEffect(() => {
    setSelectedStaffIds(prev => {
      if (prev.size === 0) return prev;
      const allowed = new Set(roleFilteredProviders.map(p => p.staffId));
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [roleFilteredProviders]);

  const filteredProviders = useMemo(() => {
    if (selectedStaffIds.size === 0) return roleFilteredProviders;
    return roleFilteredProviders.filter(p => selectedStaffIds.has(p.staffId));
  }, [roleFilteredProviders, selectedStaffIds]);

  const toggleStaff = (staffId: number) => {
    setSelectedStaffIds(prev => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  const clearProviderSelection = () => setSelectedStaffIds(new Set());
  const selectAllVisible = () => setSelectedStaffIds(new Set(roleFilteredProviders.map(p => p.staffId)));

  const providerChartData = useMemo((): { weeks: ProviderChartRow[]; series: ProviderTrendSeries[] } => {
    if (filteredProviders.length === 0) return { weeks: [], series: [] };

    const weekSet = new Set<string>();
    for (const p of filteredProviders) {
      for (const h of p.history) weekSet.add(h.week);
    }
    const sortedWeeks = Array.from(weekSet).sort();

    const dataByWeek = new Map<string, ProviderChartRow>();
    for (const week of sortedWeeks) {
      dataByWeek.set(week, { week });
    }

    for (const p of filteredProviders) {
      for (const h of p.history) {
        const row = dataByWeek.get(h.week);
        if (row) {
          row[`p_${p.staffId}`] = h.studentCount;
        }
      }
    }

    return {
      weeks: Array.from(dataByWeek.values()),
      series: filteredProviders,
    };
  }, [filteredProviders]);

  const formatWeekLabel = (value: string) => {
    if (!value) return "";
    const d = new Date(value);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Caseload Trends
          </span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onToggle}>
            {showTrend ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
            {showTrend ? "Hide" : "Show"} Trends
          </Button>
        </CardTitle>
      </CardHeader>
      {showTrend && (
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex gap-1">
              <Button
                variant={viewMode === "provider" ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setViewMode("provider")}
              >
                Per Provider (12 wks)
              </Button>
              <Button
                variant={viewMode === "role" ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setViewMode("role")}
              >
                By Role (monthly)
              </Button>
            </div>
            {viewMode === "provider" && availableRoles.length > 1 && (
              <select
                className="h-7 text-xs border rounded px-2 bg-white"
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
              >
                <option value="all">All Roles</option>
                {availableRoles.map(role => (
                  <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>
                ))}
              </select>
            )}
            {viewMode === "provider" && roleFilteredProviders.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    <Users className="w-3.5 h-3.5 mr-1" />
                    {selectedStaffIds.size === 0
                      ? "All Providers"
                      : `${selectedStaffIds.size} selected`}
                    <ChevronDown className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="flex items-center justify-between px-1 pb-2 border-b mb-2">
                    <span className="text-xs font-medium text-gray-700">Providers</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs text-indigo-600 hover:underline"
                        onClick={selectAllVisible}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className="text-xs text-gray-500 hover:underline"
                        onClick={clearProviderSelection}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <ScrollArea className="h-56 pr-2">
                    <div className="space-y-1">
                      {roleFilteredProviders.map(p => {
                        const checked = selectedStaffIds.has(p.staffId);
                        return (
                          <label
                            key={p.staffId}
                            className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 cursor-pointer text-xs"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleStaff(p.staffId)}
                            />
                            <span className="flex-1 truncate">{p.name}</span>
                            <span className="text-gray-400 text-[10px]">
                              {ROLE_LABELS[p.role] || p.role}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {viewMode === "provider" && (
            <>
              {providerTrendsLoading ? (
                <Skeleton className="h-64" />
              ) : providerChartData.series.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400 space-y-1">
                  <p>No snapshot data yet.</p>
                  <p className="text-xs">Weekly snapshots are captured every Monday. Check back after the next Monday run.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-2">
                    {providerChartData.series.length} provider{providerChartData.series.length !== 1 ? "s" : ""}
                    {selectedRole !== "all" ? ` — ${ROLE_LABELS[selectedRole] || selectedRole}` : ""}
                    {selectedStaffIds.size > 0 ? ` (filtered)` : ""}
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={providerChartData.weeks} margin={{ left: 0, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" tickFormatter={formatWeekLabel} tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-white border rounded-lg shadow-lg p-2 text-xs max-w-xs">
                              <p className="font-medium mb-1">Week of {label}</p>
                              {payload.map((entry) => (
                                <p key={String(entry.dataKey)} style={{ color: entry.color }}>
                                  {entry.name}: {entry.value} students
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {providerChartData.series.map((p, i) => (
                        <Line
                          key={p.staffId}
                          type="monotone"
                          dataKey={`p_${p.staffId}`}
                          name={p.name}
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          strokeWidth={1.5}
                          dot={{ r: 2 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </>
              )}
            </>
          )}

          {viewMode === "role" && (
            <>
              {trendLoading ? (
                <Skeleton className="h-64" />
              ) : Object.keys(trendData).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No trend data available yet</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(trendData).map(([role, data]) => (
                    <div key={role}>
                      <p className="text-sm font-medium mb-2">{ROLE_LABELS[role] || role}</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={data} margin={{ left: 0, right: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.[0]) return null;
                              const d = payload[0].payload as TrendPoint;
                              return (
                                <div className="bg-white border rounded-lg shadow-lg p-2 text-xs">
                                  <p className="font-medium">{d.month}</p>
                                  <p>Total Students: {d.studentCount}</p>
                                  <p>Providers: {d.providerCount}</p>
                                  <p>Avg per Provider: {d.avgPerProvider}</p>
                                </div>
                              );
                            }}
                          />
                          <Line type="monotone" dataKey="avgPerProvider" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Avg per Provider" />
                          <Line type="monotone" dataKey="studentCount" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Total Students" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
