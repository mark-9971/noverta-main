/**
 * Demo Control Center — internal admin console for running smooth Trellis
 * demos. Strict scoping: gates on isPlatformAdmin AND a currently selected
 * demo district (useActiveDemoDistrict). All write actions are also
 * verified server-side against the target district's is_demo flag.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiGet, apiPost } from "@/lib/api";
import { useRole, type UserRole } from "@/lib/role-context";
import { useActiveDemoDistrict } from "@/components/DemoBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Activity, AlertCircle, ArrowRight, BarChart3, CheckCircle2, Crown, Download,
  FileText, FlaskConical, HelpCircle, Info, Loader2, Play, RefreshCw, Sliders,
  Sparkles, Star, Users, Wand2, Zap,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReadinessReport {
  status: "pass" | "warn" | "fail";
  checks: Array<{ name: string; status: string; message?: string }>;
}

interface OverviewResponse {
  demoDistricts: Array<{ id: number; name: string; schools: number; students: number; staff: number; openAlerts: number }>;
}

interface CastEntry {
  key: string; label: string; status: "ready" | "created";
  description: string; studentId?: number; studentName?: string; staffId?: number; staffName?: string;
}
interface CastResponse { ok: true; districtId: number; districtName: string; action: string; cast: CastEntry[] }

interface BeforeAfterResp {
  ok: true; districtId: number; districtName: string;
  inputs: { weeksOnTrellis: number; startingCompliancePct: number; startingOnTimeLoggingPct: number };
  totalStudents: number;
  before: { compliancePct: number; onTimeLoggingPct: number; openAlerts: number; criticalAlerts: number;
            compMinutesOpen: number; avgDaysToResolve: number };
  after: { compliancePct: number; onTimeLoggingPct: number; openAlerts: number; criticalAlerts: number;
           compMinutesOpen: number; avgDaysToResolve: number };
  delta: { compliancePts: number; minutesClosedPerWeek: number; dollarsRecovered: number };
  narrative: string; onePagerHtml: string; filename: string;
}

interface CompForecast {
  ok: true; districtId: number; districtName: string;
  currentMinutesOpen: number; obligations: number; affectedStudents: number;
  inputs: { minutesPerWeek: number; teamCapacity: number;
            missedSessionRate: number; staffingStrainPct: number; contractorRate: number };
  effectiveDelivery: number; newExposurePerWeek: number; netDrawdown: number;
  capacityHeadroom: number; weeksToClose: number | null; projectedCloseDate: string | null;
  dollarsAvoidedAtClose: number; contractorCostToCloseIn4Weeks: number;
  topDrivers: Array<{ name: string; impact: number; hint: string }>;
  series: Array<{ week: number; minutesRemaining: number }>;
}

interface DataHealthRow { name: string; status: string; message?: string; level?: string }
interface DataHealthResp { districts?: Array<{ districtId: number; districtName?: string; checks: DataHealthRow[] }>; checks?: DataHealthRow[] }

interface ImportPreviewResp {
  kind: string; headers: string[]; mapping: Record<string, string | null>;
  sampleRows: Array<Record<string, string>>; rowCount: number;
  issues: Array<{ row: number; column: string; message: string }>;
  summary: { mapped: number; unmapped: number; issueCount: number };
}

interface ExecPacketResp {
  ok: true; districtId: number; districtName: string; filename: string; html: string;
  summary: { compliancePct: number; total: number; affected: number; openAlerts: number; minutesOpen: number; dollarsAtRisk: number };
}

interface ResetDistrictResp { ok: boolean; districtName: string; elapsedMs: number;
  teardown: Record<string, number>; seed: Record<string, number> }

interface AlertDensityResp {
  ok: true; target: string; targetCount: number;
  severityMix: "calm" | "mixed" | "crisis"; ageBucketDays: number;
  before: number; after: number; resolved: number; inserted: number;
  mix: { high: number; medium: number; low: number; over7d: number };
}

// ─── Highlight mode (client-side, contextual) ───────────────────────────────

const HIGHLIGHT_KEY = "trellis.demo-highlight-mode";

function useHighlightMode() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(HIGHLIGHT_KEY) === "1";
  });
  useEffect(() => {
    const cls = "demo-highlight-mode";
    const root = document.documentElement;
    if (enabled) {
      root.classList.add(cls);
      window.localStorage.setItem(HIGHLIGHT_KEY, "1");
    } else {
      root.classList.remove(cls);
      window.localStorage.removeItem(HIGHLIGHT_KEY);
    }
    return () => { root.classList.remove(cls); };
  }, [enabled]);
  return [enabled, setEnabled] as const;
}

/**
 * What each surface in Trellis actually means. Used by highlight mode to
 * give the demo presenter a one-line answer to "what does this mean?" for
 * any alert or risk indicator on screen.
 */
const ALERT_GLOSSARY: Array<{ pattern: string; meaning: string }> = [
  { pattern: "minutes_shortfall", meaning: "Service minutes delivered are below the IEP-required amount this week." },
  { pattern: "missed_session", meaning: "A scheduled session was not delivered or logged within the grace window." },
  { pattern: "iep_overdue", meaning: "Annual IEP review is past due — federal/state timeline at risk." },
  { pattern: "evaluation_due", meaning: "A reevaluation is due within 30 days." },
  { pattern: "behavior_escalation", meaning: "Multiple behavior incidents detected in a short window — review BIP." },
  { pattern: "coverage_gap", meaning: "An assigned provider is out and no substitute is logged." },
  { pattern: "comp", meaning: "Compensatory minutes owed to the student under prior-written-notice rules." },
  { pattern: "high-risk", meaning: "Student has 3+ open alerts or a critical (high-severity) alert." },
];

