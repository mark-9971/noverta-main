import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ROLE_LABELS, TrendPoint } from "./types";

interface Props {
  showTrend: boolean;
  trendLoading: boolean;
  trendData: Record<string, TrendPoint[]>;
  onToggle: () => void;
}

export function TrendsCard({ showTrend, trendLoading, trendData, onToggle }: Props) {
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
                          const d = payload[0].payload;
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
        </CardContent>
      )}
    </Card>
  );
}
