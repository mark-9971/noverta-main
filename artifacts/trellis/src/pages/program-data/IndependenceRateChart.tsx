import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, AlertCircle, Activity } from "lucide-react";

interface SessionRate {
  sessionDate: string;
  trialsTotal: number;
  independentTrials: number;
  independenceRate: number;
}

interface IndependenceRateData {
  sessions: SessionRate[];
  targetId: number;
  trend: "improving" | "stable" | "regressing" | "insufficient_data";
  recentAvg: number | null;
}

function formatDate(d: string) {
  const [, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}`;
}

const MASTERY_LINE = 80;

function zoneColor(rate: number) {
  if (rate >= MASTERY_LINE) return "#10b981";
  if (rate >= 50) return "#f59e0b";
  return "#ef4444";
}

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const color = zoneColor(payload?.independenceRate ?? 0);
  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />;
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as SessionRate;
  if (!d) return null;
  const color = zoneColor(d.independenceRate);
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm text-xs min-w-[160px]">
      <p className="text-gray-400 mb-1">{d.sessionDate}</p>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="font-bold text-gray-900" style={{ color }}>{d.independenceRate}% independent</span>
      </div>
      <p className="text-gray-400">{d.independentTrials} / {d.trialsTotal} trials unprompted</p>
    </div>
  );
};

const TREND_CONFIG = {
  improving:          { label: "Improving", icon: TrendingUp,  cls: "text-emerald-700 bg-emerald-50" },
  stable:             { label: "Stable",    icon: Minus,        cls: "text-amber-700 bg-amber-50" },
  regressing:         { label: "Regressing", icon: TrendingDown, cls: "text-red-700 bg-red-50" },
  insufficient_data:  { label: "Not enough data", icon: AlertCircle, cls: "text-gray-500 bg-gray-50" },
};

export function IndependenceRateChart({
  targetId,
  targetName,
  masteryCriterionPercent,
}: {
  targetId: number;
  targetName?: string;
  masteryCriterionPercent?: number;
}) {
  const [data, setData] = useState<IndependenceRateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const masteryPct = masteryCriterionPercent ?? MASTERY_LINE;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    authFetch(`/api/program-targets/${targetId}/independence-rate`)
      .then(r => r.json())
      .then((d: IndependenceRateData) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [targetId]);

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 flex items-center gap-2 text-sm text-gray-400">
        <AlertCircle className="w-4 h-4" /> Failed to load independence rate data.
      </div>
    );
  }

  if (!data || data.sessions.length === 0) {
    return (
      <div className="py-6 text-center">
        <Activity className="w-6 h-6 text-gray-300 mx-auto mb-2" />
        <p className="text-xs text-gray-400">No session data recorded yet.</p>
        <p className="text-[11px] text-gray-300 mt-0.5">Log sessions with trial counts to track independence here.</p>
      </div>
    );
  }

  const chartData = data.sessions.map(s => ({
    ...s,
    label: formatDate(s.sessionDate),
  }));

  const trendCfg = TREND_CONFIG[data.trend];
  const TrendIcon = trendCfg.icon;
  const lastSession = data.sessions[data.sessions.length - 1];
  const atMastery = (data.recentAvg ?? 0) >= masteryPct;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-violet-600" />
            <span className="text-sm font-semibold text-gray-700">Prompt Fading</span>
            {targetName && <span className="text-[11px] text-gray-400">— {targetName}</span>}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5 ml-5">
            % of trials completed without a prompt · target ≥{masteryPct}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.recentAvg !== null && (
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg ${atMastery ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
              Avg (last 3): {data.recentAvg}%
            </span>
          )}
          <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 ${trendCfg.cls}`}>
            <TrendIcon className="w-3 h-3" /> {trendCfg.label}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={`irGrad-${targetId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={v => `${v}%`}
            tick={{ fontSize: 9 }}
            width={36}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={masteryPct}
            stroke="#10b981"
            strokeDasharray="4 2"
            strokeOpacity={0.6}
            label={{ value: `${masteryPct}% target`, position: "insideTopRight", fontSize: 9, fill: "#10b981" }}
          />
          <Area
            type="monotone"
            dataKey="independenceRate"
            stroke="#8b5cf6"
            strokeWidth={2}
            fill={`url(#irGrad-${targetId})`}
            dot={<CustomDot />}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-gray-50 rounded-lg p-2">
          <span className="text-gray-400 block">Sessions</span>
          <p className="font-semibold text-gray-800 mt-0.5">{data.sessions.length}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <span className="text-gray-400 block">Latest</span>
          <p className="font-semibold mt-0.5" style={{ color: zoneColor(lastSession.independenceRate) }}>
            {lastSession.independenceRate}%
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <span className="text-gray-400 block">Trend</span>
          <div className="flex items-center gap-1 mt-0.5">
            <TrendIcon className={`w-3 h-3 ${trendCfg.cls.split(" ")[0]}`} />
            <p className={`font-semibold ${trendCfg.cls.split(" ")[0]}`}>{trendCfg.label}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> ≥{masteryPct}% mastery zone</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 50–{masteryPct - 1}% in progress</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> &lt;50% needs attention</span>
      </div>
    </div>
  );
}
