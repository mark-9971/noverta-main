import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Bell, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPost } from "@/lib/api";

type Volume = "low" | "medium" | "high";
type SeverityMix = "calm" | "mixed" | "crisis";
type Backlog = "low" | "medium" | "high";

interface TunerResponse {
  ok: boolean;
  target: Volume;
  severityMix: SeverityMix;
  ageBucketDays: number;
  before: number;
  after: number;
  resolved: number;
  inserted: number;
  mix: { high: number; medium: number; low: number; over7d: number };
}

const BACKLOG_DAYS: Record<Backlog, number> = { low: 0, medium: 7, high: 21 };

const VOLUME_LABEL: Record<Volume, string> = {
  low: "Low (~5 open)",
  medium: "Medium (~18 open)",
  high: "High (~40 open)",
};
const SEVERITY_LABEL: Record<SeverityMix, string> = {
  calm: "Calm",
  mixed: "Mixed",
  crisis: "Crisis",
};
const BACKLOG_LABEL: Record<Backlog, string> = {
  low: "Fresh (today)",
  medium: "1 week",
  high: "3 weeks",
};

function ButtonRow(props: {
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  testIdPrefix: string;
}) {
  const { options, value, onChange, testIdPrefix } = props;
  return (
    <div className="flex gap-1" role="radiogroup">
      {options.map(opt => (
        <button
          key={opt.v}
          type="button"
          role="radio"
          aria-checked={value === opt.v}
          onClick={() => onChange(opt.v)}
          data-testid={`${testIdPrefix}-${opt.v}`}
          className={`flex-1 text-[11px] font-medium px-2 py-1.5 rounded border transition-colors ${
            value === opt.v
              ? "bg-emerald-600 border-emerald-600 text-white"
              : "bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function AlertTunerPanel({ districtId }: { districtId: number }) {
  const queryClient = useQueryClient();
  const [volume, setVolume] = useState<Volume>("medium");
  const [severity, setSeverity] = useState<SeverityMix>("mixed");
  const [backlog, setBacklog] = useState<Backlog>("medium");
  const [lastResult, setLastResult] = useState<TunerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<TunerResponse>("/api/demo-control/alert-density", {
        districtId,
        target: volume,
        severityMix: severity,
        ageBucketDays: BACKLOG_DAYS[backlog],
      }),
    onSuccess: (res) => {
      setLastResult(res);
      setError(null);
      // Refresh anything that surfaces alert counts.
      queryClient.invalidateQueries({ queryKey: ["demo-control", "readiness"] });
      queryClient.invalidateQueries({ queryKey: ["demo-control", "data-health"] });
      queryClient.invalidateQueries({ queryKey: ["demo-control", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to tune alerts");
    },
  });

  return (
    <Card data-testid="demo-control-slot-11">
      <CardHeader className="py-3 bg-gray-50 border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-[10px] text-white">11</span>
          <Bell className="w-4 h-4 text-blue-600" />
          <span>Alert density tuner</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        <p className="text-[11px] text-gray-500">
          Re-shape the open alert pool for this demo district. Only touches alert volume,
          severity, and backlog age — never students, services, or sessions.
        </p>

        <div>
          <div className="text-[11px] font-semibold text-gray-700 mb-1">Volume</div>
          <ButtonRow
            options={(["low", "medium", "high"] as Volume[]).map(v => ({ v, label: VOLUME_LABEL[v] }))}
            value={volume}
            onChange={(v) => setVolume(v as Volume)}
            testIdPrefix="alert-tuner-volume"
          />
        </div>
        <div>
          <div className="text-[11px] font-semibold text-gray-700 mb-1">Severity mix</div>
          <ButtonRow
            options={(["calm", "mixed", "crisis"] as SeverityMix[]).map(v => ({ v, label: SEVERITY_LABEL[v] }))}
            value={severity}
            onChange={(v) => setSeverity(v as SeverityMix)}
            testIdPrefix="alert-tuner-severity"
          />
        </div>
        <div>
          <div className="text-[11px] font-semibold text-gray-700 mb-1">Documentation backlog</div>
          <ButtonRow
            options={(["low", "medium", "high"] as Backlog[]).map(v => ({ v, label: BACKLOG_LABEL[v] }))}
            value={backlog}
            onChange={(v) => setBacklog(v as Backlog)}
            testIdPrefix="alert-tuner-backlog"
          />
        </div>

        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="alert-tuner-apply"
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[12px] font-semibold rounded"
        >
          {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Apply tuning
        </button>

        {error && (
          <div className="flex items-start gap-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {lastResult && !error && (
          <div className="text-[11px] text-gray-700 bg-gray-50 border border-gray-200 rounded p-2 space-y-0.5" data-testid="alert-tuner-result">
            <div>
              <span className="text-gray-500">Open alerts:</span>{" "}
              <span className="font-semibold">{lastResult.before} → {lastResult.after}</span>
              {lastResult.inserted > 0 && <span className="text-emerald-700"> · +{lastResult.inserted} added</span>}
              {lastResult.resolved > 0 && <span className="text-amber-700"> · {lastResult.resolved} resolved</span>}
            </div>
            <div className="text-gray-500">
              Severity now — high {lastResult.mix.high} · medium {lastResult.mix.medium} · low {lastResult.mix.low}
              {" · "}
              {lastResult.mix.over7d} older than 7 days
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
