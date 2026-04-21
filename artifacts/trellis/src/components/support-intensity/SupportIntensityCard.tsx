/**
 * SupportIntensityCard
 *
 * Displays a student's transparent, additive support-intensity score computed
 * server-side from documented restraint incidents, BIP complexity, behavior
 * reduction targets, prompt dependency, and clinical assessment depth.
 *
 * Intentionally non-alarming in color and language — this is a clinical
 * summary tool for BCBAs and supervisors, not a risk-alert widget.
 */

import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  Brain,
  Target,
  BarChart3,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ScoreContributor {
  domain: string;
  label: string;
  points: number;
  maxPoints: number;
  signals: string[];
}

interface DataAvailabilityFlag {
  field: string;
  available: boolean;
  note: string;
}

interface SupportIntensityResult {
  studentId: number;
  generatedAt: string;
  score: number;
  level: "low" | "moderate" | "high" | "very_high";
  levelLabel: string;
  levelDescription: string;
  contributors: ScoreContributor[];
  dataAvailability: DataAvailabilityFlag[];
  limitations: string[];
}

const LEVEL_STYLES = {
  low: {
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
    bar: "bg-emerald-500",
    ring: "ring-emerald-200",
    scoreText: "text-emerald-700",
  },
  moderate: {
    badge: "bg-amber-50 text-amber-800 border-amber-200",
    bar: "bg-amber-400",
    ring: "ring-amber-200",
    scoreText: "text-amber-700",
  },
  high: {
    badge: "bg-orange-50 text-orange-800 border-orange-200",
    bar: "bg-orange-500",
    ring: "ring-orange-200",
    scoreText: "text-orange-700",
  },
  very_high: {
    badge: "bg-rose-50 text-rose-800 border-rose-200",
    bar: "bg-rose-500",
    ring: "ring-rose-200",
    scoreText: "text-rose-700",
  },
};

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  restraint: <ShieldAlert className="w-3.5 h-3.5" />,
  bip: <ClipboardList className="w-3.5 h-3.5" />,
  reduction_targets: <Target className="w-3.5 h-3.5" />,
  prompt_dependency: <Brain className="w-3.5 h-3.5" />,
  assessment_depth: <BarChart3 className="w-3.5 h-3.5" />,
};

function ContributorRow({ c, levelStyle }: { c: ScoreContributor; levelStyle: typeof LEVEL_STYLES["low"] }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round((c.points / c.maxPoints) * 100);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="w-full text-left group"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 min-w-0">
            <span className="text-gray-400 flex-shrink-0">{DOMAIN_ICONS[c.domain]}</span>
            <span className="truncate">{c.label}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-500 tabular-nums">{c.points} / {c.maxPoints}</span>
            {open ? (
              <ChevronUp className="w-3 h-3 text-gray-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-gray-400" />
            )}
          </div>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", levelStyle.bar)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>
      {open && (
        <ul className="pl-5 space-y-0.5">
          {c.signals.map((sig, i) => (
            <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
              <span className="mt-0.5 flex-shrink-0 text-gray-400">•</span>
              <span>{sig}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SupportIntensityCard({ studentId }: { studentId: number }) {
  const [data, setData] = useState<SupportIntensityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showData, setShowData] = useState(false);
  const [showLimitations, setShowLimitations] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    setError(null);

    authFetch(`/api/students/${studentId}/support-intensity`)
      .then((r: any) => r.json())
      .then((d: SupportIntensityResult) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("Unable to load support intensity score");
        setLoading(false);
      });
  }, [studentId]);

  if (loading) {
    return (
      <Card className="border-gray-100">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  const styles = LEVEL_STYLES[data.level];
  const availableCount = data.dataAvailability.filter(f => f.available).length;
  const totalFields = data.dataAvailability.length;

  return (
    <Card className="border-gray-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-400" />
          Support Intensity
          <span className="ml-auto">
            <Badge variant="outline" className={cn("text-[10px] font-normal", styles.badge)}>
              {data.levelLabel}
            </Badge>
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Score + description row */}
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex-shrink-0 w-16 h-16 rounded-xl ring-2 flex flex-col items-center justify-center",
              styles.ring,
            )}
          >
            <span className={cn("text-2xl font-bold tabular-nums leading-none", styles.scoreText)}>
              {data.score}
            </span>
            <span className="text-[10px] text-gray-400 mt-0.5">/ 100</span>
          </div>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm text-gray-700 leading-snug">{data.levelDescription}</p>
            <p className="text-xs text-gray-400 mt-1">
              Data coverage: {availableCount} of {totalFields} signal areas documented
            </p>
          </div>
        </div>

        {/* Domain contributors */}
        <div className="space-y-3 pt-1">
          {data.contributors.map(c => (
            <ContributorRow key={c.domain} c={c} levelStyle={styles} />
          ))}
        </div>

        {/* Data availability */}
        <div className="border-t border-gray-50 pt-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 w-full"
            onClick={() => setShowData(v => !v)}
          >
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            Data availability ({availableCount}/{totalFields} fields documented)
            {showData ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
          {showData && (
            <ul className="mt-2 space-y-1.5">
              {data.dataAvailability.map(f => (
                <li key={f.field} className="flex items-start gap-2">
                  {f.available ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <span className={cn("text-xs font-medium", f.available ? "text-gray-700" : "text-gray-400")}>
                      {f.field}
                    </span>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{f.note}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Limitations */}
        <div className="border-t border-gray-50 pt-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 w-full"
            onClick={() => setShowLimitations(v => !v)}
          >
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Score limitations & calibration notes
            {showLimitations ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
          {showLimitations && (
            <ul className="mt-2 space-y-1.5 pl-1">
              {data.limitations.map((lim, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-500 leading-snug">
                  <span className="text-gray-300 flex-shrink-0 mt-0.5">•</span>
                  <span>{lim}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SupportIntensityCard;
