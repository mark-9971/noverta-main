import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function TrendTab({ trend }: { trend: { weekStart: string; totalMinutes: number }[] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            Supervision Hours — Weekly Trend (Last 12 Weeks)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="weekStart"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={(v: string) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} label={{ value: "Minutes", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#6b7280" } }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(value: number) => [`${value} min`, "Supervision"]}
                  labelFormatter={(v: string) => `Week of ${v}`}
                />
                <Bar dataKey="totalMinutes" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 py-12">No supervision data for the trend period</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-gray-400">Total Minutes (12 Weeks)</p>
            <p className="text-2xl font-bold text-gray-800">{trend.reduce((s, t) => s + t.totalMinutes, 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-gray-400">Weekly Average</p>
            <p className="text-2xl font-bold text-gray-800">
              {trend.length > 0 ? Math.round(trend.reduce((s, t) => s + t.totalMinutes, 0) / trend.length) : 0} min
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-gray-400">Peak Week</p>
            <p className="text-2xl font-bold text-gray-800">
              {trend.length > 0 ? Math.max(...trend.map(t => t.totalMinutes)) : 0} min
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
