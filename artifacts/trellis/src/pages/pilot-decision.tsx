import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { apiGet, apiPost } from "@/lib/api";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  ChevronRight,
  XCircle,
  MessageSquareText,
  LogIn,
} from "lucide-react";

type Outcome = "renew" | "request_changes" | "decline";

interface MetricRow {
  compliancePercent: number | null;
  exposureDollars: number;
  compEdMinutesOutstanding: number;
  overdueEvaluations: number;
  expiringIepsNext60: number;
}

interface ContractPreview {
  tier: string;
  planName: string;
  description: string | null;
  seats: number;
  currentStaffCount: number;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  billingCycle: "monthly" | "yearly";
  termPriceCents: number;
  termLengthMonths: number;
  source: "subscription_plan" | "fallback";
}

interface DecisionPayload {
  outcome: Outcome;
  reasonNote: string | null;
  surveyResponses: Record<string, unknown>;
  decidedByName: string | null;
  createdAt: string;
}

interface PilotDecisionStatus {
  districtId: number;
  districtName: string;
  isPilot: boolean;
  pilotStartedAt: string | null;
  pilotLengthDays: number;
  decisionWindowOpensDay: number;
  dayInPilot: number | null;
  decisionWindowOpen: boolean;
  showBanner: boolean;
  decision: DecisionPayload | null;
  roi: {
    capturedAt: string | null;
    baseline: MetricRow | null;
    current: MetricRow;
  };
  contractPreview: ContractPreview | null;
}

interface SurveyQuestion {
  id: string;
  prompt: string;
  type: "rating" | "text";
  helper?: string;
}

const SURVEY: SurveyQuestion[] = [
  {
    id: "value",
    prompt: "How much value did Noverta deliver for your team during the pilot?",
    type: "rating",
    helper: "1 = no value, 5 = transformative",
  },
  {
    id: "compliance_confidence",
    prompt: "How confident are you in your district's IEP compliance posture today vs. when the pilot started?",
    type: "rating",
    helper: "1 = no change, 5 = significantly more confident",
  },
  {
    id: "friction",
    prompt: "What was the biggest source of friction during the pilot?",
    type: "text",
  },
  {
    id: "must_haves",
    prompt: "What are your top 1-2 must-haves for renewal?",
    type: "text",
  },
];

const RATING_OPTIONS = [1, 2, 3, 4, 5];

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}
function fmtDollars(dollars: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(dollars);
}
function fmtMinutes(min: number): string {
  if (min === 0) return "0 min";
  if (min < 60) return `${min} min`;
  const hours = Math.round((min / 60) * 10) / 10;
  return `${hours} hr`;
}

function deltaTone(baseline: number | null, current: number, lowerIsBetter: boolean) {
  if (baseline == null) return null;
  if (current === baseline) return { tone: "neutral" as const, label: "no change" };
  const better = lowerIsBetter ? current < baseline : current > baseline;
  const diff = current - baseline;
  const sign = diff > 0 ? "+" : "";
  return { tone: better ? ("good" as const) : ("bad" as const), label: `${sign}${diff}` };
}

