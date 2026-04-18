import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Layers, TrendingUp, AlertCircle } from "lucide-react";

const STANDARD_HIERARCHY = [
  "full_physical",
  "partial_physical",
  "model",
  "gestural",
  "verbal",
  "independent",
] as const;

const LEVEL_LABELS: Record<string, string> = {
  full_physical: "Full Physical",
  partial_physical: "Partial Physical",
  model: "Model",
  gestural: "Gestural",
  verbal: "Verbal",
  independent: "Independent",
};

const LEVEL_COLORS: Record<string, string> = {
  full_physical: "#ef4444",
  partial_physical: "#f97316",
  model: "#eab308",
  gestural: "#3b82f6",
  verbal: "#8b5cf6",
  independent: "#10b981",
};

interface TimelinePoint {
  sessionDate: string;
  promptLevelUsed: string;
  hierarchyIndex: number;
  trials: number;
}

interface TimelineData {
  timeline: TimelinePoint[];
  hierarchy: string[];
}

function formatDate(d: string) {
  const [, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}`;
}

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  const color = LEVEL_COLORS[payload?.promptLevelUsed] ?? "#6b7280";
  return <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={1.5} />;
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TimelinePoint;
  if (!d) return null;
  const color = LEVEL_COLORS[d.promptLevelUsed] ?? "#6b7280";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm text-xs min-w-[140px]">
      <p className="text-gray-400 mb-1">{d.sessionDate}</p>
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        <span className="font-semibold text-gray-900">{LEVEL_LABELS[d.promptLevelUsed] ?? d.promptLevelUsed}</span>
      </div>
      <p className="text-gray-400 mt-0.5">{d.trials} trial{d.trials !== 1 ? "s" : ""}</p>
    </div>
  );
};

export function PromptFadingTimeline({
  targetId,
  targetName,
}: {
  targetId: number;
  targetName?: string;
}) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    authFetch(`/api/program-targets/${targetId}/prompt-history`)
      .then(r => r.json())
      .then((d: TimelineData) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [targetId]);

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 flex items-center gap-2 text-sm text-gray-400">
        <AlertCircle className="w-4 h-4" /> Failed to load prompt history.
      </div>
    );
  }

  if (!data || data.timeline.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-gray-400">
        No prompt level data recorded yet for this target.
        <br />Log sessions with prompt levels to see fading progress here.
      </div>
    );
  }

  const chartData = data.timeline.map(p => ({
    ...p,
    label: formatDate(p.sessionDate),
    value: p.hierarchyIndex,
  }));

  const lastPoint = data.timeline[data.timeline.length - 1];
  const firstPoint = data.timeline[0];
  const totalImprovement = lastPoint.hierarchyIndex - firstPoint.hierarchyIndex;
  const isImproving = totalImprovement > 0;
  const isIndependent = lastPoint.promptLevelUsed === "independent";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-600" />
            Prompt Fading Timeline
            {targetName && <span className="font-normal text-gray-400">— {targetName}</span>}
          </CardTitle>
          {isIndependent ? (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Independent
            </span>
          ) : isImproving ? (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-50 text-blue-700">
              Fading ▲
            </span>
          ) : null}
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Dominant prompt level per session — higher = more independent
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex flex-wrap gap-3 mb-3">
          {STANDARD_HIERARCHY.map((level, i) => (
            <div key={level} className="flex items-center gap-1 text-[10px]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: LEVEL_COLORS[level] }} />
              <span className="text-gray-500">{i + 1}. {LEVEL_LABELS[level]}</span>
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis
              domain={[-0.5, STANDARD_HIERARCHY.length - 0.5]}
              ticks={STANDARD_HIERARCHY.map((_, i) => i)}
              tickFormatter={i => LEVEL_LABELS[STANDARD_HIERARCHY[i]]?.split(" ")[0] ?? ""}
              tick={{ fontSize: 9 }}
              width={52}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={STANDARD_HIERARCHY.length - 1}
              stroke="#10b981"
              strokeDasharray="4 2"
              strokeOpacity={0.5}
              label={{ value: "Goal", position: "insideTopRight", fontSize: 9, fill: "#10b981" }}
            />
            <Line
              type="stepAfter"
              dataKey="value"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={<CustomDot />}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div className="bg-gray-50 rounded-lg p-2">
            <span className="text-gray-400">Sessions tracked</span>
            <p className="font-semibold text-gray-800 mt-0.5">{data.timeline.length}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <span className="text-gray-400">Current level</span>
            <p className="font-semibold mt-0.5" style={{ color: LEVEL_COLORS[lastPoint.promptLevelUsed] ?? "#374151" }}>
              {LEVEL_LABELS[lastPoint.promptLevelUsed] ?? lastPoint.promptLevelUsed}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
