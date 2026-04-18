import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingDown, AlertCircle } from "lucide-react";

interface TrendPoint { date: string; count: number; }

interface TrendData {
  implementationDate: string | null;
  preBipData: TrendPoint[];
  postBipData: TrendPoint[];
}

interface ChartDatum {
  date: string;
  label: string;
  preCount: number | null;
  postCount: number | null;
  phase: "pre" | "post";
}

function formatDate(d: string) {
  const [, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const phase = payload[0]?.payload?.phase;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm text-xs">
      <p className="font-medium text-gray-800 mb-1">{label}</p>
      {phase === "pre" && (
        <p className="text-amber-700">
          FBA observations: <strong>{payload.find((p: any) => p.dataKey === "preCount")?.value ?? 0}</strong>
        </p>
      )}
      {phase === "post" && (
        <p className="text-emerald-700">
          Behavior incidents: <strong>{payload.find((p: any) => p.dataKey === "postCount")?.value ?? 0}</strong>
        </p>
      )}
    </div>
  );
};

export function BipEffectivenessChart({ bipId }: { bipId: number }) {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    authFetch(`/api/bips/${bipId}/behavior-trend`)
      .then(r => r.json())
      .then((d: TrendData) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bipId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center gap-2 text-sm text-gray-400">
          <AlertCircle className="w-4 h-4" /> Could not load behavior trend data.
        </CardContent>
      </Card>
    );
  }

  const hasData = data.preBipData.length > 0 || data.postBipData.length > 0;

  if (!hasData) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-emerald-600" />
            Behavior Frequency Over Time
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6 text-center">
          <p className="text-xs text-gray-400">
            No behavior data available yet. ABC observations from the linked FBA and post-BIP behavior tracking will appear here once recorded.
          </p>
        </CardContent>
      </Card>
    );
  }

  const allDates = [
    ...data.preBipData.map(p => p.date),
    ...(data.implementationDate ? [data.implementationDate] : []),
    ...data.postBipData.map(p => p.date),
  ].filter(Boolean);
  const uniqueDates = [...new Set(allDates)].sort();

  const chartData: ChartDatum[] = uniqueDates.map(date => {
    const pre = data.preBipData.find(p => p.date === date);
    const post = data.postBipData.find(p => p.date === date);
    const isPrePhase = !data.implementationDate || date <= data.implementationDate;
    return {
      date,
      label: formatDate(date),
      preCount: pre ? pre.count : (isPrePhase ? null : null),
      postCount: post ? post.count : (!isPrePhase ? null : null),
      phase: isPrePhase ? "pre" : "post",
    };
  });

  const preAvg = data.preBipData.length
    ? Math.round(data.preBipData.reduce((s, p) => s + p.count, 0) / data.preBipData.length * 10) / 10
    : null;
  const postAvg = data.postBipData.length
    ? Math.round(data.postBipData.reduce((s, p) => s + p.count, 0) / data.postBipData.length * 10) / 10
    : null;
  const pctChange = preAvg && postAvg
    ? Math.round(((postAvg - preAvg) / preAvg) * 100)
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-emerald-600" />
            Behavior Frequency Over Time
          </CardTitle>
          {pctChange !== null && (
            <div className={`text-xs font-semibold px-2 py-1 rounded-full ${
              pctChange < 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}>
              {pctChange < 0 ? "▼" : "▲"} {Math.abs(pctChange)}% vs. FBA baseline
            </div>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {data.implementationDate
            ? `Dashed line marks BIP implementation (${data.implementationDate})`
            : "Set an implementation start date to see the before/after split"}
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        {(preAvg !== null || postAvg !== null) && (
          <div className="flex gap-4 mb-3 text-xs">
            {preAvg !== null && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-400 inline-block" />
                <span className="text-gray-500">FBA avg: <strong className="text-gray-700">{preAvg}/session</strong></span>
              </div>
            )}
            {postAvg !== null && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
                <span className="text-gray-500">Post-BIP avg: <strong className="text-gray-700">{postAvg}/session</strong></span>
              </div>
            )}
          </div>
        )}
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            {data.implementationDate && (
              <ReferenceLine
                x={formatDate(data.implementationDate)}
                stroke="#6366f1"
                strokeDasharray="5 3"
                strokeWidth={2}
                label={{ value: "BIP Start", position: "insideTopLeft", fontSize: 10, fill: "#6366f1" }}
              />
            )}
            <Bar dataKey="preCount" name="FBA observations" fill="#f59e0b" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
            <Line
              dataKey="postCount" name="Post-BIP incidents" type="monotone"
              stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