export default function PilotDecisionPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<PilotDecisionStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [reasonNote, setReasonNote] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    apiGet<PilotDecisionStatus>("/pilot/decision/status")
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  const readOnly = useMemo(() => Boolean(status?.decision), [status]);
  const canSubmit = useMemo(() => {
    if (!outcome) return false;
    if ((outcome === "request_changes" || outcome === "decline") && reasonNote.trim().length === 0) return false;
    return true;
  }, [outcome, reasonNote]);

  if (isLoaded && !isSignedIn) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-4">
            <LogIn className="w-5 h-5 text-emerald-700" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Sign in to access the pilot decision</h1>
          <a
            href="/sign-in?redirect_url=/pilot-decision"
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load pilot decision page: {loadError}
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="p-12 flex items-center justify-center text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  if (!status.isPilot) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-gray-900">Pilot Decision</h1>
          <p className="text-sm text-gray-600 mt-2">
            This page is only available to districts in an active pilot. Your district isn't currently in pilot mode.
          </p>
        </div>
      </div>
    );
  }

  if (!status.decisionWindowOpen && !status.decision) {
    const remaining =
      status.dayInPilot != null
        ? Math.max(0, status.decisionWindowOpensDay - status.dayInPilot)
        : null;
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <h1 className="text-lg font-semibold text-gray-900">Pilot Decision (not yet open)</h1>
          </div>
          <p className="text-sm text-gray-600 mt-3">
            The renewal decision opens at day {status.decisionWindowOpensDay} of your {status.pilotLengthDays}-day pilot.
            {remaining != null ? ` ${remaining} days to go.` : ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-emerald-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Pilot Decision</h1>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          You're on day {status.dayInPilot ?? "—"} of your {status.pilotLengthDays}-day pilot for{" "}
          <strong>{status.districtName}</strong>. Review what changed, share quick feedback, and choose how
          to proceed.
        </p>
      </header>

      {status.decision && (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3"
          data-testid="pilot-decision-recorded"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
          <div className="text-sm text-emerald-900">
            <div className="font-medium">
              Decision recorded: {labelForOutcome(status.decision.outcome)}
            </div>
            <div className="text-emerald-800 mt-1">
              Submitted {new Date(status.decision.createdAt).toLocaleString()}
              {status.decision.decidedByName ? ` by ${status.decision.decidedByName}` : ""}.
              {status.decision.outcome === "renew" ? (
                <>
                  {" "}
                  <a className="underline" href="/billing">
                    Continue to billing
                  </a>
                  .
                </>
              ) : null}
            </div>
            {status.decision.reasonNote ? (
              <div className="mt-2 italic">"{status.decision.reasonNote}"</div>
            ) : null}
          </div>
        </div>
      )}

      <RoiPanel roi={status.roi} />

      <ContractPanel preview={status.contractPreview} />

      <SurveyPanel
        responses={responses}
        setResponses={setResponses}
        readOnly={readOnly}
        existing={status.decision?.surveyResponses ?? null}
      />

      <OutcomePanel
        outcome={outcome}
        setOutcome={setOutcome}
        reasonNote={reasonNote}
        setReasonNote={setReasonNote}
        readOnly={readOnly}
        existingOutcome={status.decision?.outcome ?? null}
      />

      {!readOnly && (
        <div className="flex flex-col gap-3">
          {submitError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {submitError}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={async () => {
                if (!outcome) return;
                setSubmitError(null);
                setSubmitting(true);
                try {
                  await apiPost("/pilot/decision", {
                    outcome,
                    reasonNote: reasonNote.trim() || undefined,
                    surveyResponses: responses,
                  });
                  // Re-fetch so the page renders the read-only confirmation.
                  const fresh = await apiGet<PilotDecisionStatus>("/pilot/decision/status");
                  setStatus(fresh);
                  if (outcome === "renew") {
                    // Take admins straight to checkout for renew.
                    setTimeout(() => navigate("/billing"), 600);
                  }
                } catch (err) {
                  setSubmitError(err instanceof Error ? err.message : "Failed to submit");
                } finally {
                  setSubmitting(false);
                }
              }}
              data-testid="submit-pilot-decision"
              className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              Submit decision
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function labelForOutcome(o: Outcome): string {
  return o === "renew" ? "Renew now" : o === "request_changes" ? "Request changes" : "Decline";
}

function RoiPanel({ roi }: { roi: PilotDecisionStatus["roi"] }) {
  const b = roi.baseline;
  const c = roi.current;
  const rows: Array<{
    label: string;
    baseline: string;
    current: string;
    deltaText: string | null;
    tone: "good" | "bad" | "neutral" | null;
  }> = [
    {
      label: "Compliance %",
      baseline: b?.compliancePercent != null ? `${b.compliancePercent}%` : "—",
      current: c.compliancePercent != null ? `${c.compliancePercent}%` : "—",
      ...labelDelta(b?.compliancePercent ?? null, c.compliancePercent ?? null, false, "%"),
    },
    {
      label: "Exposure (projected $)",
      baseline: b ? fmtDollars(b.exposureDollars) : "—",
      current: fmtDollars(c.exposureDollars),
      ...labelDelta(b?.exposureDollars ?? null, c.exposureDollars, true, "$"),
    },
    {
      label: "Comp-ed minutes outstanding",
      baseline: b ? fmtMinutes(b.compEdMinutesOutstanding) : "—",
      current: fmtMinutes(c.compEdMinutesOutstanding),
      ...labelDelta(b?.compEdMinutesOutstanding ?? null, c.compEdMinutesOutstanding, true, ""),
    },
    {
      label: "Overdue evaluations",
      baseline: b ? String(b.overdueEvaluations) : "—",
      current: String(c.overdueEvaluations),
      ...labelDelta(b?.overdueEvaluations ?? null, c.overdueEvaluations, true, ""),
    },
    {
      label: "IEPs expiring in next 60 days",
      baseline: b ? String(b.expiringIepsNext60) : "—",
      current: String(c.expiringIepsNext60),
      ...labelDelta(b?.expiringIepsNext60 ?? null, c.expiringIepsNext60, true, ""),
    },
  ];

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white"
      data-testid="pilot-decision-roi"
    >
      <header className="px-5 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">Headline ROI vs. day 0</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Baseline captured{" "}
          {roi.capturedAt ? new Date(roi.capturedAt).toLocaleDateString() : "at pilot kickoff"}.
        </p>
      </header>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => (
          <div key={r.label} className="px-5 py-3 flex items-center justify-between gap-4">
            <div className="text-sm text-gray-700">{r.label}</div>
            <div className="flex items-center gap-6">
              <div className="text-sm text-gray-500 w-28 text-right">Day 0: {r.baseline}</div>
              <div className="text-sm font-semibold text-gray-900 w-28 text-right">Today: {r.current}</div>
              <div className="w-24 text-right">
                {r.deltaText ? (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                      r.tone === "good"
                        ? "bg-emerald-100 text-emerald-800"
                        : r.tone === "bad"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {r.tone === "good" ? (
                      <TrendingDown className="w-3 h-3" />
                    ) : r.tone === "bad" ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : null}
                    {r.deltaText}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function labelDelta(
  baseline: number | null,
  current: number | null,
  lowerIsBetter: boolean,
  unit: "%" | "$" | "",
): { deltaText: string | null; tone: "good" | "bad" | "neutral" | null } {
  if (baseline == null || current == null) return { deltaText: null, tone: null };
  const diff = current - baseline;
  if (diff === 0) return { deltaText: "no change", tone: "neutral" };
  const sign = diff > 0 ? "+" : "";
  let display: string;
  if (unit === "$") display = `${sign}${fmtDollars(diff)}`;
  else if (unit === "%") display = `${sign}${diff} pts`;
  else display = `${sign}${diff}`;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  return { deltaText: display, tone: better ? "good" : "bad" };
}

function ContractPanel({ preview }: { preview: ContractPreview | null }) {
  if (!preview) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Renewal contract preview</h2>
        <p className="text-sm text-gray-500 mt-2">No active plan configured. Contact your account manager for a quote.</p>
      </section>
    );
  }
  const monthly = fmtMoney(preview.monthlyPriceCents);
  const annual = fmtMoney(preview.termPriceCents);
  return (
    <section
      className="rounded-lg border border-gray-200 bg-white"
      data-testid="pilot-decision-contract"
    >
      <header className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Renewal contract preview</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pulled from your current plan ({preview.tier}). Final terms confirmed at billing checkout.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800">
          {preview.planName}
        </span>
      </header>
      <dl className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-gray-100">
        <div className="p-4">
          <dt className="text-xs text-gray-500">Term</dt>
          <dd className="text-sm font-semibold text-gray-900 mt-1">{preview.termLengthMonths} months</dd>
        </div>
        <div className="p-4">
          <dt className="text-xs text-gray-500">Seats</dt>
          <dd className="text-sm font-semibold text-gray-900 mt-1">
            {preview.seats}
            <span className="text-xs text-gray-500 font-normal"> ({preview.currentStaffCount} active staff)</span>
          </dd>
        </div>
        <div className="p-4">
          <dt className="text-xs text-gray-500">Monthly</dt>
          <dd className="text-sm font-semibold text-gray-900 mt-1">{monthly}</dd>
        </div>
        <div className="p-4">
          <dt className="text-xs text-gray-500">Annual total</dt>
          <dd className="text-sm font-semibold text-gray-900 mt-1">{annual}</dd>
        </div>
      </dl>
    </section>
  );
}

function SurveyPanel({
  responses,
  setResponses,
  readOnly,
  existing,
}: {
  responses: Record<string, string>;
  setResponses: (r: Record<string, string>) => void;
  readOnly: boolean;
  existing: Record<string, unknown> | null;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white" data-testid="pilot-decision-survey">
      <header className="px-5 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <MessageSquareText className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Quick exit survey</h2>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">A few questions help your account manager respond faster.</p>
      </header>
      <div className="p-5 space-y-5">
        {SURVEY.map((q) => {
          const value =
            (readOnly && existing ? (existing[q.id] as string | undefined) : responses[q.id]) ?? "";
          return (
            <div key={q.id}>
              <label className="block text-sm font-medium text-gray-800">{q.prompt}</label>
              {q.helper && <p className="text-xs text-gray-500 mt-0.5">{q.helper}</p>}
              {q.type === "rating" ? (
                <div className="mt-2 flex items-center gap-2">
                  {RATING_OPTIONS.map((r) => (
                    <button
                      type="button"
                      key={r}
                      disabled={readOnly}
                      onClick={() => setResponses({ ...responses, [q.id]: String(r) })}
                      data-testid={`survey-${q.id}-rating-${r}`}
                      className={`w-9 h-9 rounded-md border text-sm font-medium ${
                        value === String(r)
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-gray-300 text-gray-700 hover:border-gray-400"
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  value={value}
                  onChange={(e) => setResponses({ ...responses, [q.id]: e.target.value })}
                  disabled={readOnly}
                  rows={3}
                  data-testid={`survey-${q.id}-text`}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  placeholder="Type your answer..."
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OutcomePanel({
  outcome,
  setOutcome,
  reasonNote,
  setReasonNote,
  readOnly,
  existingOutcome,
}: {
  outcome: Outcome | null;
  setOutcome: (o: Outcome) => void;
  reasonNote: string;
  setReasonNote: (s: string) => void;
  readOnly: boolean;
  existingOutcome: Outcome | null;
}) {
  const choice = readOnly ? existingOutcome : outcome;
  return (
    <section className="rounded-lg border border-gray-200 bg-white" data-testid="pilot-decision-outcome">
      <header className="px-5 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">Your decision</h2>
        <p className="text-xs text-gray-500 mt-0.5">Pick one. Your account manager is notified either way.</p>
      </header>
      <div className="p-5 grid sm:grid-cols-3 gap-3">
        {(
          [
            {
              key: "renew",
              label: "Renew now",
              detail: "Continue to billing checkout to upgrade from pilot to a paid plan.",
              icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
              tone: "border-emerald-300 hover:border-emerald-500",
              selected: "border-emerald-600 bg-emerald-50",
            },
            {
              key: "request_changes",
              label: "Request changes",
              detail: "Send a note to your account manager about what you'd like adjusted.",
              icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
              tone: "border-amber-300 hover:border-amber-500",
              selected: "border-amber-600 bg-amber-50",
            },
            {
              key: "decline",
              label: "Decline",
              detail: "End the pilot without renewing. We'll ask why.",
              icon: <XCircle className="w-4 h-4 text-red-600" />,
              tone: "border-red-300 hover:border-red-500",
              selected: "border-red-600 bg-red-50",
            },
          ] as Array<{ key: Outcome; label: string; detail: string; icon: React.ReactElement; tone: string; selected: string }>
        ).map((opt) => {
          const isSelected = choice === opt.key;
          return (
            <button
              type="button"
              key={opt.key}
              disabled={readOnly}
              onClick={() => setOutcome(opt.key)}
              data-testid={`outcome-${opt.key}`}
              className={`text-left rounded-lg border p-4 transition disabled:cursor-not-allowed ${
                isSelected ? opt.selected : `${opt.tone} bg-white`
              } ${readOnly && !isSelected ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                {opt.icon}
                {opt.label}
              </div>
              <p className="text-xs text-gray-600 mt-1">{opt.detail}</p>
            </button>
          );
        })}
      </div>
      {(choice === "request_changes" || choice === "decline") && (
        <div className="px-5 pb-5">
          <label className="block text-sm font-medium text-gray-800">
            {choice === "decline" ? "Tell us briefly why" : "What would you like changed?"}
          </label>
          <textarea
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            disabled={readOnly}
            rows={4}
            data-testid="outcome-reason"
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="Required for this option..."
          />
        </div>
      )}
    </section>
  );
}
