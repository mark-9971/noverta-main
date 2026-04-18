import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowUp, ArrowDown, Minus, CheckCircle2, AlertTriangle,
  TrendingUp, HelpCircle, ChevronRight, Layers,
} from "lucide-react";
import { Link } from "wouter";

const STANDARD_HIERARCHY = [
  "full_physical", "partial_physical", "model", "gestural", "verbal", "independent",
];

type FadingDirection = "independent" | "improving" | "stalled" | "regressing" | "insufficient_data";

interface PromptTarget {
  studentId: number;
  studentName: string;
  targetId: number;
  targetName: string;
  domain: string | null;
  programType: string;
  phase: string;
  currentPromptLevel: string | null;
  hierarchyIndex: number;
  hierarchyLength: number;
  promptDependenceRate: number | null;
  fadingDirection: FadingDirection;
  isStalled: boolean;
  stalledFor: number;
  sessionCount: number;
  lastSessionDate: string | null;
}

interface Summary {
  totalTargets: number;
  independent: number;
  improving: number;
  stalled: number;
  regressing: number;
  insufficientData: number;
}

const DIRECTION_CONFIG: Record<FadingDirection, {
  label: string;
  color: string;
  badge: string;
  icon: React.ElementType;
  iconColor: string;
}> = {
  independent: {
    label: "Independent",
    color: "text-emerald-700",
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: CheckCircle2,
    iconColor: "text-emerald-500",
  },
  improving: {
    label: "Fading",
    color: "text-blue-700",
    badge: "bg-blue-50 text-blue-700 border border-blue-200",
    icon: TrendingUp,
    iconColor: "text-blue-500",
  },
  stalled: {
    label: "Stalled",
    color: "text-amber-700",
    badge: "bg-amber-50 text-amber-700 border border-amber-200",
    icon: Minus,
    iconColor: "text-amber-500",
  },
  regressing: {
    label: "Regressing",
    color: "text-red-700",
    badge: "bg-red-50 text-red-700 border border-red-200",
    icon: ArrowDown,
    iconColor: "text-red-500",
  },
  insufficient_data: {
    label: "Insufficient data",
    color: "text-gray-500",
    badge: "bg-gray-50 text-gray-500 border border-gray-200",
    icon: HelpCircle,
    iconColor: "text-gray-400",
  },
};

function PromptLevelBadge({ level, hierarchyIndex, hierarchyLength }: {
  level: string | null;
  hierarchyIndex: number;
  hierarchyLength: number;
}) {
  if (!level) return <span className="text-[11px] text-gray-400">—</span>;

  const pct = hierarchyLength > 1 ? hierarchyIndex / (hierarchyLength - 1) : 0;
  const label = level.replace(/_/g, " ");

  let colorClass = "bg-red-100 text-red-700";
  if (pct >= 1) colorClass = "bg-emerald-100 text-emerald-700";
  else if (pct >= 0.7) colorClass = "bg-blue-100 text-blue-700";
  else if (pct >= 0.4) colorClass = "bg-amber-100 text-amber-700";

  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${colorClass}`}>
      {label}
    </span>
  );
}

function DirectionBadge({ dir }: { dir: FadingDirection }) {
  const cfg = DIRECTION_CONFIG[dir];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badge}`}>
      <Icon className={`w-2.5 h-2.5 ${cfg.iconColor}`} />
      {cfg.label}
    </span>
  );
}

function SummaryCard({
  label, count, sub, color, icon: Icon, iconColor, active, onClick,
}: {
  label: string; count: number; sub: string; color: string; icon: React.ElementType;
  iconColor: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-xl border transition-all ${color} ${active ? "ring-2 ring-offset-1 ring-gray-400" : "hover:shadow-sm"}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-800">{count}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
    </button>
  );
}