// ─── Tiny presentational helpers ────────────────────────────────────────────

function StatusDot({ ok, warn }: { ok?: boolean; warn?: boolean }) {
  const color = ok ? "bg-emerald-500" : warn ? "bg-amber-500" : "bg-red-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} aria-hidden />;
}

function PanelCard({
  title, icon: Icon, children, num,
}: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; num: number }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 bg-gray-50 border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] text-gray-700">{num}</span>
          <Icon className="w-4 h-4 text-gray-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 text-sm">{children}</CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DemoControlCenterPage() {
  const { isPlatformAdmin, role, setRole, isDevMode } = useRole();
  const queryClient = useQueryClient();
  const demoDistrict = useActiveDemoDistrict();
  const [, navigate] = useLocation();

  // Overview is informational only — used to surface "available demo districts"
  // when the user hasn't selected one. NEVER used as a target fallback.
  const { data: overview } = useQuery<OverviewResponse>({
    queryKey: ["demo-control", "overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/demo-control/overview"),
    enabled: isPlatformAdmin,
  });

  if (!isPlatformAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Restricted</h1>
        <p className="text-sm text-gray-500 mt-2">The Demo Control Center is for platform administrators only.</p>
      </div>
    );
  }

  // Strict scoping — no fallback. Panels only render when a demo district is
  // the user's currently-active scope.
  const targetDistrictId = demoDistrict?.id ?? null;
  const targetDistrictName = demoDistrict?.name ?? null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-amber-600" />
            Demo Control Center
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Internal console for running flawless Trellis demos. All actions are scoped to demo districts only.
            {targetDistrictName ? <> Targeting <span className="font-medium text-gray-700">{targetDistrictName}</span>.</> : null}
          </p>
        </div>
        <Link href="/admin/demo-readiness">
          <Button variant="outline" size="sm" className="gap-2"><Activity className="w-3.5 h-3.5" />Open Pre-Flight</Button>
        </Link>
      </header>

      {!targetDistrictId && (
        <Card>
          <CardContent className="p-6 text-sm text-gray-700 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <div className="font-medium text-gray-900">No demo district selected</div>
              <p className="text-gray-500 mt-1">
                Switch to a demo district from the global district picker. Panels are hidden until your active
                scope is a district with <code className="text-[11px]">is_demo=true</code> — this prevents
                accidental writes to real tenant data.
              </p>
              {(overview?.demoDistricts?.length ?? 0) > 0 && (
                <div className="mt-3 text-xs text-gray-500">
                  Available demo districts: {overview!.demoDistricts.map(d => d.name).join(", ")}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {targetDistrictId && targetDistrictName && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ReadinessPanel districtId={targetDistrictId} />
          <DemoFlowPanel navigate={navigate} />
          <HeroCastPanel districtId={targetDistrictId} queryClient={queryClient} />
          <BeforeAfterPanel districtId={targetDistrictId} districtName={targetDistrictName} />
          <CompForecastPanel districtId={targetDistrictId} />
          <CaseloadSimPanel districtId={targetDistrictId} />
          <ImportPreviewPanel />
          <ExecPacketPanel districtId={targetDistrictId} />
          <RoleWalkthroughPanel role={role} setRole={setRole} isDevMode={isDevMode} />
          <RealismPanel districtId={targetDistrictId} />
          <AlertDensityPanel districtId={targetDistrictId} queryClient={queryClient} />
          <EnvResetPanel districtId={targetDistrictId} districtName={targetDistrictName} queryClient={queryClient} />
          <HighlightModePanel />
        </div>
      )}

      <style>{`
        /* Highlight mode: light outline only on alert/risk-related elements,
           not every data-testid on the page. */
        .demo-highlight-mode [data-testid*="alert"],
        .demo-highlight-mode [data-testid*="risk"],
        .demo-highlight-mode [data-testid*="badge"],
        .demo-highlight-mode [data-explain] {
          outline: 2px dashed rgba(245, 158, 11, 0.7) !important;
          outline-offset: 2px;
          cursor: help;
        }
        .demo-highlight-mode [data-testid*="alert"]:hover,
        .demo-highlight-mode [data-testid*="risk"]:hover {
          outline-color: rgba(217, 119, 6, 1) !important;
        }
      `}</style>
    </div>
  );
}

// ─── Panel 1: Pilot Readiness ───────────────────────────────────────────────

interface DemoControlReadiness {
  ok: true; districtId: number; districtName: string;
  checks: Array<{ key: string; label: string; pass: boolean; detail: string }>;
  passing: number; total: number; status: "pass" | "warn" | "fail";
}

// Map each readiness-check key to a "jump-to-fix" route + action label.
const READINESS_FIX: Record<string, { to: string; label: string }> = {
  schools:    { to: "/import",            label: "Add schools" },
  students:   { to: "/import",            label: "Import students" },
  staff:      { to: "/staff",             label: "Add staff" },
  alerts:     { to: "/alerts",            label: "Open alerts" },
  openAlerts: { to: "/alerts",            label: "Tune live alerts" },
  comp:       { to: "/compensatory",      label: "Open comp workspace" },
  sessions:   { to: "/sessions",          label: "Log a session" },
};

function ReadinessPanel({ districtId }: { districtId: number }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery<DemoControlReadiness>({
    queryKey: ["demo-control", "readiness", districtId],
    queryFn: () => apiGet<DemoControlReadiness>(`/api/demo-control/readiness?districtId=${districtId}`),
    retry: false,
  });
  const status = data?.status;
  return (
    <PanelCard num={1} title="Pilot Readiness" icon={Activity}>
      {isLoading ? <div className="text-gray-400 text-sm">Loading…</div> :
       error ? (
         <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
           Could not load readiness: {(error as Error).message}
         </div>
       ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <StatusDot ok={status === "pass"} warn={status === "warn"} />
            <span className="font-medium capitalize">{status ?? "unknown"}</span>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {data?.passing ?? 0}/{data?.total ?? 0}
            </Badge>
          </div>
          <ul className="space-y-1 max-h-40 overflow-y-auto text-xs text-gray-600">
            {data?.checks?.map((c) => {
              const fix = READINESS_FIX[c.key];
              return (
                <li key={c.key} className="flex items-center gap-1.5">
                  <StatusDot ok={c.pass} />
                  <span className="truncate">{c.label}</span>
                  <span className="ml-auto text-[10px] text-gray-400">{c.detail}</span>
                  {!c.pass && fix && (
                    <Link href={fix.to}>
                      <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px] text-amber-700">
                        {fix.label}<ArrowRight className="w-2.5 h-2.5 ml-0.5" />
                      </Button>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />Re-run
            </Button>
            <Link href="/admin/demo-readiness"><Button size="sm" variant="ghost" className="gap-1">Full report<ArrowRight className="w-3 h-3" /></Button></Link>
          </div>
        </div>
      )}
    </PanelCard>
  );
}

// ─── Panel 2: Demo Flow Launcher ────────────────────────────────────────────

const FLOWS: Array<{ id: string; label: string; description: string; steps: Array<{ path: string; label: string }> }> = [
  { id: "exec", label: "Executive walkthrough", description: "Dashboard → Compliance → Compensatory → Reports",
    steps: [{ path: "/", label: "Dashboard" }, { path: "/compliance", label: "Compliance" },
            { path: "/compensatory", label: "Compensatory" }, { path: "/reports", label: "Reports" }] },
  { id: "admin", label: "Admin oversight", description: "Alerts → Coverage → Staff → Reports",
    steps: [{ path: "/alerts", label: "Alerts" }, { path: "/coverage", label: "Coverage" },
            { path: "/staff", label: "Staff" }, { path: "/reports", label: "Reports" }] },
  { id: "coordinator", label: "Coordinator daily ops", description: "Today → Caseload balancing → Schedule → Compliance",
    steps: [{ path: "/today", label: "Today" }, { path: "/caseload-balancing", label: "Caseload" },
            { path: "/schedule", label: "Schedule" }, { path: "/compliance", label: "Compliance" }] },
  { id: "provider", label: "Provider day-in-the-life", description: "Action Center → Sessions → Schedule → Caseload",
    steps: [{ path: "/action-center", label: "Action Center" }, { path: "/sessions", label: "Sessions" },
            { path: "/schedule", label: "Schedule" }, { path: "/students", label: "Students" }] },
  { id: "para", label: "Para / direct-provider day", description: "My Day → Sessions → Behavior assessment",
    steps: [{ path: "/my-day", label: "My Day" }, { path: "/sessions", label: "Sessions" },
            { path: "/behavior-assessment", label: "Behavior assessment" }] },
  { id: "bcba", label: "BCBA clinical review", description: "Today → Behavior assessment → ABA hub → Students",
    steps: [{ path: "/today", label: "Today" }, { path: "/behavior-assessment", label: "Behavior / FBA / BIP" },
            { path: "/aba", label: "ABA hub" }, { path: "/students", label: "Students" }] },
];

function DemoFlowPanel({ navigate }: { navigate: (to: string) => void }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const flow = FLOWS.find(f => f.id === activeId);
  function start(id: string) { setActiveId(id); setStep(0); navigate(FLOWS.find(f => f.id === id)!.steps[0].path); }
  function next() {
    if (!flow) return;
    const ns = step + 1;
    if (ns >= flow.steps.length) { setActiveId(null); setStep(0); return; }
    setStep(ns); navigate(flow.steps[ns].path);
  }
  return (
    <PanelCard num={2} title="Demo Flow Launcher" icon={Play}>
      {!flow ? (
        <div className="space-y-1.5">
          {FLOWS.map(f => (
            <button key={f.id} onClick={() => start(f.id)}
              className="w-full text-left rounded border border-gray-200 hover:border-amber-300 hover:bg-amber-50 px-2 py-1.5">
              <div className="font-medium text-gray-800">{f.label}</div>
              <div className="text-[11px] text-gray-500">{f.description}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-gray-500">{flow.label} · step {step + 1} of {flow.steps.length}</div>
          <div className="font-medium text-gray-800">→ {flow.steps[step].label}</div>
          <div className="flex gap-2">
            <Button size="sm" onClick={next} className="gap-1.5">
              {step + 1 < flow.steps.length ? "Next step" : "Finish"}<ArrowRight className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setActiveId(null); setStep(0); }}>Cancel</Button>
          </div>
        </div>
      )}
    </PanelCard>
  );
}

// ─── Panel 3: Hero Cast Generator (curated, idempotent) ─────────────────────

function HeroCastPanel({ districtId, queryClient }: { districtId: number; queryClient: QueryClient }) {
  const [cast, setCast] = useState<CastEntry[] | null>(null);
  const ensure = useMutation({
    mutationFn: () => apiPost<CastResponse>("/api/demo-control/hero-cast", { districtId, action: "ensure" }),
    onSuccess: r => { setCast(r.cast); queryClient.invalidateQueries(); },
  });
  const refresh = useMutation({
    mutationFn: () => apiPost<CastResponse>("/api/demo-control/hero-cast", { districtId, action: "refresh" }),
    onSuccess: r => { setCast(r.cast); queryClient.invalidateQueries(); },
  });
  return (
    <PanelCard num={3} title="Hero Cast Generator" icon={Star}>
      <div className="space-y-2">
        <p className="text-xs text-gray-500">
          Stages a curated cast of 6 archetypes — overloaded case manager, missed minutes, comp-owed,
          overdue IEP, behavior-heavy, healthy success — pinned to stable students so the same demo
          plays out the same way each run.
        </p>
        <div className="flex gap-2">
          <Button size="sm" disabled={ensure.isPending} onClick={() => ensure.mutate()} className="gap-1.5">
            {ensure.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Ensure cast (idempotent)
          </Button>
          <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()} className="gap-1.5">
            {refresh.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            Refresh
          </Button>
        </div>
        {(ensure.error || refresh.error) && (
          <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            {String((ensure.error || refresh.error) as Error)}
          </div>
        )}
        {cast && (
          <ul className="text-xs space-y-1 mt-1 max-h-44 overflow-y-auto">
            {cast.map(c => (
              <li key={c.key} className="flex items-start gap-2 border border-gray-100 rounded px-2 py-1">
                <span className={`text-[10px] uppercase font-medium px-1.5 py-0.5 rounded ${c.status === "ready" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                  {c.status}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-800">{c.label}</div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {c.studentName ?? c.staffName ?? ""}{(c.studentName || c.staffName) ? " · " : ""}{c.description}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelCard>
  );
}

// ─── Panel 4: Before / After Estimator (input-driven + one-pager) ──────────

function BeforeAfterPanel({ districtId, districtName }: { districtId: number; districtName: string }) {
  const [weeks, setWeeks] = useState(12);
  const [startCompliance, setStartCompliance] = useState(60);
  const [startLogging, setStartLogging] = useState(42);
  const [result, setResult] = useState<BeforeAfterResp | null>(null);
  const compute = useMutation({
    mutationFn: () => apiPost<BeforeAfterResp>("/api/demo-control/before-after", {
      districtId, weeksOnTrellis: weeks,
      startingCompliancePct: startCompliance, startingOnTimeLoggingPct: startLogging,
    }),
    onSuccess: r => setResult(r),
  });
  function downloadOnePager() {
    if (!result) return;
    const blob = new Blob([result.onePagerHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = result.filename; document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  }
  function openOnePager() {
    if (!result) return;
    const w = window.open("", "_blank"); if (!w) return;
    w.document.open(); w.document.write(result.onePagerHtml); w.document.close();
  }
  return (
    <PanelCard num={4} title="Before / After Estimator" icon={BarChart3}>
      <div className="space-y-2">
        <p className="text-[11px] text-gray-500">
          Enter the customer's starting baseline; we'll project against {districtName}'s current
          live demo metrics and produce a sharable one-pager.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[10px]">Weeks on Trellis</Label>
            <Input type="range" min={1} max={52} value={weeks} onChange={e => setWeeks(Number(e.target.value))} className="h-7" />
            <div className="text-[11px] text-gray-600 text-center">{weeks}</div>
          </div>
          <div>
            <Label className="text-[10px]">Start compliance %</Label>
            <Input type="range" min={0} max={100} value={startCompliance} onChange={e => setStartCompliance(Number(e.target.value))} className="h-7" />
            <div className="text-[11px] text-gray-600 text-center">{startCompliance}%</div>
          </div>
          <div>
            <Label className="text-[10px]">Start logging %</Label>
            <Input type="range" min={0} max={100} value={startLogging} onChange={e => setStartLogging(Number(e.target.value))} className="h-7" />
            <div className="text-[11px] text-gray-600 text-center">{startLogging}%</div>
          </div>
        </div>
        <Button size="sm" onClick={() => compute.mutate()} disabled={compute.isPending} className="gap-1.5">
          {compute.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
          Compute projection
        </Button>
        {result && (
          <div className="text-xs space-y-1 mt-1">
            <div className="grid grid-cols-3 gap-1 text-center">
              <div className="bg-emerald-50 border border-emerald-200 rounded p-1">
                <div className="text-[9px] text-emerald-700 uppercase">Δ compliance</div>
                <div className="font-semibold text-emerald-800">+{result.delta.compliancePts} pts</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded p-1">
                <div className="text-[9px] text-blue-700 uppercase">Min closed/wk</div>
                <div className="font-semibold text-blue-800">{result.delta.minutesClosedPerWeek}</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-1">
                <div className="text-[9px] text-amber-700 uppercase">$ avoided</div>
                <div className="font-semibold text-amber-800">${result.delta.dollarsRecovered.toLocaleString()}</div>
              </div>
            </div>
            <div className="text-gray-600 text-[11px] leading-snug">{result.narrative}</div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={openOnePager} className="gap-1.5">
                <FileText className="w-3 h-3" />Open one-pager
              </Button>
              <Button size="sm" variant="ghost" onClick={downloadOnePager} className="gap-1.5">
                <Download className="w-3 h-3" />Download
              </Button>
            </div>
          </div>
        )}
      </div>
    </PanelCard>
  );
}

// ─── Panel 5: Comp Exposure Simulator (read-only what-if) ──────────────────

function CompForecastPanel({ districtId }: { districtId: number }) {
  const [minutesPerWeek, setMinutesPerWeek] = useState(600);
  const [teamCapacity, setTeamCapacity] = useState(1500);
  const [missedSessionRate, setMissedSessionRate] = useState(8);
  const [staffingStrainPct, setStaffingStrainPct] = useState(10);
  const [contractorRate, setContractorRate] = useState(95);
  const params = `districtId=${districtId}&minutesPerWeek=${minutesPerWeek}&teamCapacity=${teamCapacity}` +
    `&missedSessionRate=${missedSessionRate}&staffingStrainPct=${staffingStrainPct}&contractorRate=${contractorRate}`;
  const { data, isFetching } = useQuery<CompForecast>({
    queryKey: ["demo-control", "comp-forecast", districtId, minutesPerWeek, teamCapacity,
               missedSessionRate, staffingStrainPct, contractorRate],
    queryFn: () => apiGet<CompForecast>(`/api/demo-control/comp-forecast?${params}`),
  });
  const series = data?.series ?? [];
  const max = Math.max(1, ...series.map(p => p.minutesRemaining));
  return (
    <PanelCard num={5} title="Comp Exposure Simulator" icon={Sliders}>
      <div className="space-y-2">
        <p className="text-[11px] text-gray-500">
          Read-only what-if: model the four real levers (delivery, capacity, missed-session rate,
          staffing strain) and the contractor cost to close the gap. No data is modified.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Delivery rate (min/wk)</Label>
            <Input type="range" min={0} max={5000} step={50} value={minutesPerWeek}
                   onChange={e => setMinutesPerWeek(Number(e.target.value))} className="h-7" />
            <div className="text-[10px] text-gray-600 text-center">{minutesPerWeek.toLocaleString()}</div>
          </div>
          <div>
            <Label className="text-[10px]">Team capacity (min/wk)</Label>
            <Input type="range" min={minutesPerWeek} max={10000} step={100} value={teamCapacity}
                   onChange={e => setTeamCapacity(Number(e.target.value))} className="h-7" />
            <div className="text-[10px] text-gray-600 text-center">{teamCapacity.toLocaleString()}</div>
          </div>
          <div>
            <Label className="text-[10px]">Missed-session rate (%)</Label>
            <Input type="range" min={0} max={50} step={1} value={missedSessionRate}
                   onChange={e => setMissedSessionRate(Number(e.target.value))} className="h-7" />
            <div className="text-[10px] text-gray-600 text-center">{missedSessionRate}%</div>
          </div>
          <div>
            <Label className="text-[10px]">Staffing strain (%)</Label>
            <Input type="range" min={0} max={60} step={1} value={staffingStrainPct}
                   onChange={e => setStaffingStrainPct(Number(e.target.value))} className="h-7" />
            <div className="text-[10px] text-gray-600 text-center">{staffingStrainPct}%</div>
          </div>
          <div className="col-span-2">
            <Label className="text-[10px]">Contractor rate ($/hr)</Label>
            <Input type="range" min={20} max={300} step={5} value={contractorRate}
                   onChange={e => setContractorRate(Number(e.target.value))} className="h-7" />
            <div className="text-[10px] text-gray-600 text-center">${contractorRate}/hr</div>
          </div>
        </div>
        {data && (
          <>
            <div className="grid grid-cols-4 gap-1 text-center text-xs">
              <div className="bg-gray-50 border rounded p-1">
                <div className="text-[9px] text-gray-500 uppercase">Open now</div>
                <div className="font-semibold text-gray-800">{data.currentMinutesOpen.toLocaleString()}m</div>
              </div>
              <div className="bg-gray-50 border rounded p-1">
                <div className="text-[9px] text-gray-500 uppercase">Net drawdown</div>
                <div className={`font-semibold ${data.netDrawdown > 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {data.netDrawdown.toLocaleString()}m/wk
                </div>
              </div>
              <div className="bg-gray-50 border rounded p-1">
                <div className="text-[9px] text-gray-500 uppercase">Wks to close</div>
                <div className="font-semibold text-gray-800">{data.weeksToClose ?? "∞"}</div>
              </div>
              <div className="bg-gray-50 border rounded p-1">
                <div className="text-[9px] text-gray-500 uppercase">4-wk contractor</div>
                <div className="font-semibold text-gray-800">
                  ${data.contractorCostToCloseIn4Weeks.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="border rounded p-1.5 bg-white">
              <div className="text-[10px] text-gray-500 mb-1">12-week projection</div>
              <div className="flex items-end gap-0.5 h-16">
                {series.map(p => (
                  <div key={p.week} className="flex-1 bg-amber-200 rounded-t"
                       style={{ height: `${(p.minutesRemaining / max) * 100}%` }}
                       title={`Week ${p.week}: ${p.minutesRemaining}m remaining`} />
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                <span>now</span><span>+12 wks</span>
              </div>
            </div>
            {data.topDrivers.length > 0 && (
              <div className="border rounded bg-white p-1.5 space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-gray-500">Top drivers</div>
                {data.topDrivers.map(d => (
                  <div key={d.name} className="flex justify-between text-[11px] text-gray-700">
                    <span><b>{d.name}</b> <span className="text-gray-500">· {d.hint}</span></span>
                    <span className="text-amber-700">{d.impact.toLocaleString()}m/wk</span>
                  </div>
                ))}
              </div>
            )}
            {data.projectedCloseDate && (
              <div className="text-[11px] text-gray-600">
                Projected close: <span className="font-medium">{data.projectedCloseDate}</span> ·
                Headroom: {data.capacityHeadroom.toLocaleString()} min/wk unused
              </div>
            )}
            {isFetching && <div className="text-[10px] text-gray-400">Recomputing…</div>}
          </>
        )}
      </div>
    </PanelCard>
  );
}

// ─── Panel 6: Caseload Balancing Summary ────────────────────────────────────

function CaseloadSimPanel({ districtId }: { districtId: number }) {
  const [variancePct, setVariancePct] = useState(25);
  const { data, error, isLoading, isFetching } = useQuery<{
    totals: { staff: number; balanced: number; over: number; under: number };
    avgCaseload: number;
    variancePct: number;
    topOverloaded: Array<{ name: string; caseload: number; deltaFromAvg: number }>;
  }>({
    queryKey: ["demo-control", "caseload-summary", districtId, variancePct],
    queryFn: () => apiGet(
      `/api/demo-control/caseload-summary?districtId=${districtId}&variancePct=${variancePct}`,
    ),
    retry: false,
  });
  const t = data?.totals;
  const denom = t ? Math.max(1, t.staff) : 1;
  const pct = (n: number) => Math.round((n / denom) * 100);
  return (
    <PanelCard num={6} title="Caseload Balancing" icon={Users}>
      {isLoading ? <div className="text-xs text-gray-400">Loading…</div> :
       error ? (
         <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
           Could not load caseload summary: {(error as Error).message}
         </div>
       ) : !t ? <div className="text-xs text-gray-400">No data.</div> : (
        <div className="space-y-2 text-xs">
          <div>
            Staff: <b>{t.staff}</b> · Avg caseload: <b>{data?.avgCaseload}</b>
            {isFetching && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-gray-400" />}
          </div>
          <div>
            <Label className="text-[10px]">Variance threshold: ±{variancePct}%</Label>
            <Input type="range" min={5} max={60} step={5} value={variancePct}
                   onChange={e => setVariancePct(Number(e.target.value))} className="h-7" />
          </div>
          {/* In-place stacked bar simulator */}
          <div className="h-4 w-full rounded overflow-hidden flex border border-gray-200">
            <div className="bg-emerald-500" style={{ width: `${pct(t.balanced)}%` }}
                 title={`${t.balanced} balanced`} />
            <div className="bg-red-500" style={{ width: `${pct(t.over)}%` }}
                 title={`${t.over} overloaded`} />
            <div className="bg-amber-400" style={{ width: `${pct(t.under)}%` }}
                 title={`${t.under} underutilized`} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-600">
            <span>Balanced <b className="text-emerald-700">{t.balanced}</b></span>
            <span>Over <b className="text-red-700">{t.over}</b></span>
            <span>Under <b className="text-amber-700">{t.under}</b></span>
          </div>
          {data?.topOverloaded && data.topOverloaded.length > 0 && (
            <div className="border-t pt-1.5">
              <div className="text-[10px] font-medium text-gray-700 mb-0.5">Top overloaded staff</div>
              <ul className="space-y-0.5 text-[11px]">
                {data.topOverloaded.map(s => (
                  <li key={s.name} className="flex justify-between">
                    <span className="truncate">{s.name}</span>
                    <span className="text-red-700 ml-2 shrink-0">
                      {s.caseload} <span className="text-gray-400">(+{s.deltaFromAvg})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link href="/caseload-balancing">
            <Button size="sm" variant="outline" className="gap-1.5 mt-1 w-full">
              Open full balancer<ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      )}
    </PanelCard>
  );
}

// ─── Panel 7: Import Preview ────────────────────────────────────────────────

const SAMPLE_CSV = `first_name,last_name,grade,student_id\nAva,Martinez,3,1001\nNoah,Patel,5,1002\nEmma,O'Brien,1,\n`;

function ImportPreviewPanel() {
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [kind, setKind] = useState<"students" | "staff">("students");
  const mut = useMutation({
    mutationFn: () => apiPost<ImportPreviewResp>("/api/demo-control/import-preview", { csv, kind }),
  });
  const r = mut.data;
  return (
    <PanelCard num={7} title="Import Preview" icon={FileText}>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <Label>Kind:</Label>
          <select value={kind} onChange={e => setKind(e.target.value as "students" | "staff")}
                  className="border rounded px-1 py-0.5 text-xs">
            <option value="students">Students</option><option value="staff">Staff</option>
          </select>
        </div>
        <Textarea value={csv} onChange={e => setCsv(e.target.value)} rows={4} className="text-[11px] font-mono" />
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Preview"}
        </Button>
        {r && (
          <div className="text-[11px] text-gray-700 space-y-1">
            <div>
              {r.rowCount} rows · <span className="text-emerald-700">{r.summary.mapped} mapped</span> ·
              <span className="text-amber-700"> {r.summary.unmapped} unmapped</span> ·
              <span className={r.issues.length > 0 ? "text-red-700" : "text-emerald-700"}>
                {" "}{r.issues.length} issues
              </span>
            </div>
            {r.issues.slice(0, 3).map((i, k) => (
              <div key={k} className="text-red-700">Row {i.row} · {i.column} — {i.message}</div>
            ))}
          </div>
        )}
      </div>
    </PanelCard>
  );
}

// ─── Panel 8: Executive Packet ──────────────────────────────────────────────

function ExecPacketPanel({ districtId }: { districtId: number }) {
  const [r, setR] = useState<ExecPacketResp | null>(null);
  const mut = useMutation({
    mutationFn: () => apiGet<ExecPacketResp>(`/api/demo-control/exec-packet?districtId=${districtId}`),
    onSuccess: setR,
  });
  function downloadHtml() {
    if (!r) return;
    const blob = new Blob([r.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = r.filename; document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  }
  const pdfUrl = `/api/demo-control/exec-packet.pdf?districtId=${districtId}`;
  return (
    <PanelCard num={8} title="Executive Packet" icon={Crown}>
      <div className="space-y-2">
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending} className="gap-1.5">
          {mut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
          Generate packet
        </Button>
        {r && (
          <div className="text-xs space-y-1">
            <div>{r.summary.compliancePct}% compliant · {r.summary.affected}/{r.summary.total} at-risk</div>
            <div>{r.summary.minutesOpen.toLocaleString()} min comp · ~${r.summary.dollarsAtRisk.toLocaleString()} at risk</div>
            <div className="flex gap-1 mt-1 flex-wrap">
              <Button size="sm" variant="outline" onClick={downloadHtml} className="gap-1.5">
                <Download className="w-3 h-3" />HTML
              </Button>
              <a href={pdfUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <FileText className="w-3 h-3" />Open PDF
                </Button>
              </a>
              <a href={pdfUrl} download={r.filename.replace(/\.html?$/, ".pdf")}>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Download className="w-3 h-3" />PDF
                </Button>
              </a>
            </div>
          </div>
        )}
      </div>
    </PanelCard>
  );
}

// ─── Panel 9: Role Walkthrough ─────────────────────────────────────────────

const WALKTHROUGH_ROLES: Array<{ role: UserRole; label: string; home: string; sees: string }> = [
  { role: "admin", label: "Admin", home: "/", sees: "District dashboard, alerts, staff, reports." },
  { role: "case_manager", label: "Case manager", home: "/today", sees: "Today queue, IEPs, compliance." },
  { role: "bcba", label: "BCBA", home: "/today", sees: "Behavior data, BIPs, FBA queue." },
  { role: "sped_teacher", label: "SPED teacher", home: "/today", sees: "Caseload, services, progress notes." },
  { role: "coordinator", label: "Coordinator", home: "/today", sees: "Caseload balancing, schedule, comp." },
  { role: "provider", label: "Service provider", home: "/action-center", sees: "Sessions, schedule, action queue." },
  { role: "para", label: "Para / direct provider", home: "/my-day", sees: "My Day, sessions, behavior data." },
  { role: "sped_parent", label: "Parent / guardian", home: "/guardian-portal", sees: "Child progress, services, messages." },
];

function RoleWalkthroughPanel({
  role, setRole, isDevMode,
}: { role: UserRole; setRole: (r: UserRole) => void; isDevMode: boolean }) {
  const preview = WALKTHROUGH_ROLES.find(r => r.role === role) ?? WALKTHROUGH_ROLES[0];
  return (
    <PanelCard num={9} title="Role Walkthrough" icon={Users}>
      <div className="space-y-2">
        <div className="text-xs text-gray-600">
          Currently viewing as: <Badge variant="outline" className="ml-1">{role}</Badge>
        </div>
        <div className="text-[11px] text-gray-500">
          One-click persona switch — the app re-routes to that role's home and the
          UI re-renders for the chosen persona. {isDevMode
            ? "Dev mode: enabled for everyone."
            : "Production: enabled for platform admins; server-side role gates still apply on each page."}
        </div>
        <div className="grid grid-cols-2 gap-1">
          {WALKTHROUGH_ROLES.map(r => (
            <Button key={r.role}
                    size="sm"
                    variant={role === r.role ? "default" : "outline"}
                    onClick={() => setRole(r.role)}
                    className="text-[11px] h-7 justify-start">
              {r.label}
            </Button>
          ))}
        </div>
        <div className="border rounded bg-gray-50 p-1.5 text-[11px] text-gray-700 space-y-1">
          <div><b>{preview.label}</b> sees: {preview.sees}</div>
          <a href={preview.home} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="gap-1 h-6 text-[11px]">
              Open in new tab <ArrowRight className="w-3 h-3" />
            </Button>
          </a>
        </div>
      </div>
    </PanelCard>
  );
}

// ─── Panel 10: Realism (Data Health) ───────────────────────────────────────

function RealismPanel({ districtId }: { districtId: number }) {
  const { data, isLoading, error } = useQuery<DataHealthResp>({
    queryKey: ["demo-control", "data-health", districtId],
    queryFn: () => apiGet<DataHealthResp>(`/api/demo-control/data-health?districtId=${districtId}`),
    retry: false,
  });
  const checks: DataHealthRow[] = data?.checks ?? [];
  const fail = checks.filter(c => c.status !== "pass" && c.status !== "ok");
  return (
    <PanelCard num={10} title="Data Realism Check" icon={CheckCircle2}>
      {isLoading ? <div className="text-xs text-gray-400">Loading…</div> :
       error ? (
         <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
           Could not load data-health: {(error as Error).message}
         </div>
       ) : checks.length === 0 ? (
         <div className="text-xs text-gray-500">No checks returned for this district.</div>
       ) : (
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <StatusDot ok={fail.length === 0} warn={fail.length > 0 && fail.length < 3} />
            <span className="font-medium">{fail.length === 0 ? "All checks passing" : `${fail.length} issues`}</span>
            <Badge variant="outline" className="ml-auto text-[10px]">{checks.length} checks</Badge>
          </div>
          {fail.slice(0, 4).map((c, i) => (
            <div key={i} className="text-amber-700 truncate">⚠ {c.name}{c.message ? ` — ${c.message}` : ""}</div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

// ─── Panel 11: Alert Density Tuner ─────────────────────────────────────────

function AlertDensityPanel({ districtId, queryClient }: { districtId: number; queryClient: QueryClient }) {
  const [last, setLast] = useState<AlertDensityResp | null>(null);
  const [severityMix, setSeverityMix] = useState<"calm" | "mixed" | "crisis">("mixed");
  const [ageBucketDays, setAgeBucketDays] = useState(7);
  const mut = useMutation({
    mutationFn: (target: "low" | "medium" | "high") =>
      apiPost<AlertDensityResp>("/api/demo-control/alert-density",
        { districtId, target, severityMix, ageBucketDays }),
    onSuccess: r => { setLast(r); queryClient.invalidateQueries(); },
  });
  return (
    <PanelCard num={11} title="Alert Density Tuner" icon={Sliders}>
      <div className="space-y-2">
        <div>
          <Label className="text-[10px]">Open-alert volume</Label>
          <div className="flex gap-1.5">
            {(["low", "medium", "high"] as const).map(t => (
              <Button key={t} size="sm" variant={last?.target === t ? "default" : "outline"}
                      onClick={() => mut.mutate(t)} disabled={mut.isPending} className="flex-1 text-xs">
                {mut.isPending && mut.variables === t ? <Loader2 className="w-3 h-3 animate-spin" /> : t}
              </Button>
            ))}
          </div>
          <div className="text-[10px] text-gray-500">Target: 5 (low) · 18 (med) · 40 (high)</div>
        </div>
        <div>
          <Label className="text-[10px]">Severity mix</Label>
          <div className="flex gap-1.5">
            {(["calm", "mixed", "crisis"] as const).map(m => (
              <Button key={m} size="sm" variant={severityMix === m ? "default" : "outline"}
                      onClick={() => setSeverityMix(m)} className="flex-1 text-xs capitalize">
                {m}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Backlog age window: {ageBucketDays} days</Label>
          <Input type="range" min={0} max={45} step={1} value={ageBucketDays}
                 onChange={e => setAgeBucketDays(Number(e.target.value))} className="h-7" />
          <div className="text-[10px] text-gray-500">
            New synthetic alerts get a created-at sampled from the last {ageBucketDays} day(s).
          </div>
        </div>
        {last && (
          <div className="text-xs bg-emerald-50 border border-emerald-200 rounded px-2 py-1 space-y-0.5">
            <div>{last.before} → <b>{last.after}</b> open · resolved {last.resolved} · inserted {last.inserted}</div>
            <div className="text-[11px] text-gray-700">
              Mix: <b className="text-red-700">{last.mix.high} high</b> ·
              <b className="text-amber-700"> {last.mix.medium} med</b> ·
              <b className="text-gray-700"> {last.mix.low} low</b> ·
              <b> {last.mix.over7d} aged &gt;7d</b>
            </div>
          </div>
        )}
      </div>
    </PanelCard>
  );
}

// ─── Panel 12: Env Reset (district-scoped only) ────────────────────────────

function EnvResetPanel({
  districtId, districtName, queryClient,
}: { districtId: number; districtName: string; queryClient: QueryClient }) {
  const [confirming, setConfirming] = useState(false);
  const [last, setLast] = useState<ResetDistrictResp | null>(null);
  const mut = useMutation({
    mutationFn: () => apiPost<ResetDistrictResp>("/api/demo-control/reset-district", { districtId }),
    onSuccess: r => { setLast(r); setConfirming(false); queryClient.invalidateQueries(); },
  });
  return (
    <PanelCard num={12} title="Env Reset" icon={RefreshCw}>
      <div className="space-y-2">
        <div className="text-xs text-gray-500">
          Tears down and re-seeds sample data for <b>{districtName}</b> only. Other districts (including
          other demo districts) are untouched.
        </div>
        {!confirming ? (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)} className="gap-1.5">
            <RefreshCw className="w-3 h-3" />Reset {districtName}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm reset"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        )}
        {last && (
          <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
            Reset complete in {Math.round(last.elapsedMs / 100) / 10}s for {last.districtName}.
          </div>
        )}
        {mut.error && (
          <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            {String(mut.error)}
          </div>
        )}
      </div>
    </PanelCard>
  );
}

// ─── Panel 13: Highlight Mode (contextual explanations) ────────────────────

function HighlightModePanel() {
  const [enabled, setEnabled] = useHighlightMode();
  return (
    <PanelCard num={13} title="Feature Highlight Mode" icon={Sparkles}>
      <div className="space-y-2">
        <p className="text-xs text-gray-500">
          Outlines every alert/risk indicator on screen and shows a glossary of what each one
          actually means. Useful when prospects ask "what is this badge telling me?"
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={enabled ? "default" : "outline"} onClick={() => setEnabled(!enabled)} className="gap-1.5">
            <Sparkles className="w-3 h-3" />{enabled ? "Disable" : "Enable"} highlight
          </Button>
          {enabled && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">ON across app</Badge>}
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-600 flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />Glossary — what each alert means
          </summary>
          <ul className="mt-1 space-y-1 text-[11px] text-gray-600 max-h-40 overflow-y-auto pl-1">
            {ALERT_GLOSSARY.map(g => (
              <li key={g.pattern} className="border-l-2 border-amber-200 pl-2">
                <code className="text-[10px] bg-gray-100 px-1 rounded">{g.pattern}</code>
                <div>{g.meaning}</div>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </PanelCard>
  );
}
