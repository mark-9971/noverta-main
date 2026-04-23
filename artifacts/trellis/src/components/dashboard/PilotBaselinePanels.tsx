import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Activity, Lock, TrendingDown, TrendingUp, Minus, FileDown } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface BaselineMetrics {
  capturedAt: string;
  compliancePercent: number | null;
  exposureDollars: number;
  compEdMinutesOutstanding: number;
  overdueEvaluations: number;
  expiringIepsNext60: number;
}

interface CurrentMetrics {
  generatedAt: string;
  compliancePercent: number | null;
  exposureDollars: number;
  compEdMinutesOutstanding: number;
  overdueEvaluations: number;
  expiringIepsNext60: number;
}

interface ComparisonResponse {
  baseline: BaselineMetrics | null;
  current: CurrentMetrics;
}

type MetricKey =
  | "compliancePercent"
  | "exposureDollars"
  | "compEdMinutesOutstanding"
  | "overdueEvaluations"
  | "expiringIepsNext60";

interface MetricSpec {
  key: MetricKey;
  label: string;
  /** When true, a smaller value means improvement (e.g. exposure $). */
  lowerIsBetter: boolean;
  format: (v: number | null) => string;
}

const METRICS: MetricSpec[] = [
  {
    key: "compliancePercent",
    label: "Service-minute compliance",
    lowerIsBetter: false,
    format: (v) => (v == null ? "—" : `${v}%`),
  },
  {
    key: "exposureDollars",
    label: "Exposure (last 30 days)",
    lowerIsBetter: true,
    format: (v) => (v == null ? "—" : formatMoney(Number(v))),
  },
  {
    key: "compEdMinutesOutstanding",
    label: "Comp-ed minutes outstanding",
    lowerIsBetter: true,
    format: (v) => (v == null ? "—" : `${Number(v).toLocaleString()} min`),
  },
  {
    key: "overdueEvaluations",
    label: "Overdue evaluations",
    lowerIsBetter: true,
    format: (v) => (v == null ? "—" : `${v}`),
  },
  {
    key: "expiringIepsNext60",
    label: "IEPs expiring in 60 days",
    lowerIsBetter: true,
    format: (v) => (v == null ? "—" : `${v}`),
  },
];

function formatMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function PilotBaselinePanels() {
  const { data, isLoading, isError } = useQuery<ComparisonResponse>({
    queryKey: ["pilot/baseline/comparison"],
    queryFn: async () => {
      const r = await authFetch("/api/pilot/baseline/comparison");
      if (!r.ok) throw new Error("baseline comparison failed");
      return r.json();
    },
    staleTime: 5 * 60_000,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    return METRICS.map((m) => {
      const baseline = data.baseline?.[m.key] ?? null;
      const current = data.current[m.key] ?? null;
      const delta = baseline != null && current != null ? Number(current) - Number(baseline) : null;
      const improved =
        delta == null
          ? null
          : delta === 0
            ? "flat"
            : m.lowerIsBetter
              ? delta < 0
                ? "up"
                : "down"
              : delta > 0
                ? "up"
                : "down";
      return { spec: m, baseline, current, delta, improved };
    });
  }, [data]);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm">
        <div className="h-5 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-gray-50 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (isError || !data) return null;
  if (!data.baseline) return null;

  const baselineDate = formatDate(data.baseline.capturedAt);

  return (
    <div className="space-y-4">
      <section
        className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 md:p-6 shadow-sm"
        data-testid="section-pilot-baseline"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 uppercase tracking-wide">
              <Lock className="w-3.5 h-3.5" /> Day 0 baseline
            </div>
            <h2 className="text-base font-semibold text-gray-900 mt-1">Pre-Noverta snapshot</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Captured {baselineDate} · immutable · used by the Pilot Readout to compute ROI
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          {METRICS.map((m) => (
            <div
              key={m.key}
              className="rounded-lg border border-indigo-100 bg-white px-3 py-2.5"
              data-testid={`baseline-${m.key}`}
            >
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide leading-tight">
                {m.label}
              </div>
              <div className="text-xl font-bold text-gray-900 tabular-nums mt-1">
                {m.format(data.baseline![m.key])}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm"
        data-testid="section-pilot-baseline-comparison"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <Activity className="w-3.5 h-3.5" /> Current vs. baseline
            </div>
            <h2 className="text-base font-semibold text-gray-900 mt-1">Pilot progress to date</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Refreshed daily · compares today's numbers to the {baselineDate} baseline
            </p>
          </div>
          <PilotReadoutButton />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3 font-medium">Metric</th>
                <th className="py-2 px-3 font-medium text-right">Day 0</th>
                <th className="py-2 px-3 font-medium text-right">Today</th>
                <th className="py-2 pl-3 font-medium text-right">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ spec, baseline, current, delta, improved }) => {
                const tone =
                  improved === "up"
                    ? "text-emerald-700"
                    : improved === "down"
                      ? "text-red-600"
                      : "text-gray-400";
                const Icon =
                  improved === "up" ? TrendingUp : improved === "down" ? TrendingDown : Minus;
                return (
                  <tr key={spec.key} data-testid={`compare-row-${spec.key}`}>
                    <td className="py-2.5 pr-3 text-gray-700">{spec.label}</td>
                    <td className="py-2.5 px-3 text-right text-gray-500 tabular-nums">
                      {spec.format(baseline)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-gray-900 tabular-nums">
                      {spec.format(current)}
                    </td>
                    <td className={`py-2.5 pl-3 text-right tabular-nums ${tone}`}>
                      {delta == null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 justify-end">
                          <Icon className="w-3.5 h-3.5" />
                          {formatDelta(spec, delta)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

interface PilotReadoutButtonProps {
  // Optional override for platform-admin / internal-support callers who need to
  // generate a readout for a district they aren't tenant-scoped to. District
  // admins/coordinators can omit this — the backend uses their tenant scope.
  districtId?: number;
}

export function PilotReadoutButton({ districtId }: PilotReadoutButtonProps = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const requestUrl =
        districtId != null
          ? `/api/reports/exports/pilot-readout.pdf?districtId=${districtId}`
          : "/api/reports/exports/pilot-readout.pdf";
      const res = await authFetch(requestUrl);
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || `Failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pilot-readout-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Open in a new tab so the AM can review immediately
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate readout");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        data-testid="button-generate-pilot-readout"
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <FileDown className="w-3.5 h-3.5" />
        {busy ? "Generating…" : "Generate Pilot Readout"}
      </button>
      {error && (
        <span className="text-[11px] text-red-600" data-testid="text-pilot-readout-error">
          {error}
        </span>
      )}
    </div>
  );
}

function formatDelta(spec: MetricSpec, delta: number): string {
  if (delta === 0) return "no change";
  const sign = delta > 0 ? "+" : "−";
  const mag = Math.abs(delta);
  if (spec.key === "compliancePercent") return `${sign}${mag} pts`;
  if (spec.key === "exposureDollars") return `${sign}${formatMoney(mag).replace(/^\$/, "$")}`;
  if (spec.key === "compEdMinutesOutstanding") return `${sign}${mag.toLocaleString()} min`;
  return `${sign}${mag}`;
}