export default function PromptDependencePanel({ onViewStudent }: { onViewStudent?: (id: number) => void }) {
  const [targets, setTargets] = useState<PromptTarget[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | FadingDirection>("all");
  const [sort, setSort] = useState<"dependence" | "student" | "stalled">("stalled");
  const [windowDays] = useState(90);

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/aba/prompt-dependence?days=${windowDays}`)
      .then(r => r.json())
      .then(d => {
        setTargets(d.targets ?? []);
        setSummary(d.summary ?? null);
      })
      .catch(() => setError("Failed to load prompt dependence data"))
      .finally(() => setLoading(false));
  }, [windowDays]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">{error}</div>
    );
  }

  if (!summary || targets.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-8 text-center">
        <Layers className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-500">No prompt-level data in the last 90 days</p>
        <p className="text-[11px] text-gray-400 mt-1">
          Record sessions with a prompt level to see fading analytics here.
        </p>
      </div>
    );
  }

  const normalizeDir = (t: PromptTarget): FadingDirection =>
    t.isStalled && t.fadingDirection !== "independent" ? "stalled" : t.fadingDirection;

  const filtered = targets
    .filter(t => filter === "all" || normalizeDir(t) === filter)
    .sort((a, b) => {
      if (sort === "dependence") {
        return (b.promptDependenceRate ?? -1) - (a.promptDependenceRate ?? -1);
      }
      if (sort === "stalled") {
        const PRIORITY: Record<FadingDirection, number> = {
          regressing: 0, stalled: 1, improving: 2, insufficient_data: 3, independent: 4,
        };
        const pa = PRIORITY[normalizeDir(a)];
        const pb = PRIORITY[normalizeDir(b)];
        if (pa !== pb) return pa - pb;
        return b.stalledFor - a.stalledFor;
      }
      return a.studentName.localeCompare(b.studentName);
    });

  const stalledTargets = targets.filter(t => t.isStalled).length;
  const regressingTargets = targets.filter(t => t.fadingDirection === "regressing").length;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Independent"
          count={summary.independent}
          sub="All recent sessions unprompted"
          color="bg-emerald-50 border-emerald-200"
          icon={CheckCircle2}
          iconColor="text-emerald-500"
          active={filter === "independent"}
          onClick={() => setFilter(filter === "independent" ? "all" : "independent")}
        />
        <SummaryCard
          label="Fading"
          count={summary.improving}
          sub="Prompt level decreasing over time"
          color="bg-blue-50 border-blue-200"
          icon={TrendingUp}
          iconColor="text-blue-500"
          active={filter === "improving"}
          onClick={() => setFilter(filter === "improving" ? "all" : "improving")}
        />
        <SummaryCard
          label="Stalled"
          count={stalledTargets}
          sub="Same prompt level 5+ sessions"
          color="bg-amber-50 border-amber-200"
          icon={Minus}
          iconColor="text-amber-500"
          active={filter === "stalled"}
          onClick={() => setFilter(filter === "stalled" ? "all" : "stalled")}
        />
        <SummaryCard
          label="Regressing"
          count={regressingTargets}
          sub="Prompt level increasing recently"
          color={regressingTargets > 0 ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}
          icon={ArrowDown}
          iconColor={regressingTargets > 0 ? "text-red-500" : "text-gray-400"}
          active={filter === "regressing"}
          onClick={() => setFilter(filter === "regressing" ? "all" : "regressing")}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[12px] text-gray-500">
          {filter === "all" ? `${targets.length} program targets with prompt data` : `${filtered.length} of ${targets.length} targets`}
          <span className="ml-2 text-gray-400">· last {windowDays} days</span>
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">Sort:</span>
          {([
            ["stalled", "Priority"],
            ["dependence", "Dependence %"],
            ["student", "Student"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
                sort === key ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Target table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Student</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Target</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide hidden sm:table-cell">Domain</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Current Level</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide hidden md:table-cell">Prompted</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Trend</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide hidden lg:table-cell">Sessions</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const dir = normalizeDir(t);
                  const rowHighlight =
                    dir === "regressing" ? "bg-red-50/40" :
                    t.isStalled ? "bg-amber-50/30" : "";

                  return (
                    <tr key={t.targetId} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${rowHighlight}`}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-800">{t.studentName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-700 leading-tight">{t.targetName}</span>
                        {t.isStalled && (
                          <span className="ml-2 text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                            {t.stalledFor} sessions
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <span className="text-gray-400 capitalize">{t.domain ?? "—"}</span>
                      </td>
                      <td className="px-3 py-3">
                        <PromptLevelBadge
                          level={t.currentPromptLevel}
                          hierarchyIndex={t.hierarchyIndex}
                          hierarchyLength={t.hierarchyLength}
                        />
                      </td>
                      <td className="px-3 py-3 text-right hidden md:table-cell">
                        {t.promptDependenceRate !== null ? (
                          <span className={`font-semibold ${
                            t.promptDependenceRate >= 80 ? "text-red-600" :
                            t.promptDependenceRate >= 50 ? "text-amber-600" :
                            t.promptDependenceRate <= 10 ? "text-emerald-600" : "text-gray-700"
                          }`}>
                            {t.promptDependenceRate}%
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <DirectionBadge dir={dir} />
                      </td>
                      <td className="px-3 py-3 text-right text-gray-400 hidden lg:table-cell">
                        {t.sessionCount}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {onViewStudent ? (
                          <button
                            onClick={() => onViewStudent(t.studentId)}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5 ml-auto px-1.5 py-0.5 rounded hover:bg-indigo-50 transition-colors"
                          >
                            View <ChevronRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <Link href={`/students/${t.studentId}`}>
                            <button className="text-[10px] text-emerald-700 hover:text-emerald-900 font-medium flex items-center gap-0.5 ml-auto">
                              View <ChevronRight className="w-3 h-3" />
                            </button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                      No targets match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Footnote on calculation */}
      <p className="text-[10px] text-gray-400 leading-relaxed px-1">
        <strong>Trend</strong> — based on the direction of prompt level change over the last {windowDays} days.{" "}
        <strong>Stalled</strong> — same prompt level recorded 5 or more consecutive sessions, excluding "independent".{" "}
        <strong>Prompted %</strong> — avg of (prompted trials / total trials) per session; shown as "—" when not recorded.
      </p>
    </div>
  );
}
