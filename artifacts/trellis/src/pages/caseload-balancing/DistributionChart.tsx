import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell, Legend } from "recharts";
import { STATUS_COLORS, ROLE_LABELS } from "./types";

interface ChartItem {
  name: string;
  students: number;
  threshold: number;
  status: "balanced" | "approaching" | "overloaded";
  fullName: string;
  role: string;
}

export function DistributionChart({ chartData }: { chartData: ChartItem[] }) {
  if (chartData.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Caseload Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 32)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
                    <p className="font-medium">{d.fullName}</p>
                    <p className="text-gray-500">{ROLE_LABELS[d.role] || d.role}</p>
                    <p className="mt-1">Students: <span className="font-medium">{d.students}</span></p>
                    <p>Threshold: <span className="font-medium">{d.threshold}</span></p>
                  </div>
                );
              }}
            />
            <Legend />
            <ReferenceLine x={0} stroke="#e5e7eb" />
            <Bar dataKey="students" name="Students" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={STATUS_COLORS[entry.status].bar} />
              ))}
            </Bar>
            <Bar dataKey="threshold" name="Threshold" fill="none" stroke="#9ca3af" strokeDasharray="4 4" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
