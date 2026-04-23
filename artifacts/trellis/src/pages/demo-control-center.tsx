/**
 * Demo Control Center — internal admin console for running smooth Noverta
 * demos.
 *
 * Panels currently filled in:
 *   - Slot  2: Demo flow launcher (persona walkthroughs).
 *   - Slot  3: Hero student / problem case generator (HeroCastPanel).
 *   - Slot  9: Role-based walkthrough toggle.
 *   - Slot 12: Environment reset / refresh district (ResetDistrictPanel).
 *   - Slot 13: Feature highlight mode toggle.
 * Other slots remain numbered placeholders awaiting their cluster tasks.
 *
 * Strict route guards (unchanged from the shell):
 *   - Non-platform-admins see a 404-style stub. The route is also hidden
 *     from their nav (only platformAdminSection in nav-config.ts links it).
 *   - When the user's active scope is NOT a demo district, the page renders
 *     a 404-style stub instead of the panels. Admins must select a demo
 *     district from the global district picker (or this page's selector,
 *     once a demo scope is active) before the shell will render.
 *
 * Why strict: every panel writes data scoped to the targeted demo district,
 * so a misrouted action could mutate real tenant data. The simplest
 * defense is to refuse to render when the scope isn't a known
 * is_demo=true district — and on the backend every endpoint re-verifies
 * is_demo before doing any work.
 */
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { useRole, type UserRole } from "@/lib/role-context";
import { useActiveDemoDistrict } from "@/components/DemoBanner";
import { useSchoolContext } from "@/lib/school-context";
import { useDemoMode } from "@/lib/demo-mode";
import { PERSONA_WALKTHROUGHS } from "@/components/demo-control/walkthroughs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Activity, FlaskConical, Compass, Users, Lightbulb, RefreshCw, Sparkles,
  Loader2, AlertTriangle, ExternalLink, RotateCcw,
  FileText, Download, Eye, FileSpreadsheet, CheckCircle2,
} from "lucide-react";
import BeforeAfterPanel from "@/components/demo-control/BeforeAfterPanel";
import CompExposurePanel from "@/components/demo-control/CompExposurePanel";
import CaseloadSimulatorPanel from "@/components/demo-control/CaseloadSimulatorPanel";
import ReadinessPanel from "@/components/demo-control/ReadinessPanel";
import RealismPanel from "@/components/demo-control/RealismPanel";
import AlertTunerPanel from "@/components/demo-control/AlertTunerPanel";

interface OverviewResponse {
  demoDistricts: Array<{
    id: number;
    name: string;
    schools: number;
    students: number;
    staff: number;
    openAlerts: number;
  }>;
}

interface HeroCastEntry {
  key: string;
  label: string;
  studentId?: number;
  studentName?: string;
  staffId?: number;
  staffName?: string;
  status: string;
  description: string;
}

interface HeroCastResponse {
  ok: true;
  districtId: number;
  districtName: string;
  action: "ensure" | "refresh";
  cast: HeroCastEntry[];
}

interface ResetResponse {
  ok: true;
  districtId: number;
  districtName: string;
  elapsedMs: number;
  teardown: { studentsRemoved?: number; staffRemoved?: number };
  seed: { studentsCreated?: number; staffCreated?: number };
}

const TOTAL_PANEL_SLOTS = 13;

// Roles available in the role-walkthrough toggle (Panel 9). The "Executive"
// view shares the admin role but lands on a different home surface, mirroring
// the persona walkthroughs in walkthroughs.ts.
const PERSONA_TOGGLE: Array<{ id: string; label: string; role: UserRole; homeHref: string }> = [
  { id: "admin",        label: "Admin",        role: "admin",        homeHref: "/" },
  { id: "case_manager", label: "Case manager", role: "case_manager", homeHref: "/" },
  { id: "bcba",         label: "BCBA",         role: "bcba",         homeHref: "/today" },
  { id: "para",         label: "Para",         role: "para",         homeHref: "/my-day" },
  { id: "executive",    label: "Executive",    role: "admin",        homeHref: "/executive" },
];

function NotFoundStub() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center" data-testid="demo-control-center-not-found">
      <h1 className="text-xl font-semibold text-gray-900">Not found</h1>
      <p className="text-sm text-gray-500 mt-2">
        The page you requested does not exist.
      </p>
    </div>
  );
}

/** Shared header for filled-in panels: numbered chip + title. */
function PanelHeader({ num, title, icon: Icon }: {
  num: number; title: string; icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <CardHeader className="py-3 bg-gray-50 border-b">
      <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] text-gray-700"
          aria-label={`Panel ${num}`}
        >
          {num}
        </span>
        <Icon className="w-4 h-4 text-gray-500" />
        <span>{title}</span>
      </CardTitle>
    </CardHeader>
  );
}

// ---------------------------------------------------------------------------
// Panel 7 — Import / Spreadsheet Conversion Preview.
// Lets the demo operator paste a CSV/TSV blob (or load a small sample) and
// see how Noverta would parse it into student/IEP rows BEFORE committing to
// an import. Strictly preview-only; never writes to the database. Used in
// the live demo to show "we'll handle your messy export" without risking
// anything to the demo district's data.
// ---------------------------------------------------------------------------
const SAMPLE_CSV = `Student ID,First,Last,Grade,Disability,IEP Due,Service Minutes
S1024,Aaliyah,Brooks,5,SLD,2026-09-12,150
S1025,Marcus,Chen,7,OHI,2026-06-30,90
S1027,Priya,Desai,3,Speech,2026-05-04,60
S1031,Jordan,Ellis,9,EBD,2025-11-20,240
S1042,Tomás,Flores,4,SLD,2026-08-01,120`;

interface ImportPreviewResp {
  ok: boolean;
  delimiter: string;
  rowCount: number;
  columns: string[];
  fieldMap: Array<{ source: string; target: string | null; confidence: number }>;
  rows: Array<Record<string, string>>;
  warnings: string[];
}

function ImportPreviewPanel({ districtId }: { districtId: number }) {
  const [text, setText] = useState<string>(SAMPLE_CSV);
  const [result, setResult] = useState<ImportPreviewResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPreview() {
    setBusy(true); setError(null);
    try {
      const resp = await authFetch(
        `/api/demo-control/import-preview?districtId=${districtId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as ImportPreviewResp;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="demo-control-slot-7" className="lg:col-span-2">
      <CardHeader className="py-3 bg-amber-50 border-b border-amber-100">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-[10px] text-amber-900">7</span>
          <FileSpreadsheet className="w-4 h-4" />
          Import / Spreadsheet Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-gray-500">
          Paste a CSV/TSV export from the prospect's SIS. Noverta will infer column mappings and
          show the first parsed rows. This is preview-only — nothing is written to the demo
          district.
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="font-mono text-xs"
          data-testid="textarea-import-preview"
          placeholder="Paste CSV or TSV here…"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={runPreview}
            disabled={busy || text.trim().length === 0}
            size="sm"
            className="gap-1"
            data-testid="button-run-import-preview"
          >
            <Eye className="w-3.5 h-3.5" />
            {busy ? "Parsing…" : "Preview parse"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setText(SAMPLE_CSV); setResult(null); setError(null); }}
            data-testid="button-reset-import-preview"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Load sample
          </Button>
          <Link href="/import">
            <Button variant="ghost" size="sm" className="gap-1 text-xs">
              <ExternalLink className="w-3.5 h-3.5" />
              Open full import flow
            </Button>
          </Link>
        </div>
        {error && (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {result && (
          <div className="space-y-3" data-testid="import-preview-result">
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 inline mr-1" />
                {result.rowCount} rows parsed
              </span>
              <span className="px-2 py-1 rounded bg-gray-100 text-gray-700">
                Delimiter: <code className="font-mono">{result.delimiter === "\t" ? "TAB" : result.delimiter}</code>
              </span>
              <span className="px-2 py-1 rounded bg-gray-100 text-gray-700">
                {result.columns.length} columns
              </span>
            </div>
            {result.fieldMap.length > 0 && (
              <div className="border rounded overflow-hidden">
                <div className="px-2 py-1 bg-gray-50 text-[10px] font-semibold text-gray-600 uppercase">
                  Field map (inferred)
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-2 py-1 font-medium">Source column</th>
                      <th className="text-left px-2 py-1 font-medium">Noverta field</th>
                      <th className="text-right px-2 py-1 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.fieldMap.map((m, i) => (
                      <tr key={i} className="border-t" data-testid={`row-fieldmap-${i}`}>
                        <td className="px-2 py-1 font-mono">{m.source}</td>
                        <td className="px-2 py-1">{m.target ?? <span className="text-gray-400 italic">unmapped</span>}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{Math.round(m.confidence * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.rows.length > 0 && (
              <div className="border rounded overflow-x-auto">
                <div className="px-2 py-1 bg-gray-50 text-[10px] font-semibold text-gray-600 uppercase">
                  First {result.rows.length} parsed rows
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      {result.columns.map((c) => (
                        <th key={c} className="text-left px-2 py-1 font-medium whitespace-nowrap">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-t">
                        {result.columns.map((c) => (
                          <td key={c} className="px-2 py-1 whitespace-nowrap">{row[c] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.warnings.length > 0 && (
              <ul className="text-xs text-amber-800 space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Panel 8 — Executive Packet Generator.
// Renders a one-page district summary backed by the same metric math as the
// Pilot Readout, plus a one-click PDF export. Replaces the deprecated
// standalone /leadership-packet page.
// ---------------------------------------------------------------------------
interface ExecPacketResp {
  ok: boolean;
  districtId: number;
  districtName: string;
  filename: string;
  html: string;
  summary: {
    compliancePct: number;
    total: number;
    affected: number;
    highRisk: number;
    exposureDollars: number;
    compEdMinutesOutstanding: number;
    overdueEvaluations: number;
    expiringIepsNext60: number;
    staffing: {
      avgCaseload: number;
      overloaded: number;
      maxCaseload: number;
      staffWithLoad: number;
      staffTotal: number;
    };
    trend: {
      capturedAt: string;
      compliancePts: number;
      exposureDollars: number;
      compEdMinutes: number;
      overdueEvaluations: number;
      expiringIeps: number;
    } | null;
  };
}

function fmtSigned(n: number, suffix = ""): string {
  const v = Math.round(n);
  if (v === 0) return `±0${suffix}`;
  return `${v > 0 ? "+" : ""}${v.toLocaleString()}${suffix}`;
}

function ExecPacketPanel({ districtId }: { districtId: number }) {
  const { data, isLoading, refetch, isFetching } = useQuery<ExecPacketResp>({
    queryKey: ["demo-control", "exec-packet", districtId],
    queryFn: () => apiGet<ExecPacketResp>(`/api/demo-control/exec-packet?districtId=${districtId}`),
    enabled: !!districtId,
  });
  const previewRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (data?.html && previewRef.current) {
      const doc = previewRef.current.contentDocument;
      if (doc) { doc.open(); doc.write(data.html); doc.close(); }
    }
  }, [data?.html]);

  const pdfUrl = `/api/demo-control/exec-packet.pdf?districtId=${districtId}`;
  const s = data?.summary;

  return (
    <Card data-testid="demo-control-slot-8" className="lg:col-span-3">
      <CardHeader className="py-3 bg-sky-50 border-b border-sky-100">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-sky-900">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-200 text-[10px] text-sky-900">8</span>
          <FileText className="w-4 h-4" />
          Executive Packet
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500 max-w-xl">
            One-page leadership summary for this demo district. Numbers come from the same
            pilot-baseline math as the Pilot Readout, plus staffing strain and a delta vs the
            Day-0 baseline. Export as a polished PDF for hand-off after the demo.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-exec-packet"
              className="gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" data-testid="link-exec-packet-pdf">
              <Button size="sm" className="gap-1">
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </Button>
            </a>
          </div>
        </div>

        {isLoading && <div className="text-xs text-gray-400 italic">Building packet…</div>}

        {s && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2" data-testid="exec-packet-kpis">
            <KpiTile label="Compliance" value={`${s.compliancePct}%`} sub={`${s.total} active students`} />
            <KpiTile label="Students at risk" value={String(s.affected)} sub={`${s.highRisk} high-risk`} />
            <KpiTile label="Comp-ed exposure" value={`$${s.exposureDollars.toLocaleString()}`} sub={`${s.compEdMinutesOutstanding.toLocaleString()} min outstanding`} />
            <KpiTile label="Overdue evaluations" value={String(s.overdueEvaluations)} sub="past 60-day deadline" />
            <KpiTile label="IEPs due next 60d" value={String(s.expiringIepsNext60)} sub="renewals coming up" />
            <KpiTile
              label="Staffing strain"
              value={String(s.staffing.avgCaseload)}
              sub={`${s.staffing.overloaded} CMs > 25 · max ${s.staffing.maxCaseload}`}
            />
          </div>
        )}

        {s?.trend ? (
          <div className="text-xs bg-sky-50 border border-sky-100 text-sky-900 rounded p-2" data-testid="exec-packet-trend">
            <span className="font-semibold">vs Day-0 baseline:</span>{" "}
            {fmtSigned(s.trend.compliancePts, " pts")} compliance ·{" "}
            {fmtSigned(-s.trend.exposureDollars)} exposure $ ·{" "}
            {fmtSigned(-s.trend.compEdMinutes)} comp-ed min ·{" "}
            {fmtSigned(-s.trend.overdueEvaluations)} overdue evals
          </div>
        ) : s ? (
          <div className="text-xs italic text-gray-500">
            No baseline captured yet — trend will populate after the next snapshot.
          </div>
        ) : null}

        {data?.html && (
          <div className="border rounded overflow-hidden" data-testid="exec-packet-preview">
            <div className="px-2 py-1 bg-gray-50 text-[10px] font-semibold text-gray-600 uppercase border-b">
              Preview
            </div>
            <iframe
              ref={previewRef}
              title="Executive packet preview"
              className="w-full"
              style={{ height: 480, background: "white" }}
              sandbox=""
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded p-2 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900 mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * A numbered, empty placeholder card. The remaining cluster tasks replace
 * these one-by-one with real panels in the same slot positions.
 */
function PlaceholderSlot({ num }: { num: number }) {
  return (
    <Card data-testid={`demo-control-slot-${num}`}>
      <CardHeader className="py-3 bg-gray-50 border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] text-gray-700"
            aria-label={`Panel slot ${num}`}
          >
            {num}
          </span>
          <span className="text-gray-500">Panel slot {num}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 text-sm text-gray-400">
        Reserved for an upcoming Demo Control Center panel.
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Panel 3 — Hero student / problem case generator
// ---------------------------------------------------------------------------
/**
 * One click to generate (or re-pin) the curated 6-archetype demo cast in the
 * active demo district. The backend is idempotent: running "Generate" twice
 * is a no-op and just returns the existing pinned cast. "Re-pin" clears the
 * cast tags and picks fresh archetype students.
 */
function HeroCastPanel({ districtId }: { districtId: number }) {
  const qc = useQueryClient();
  const [data, setData] = useState<HeroCastResponse | null>(null);

  const mutation = useMutation({
    mutationFn: (action: "ensure" | "refresh") =>
      apiPost<HeroCastResponse>("/api/demo-control/hero-cast", { districtId, action }),
    onSuccess: (resp, action) => {
      setData(resp);
      toast.success(action === "refresh"
        ? "Hero cast re-pinned."
        : "Hero cast ready.");
      // Anything that consumes alerts/comp-ed in the rest of the demo will
      // want a refetch.
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["compensatory-services"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to set up hero cast";
      toast.error(msg);
    },
  });

  const cast = data?.cast ?? [];
  const ensureLoading = mutation.isPending && mutation.variables === "ensure";
  const refreshLoading = mutation.isPending && mutation.variables === "refresh";

  return (
    <Card data-testid="demo-control-slot-3" className="md:col-span-2">
      <PanelHeader num={3} title="Hero cast" icon={Sparkles} />
      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-gray-500">
          Pins six archetype personas — overloaded case manager, missed-minutes
          student, comp-ed owed, overdue IEP, behavior-heavy, and a healthy
          success story. Idempotent: re-running won't duplicate.
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => mutation.mutate("ensure")}
            disabled={mutation.isPending}
            data-testid="button-hero-cast-generate"
            className="gap-1.5"
          >
            {ensureLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate cast
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => mutation.mutate("refresh")}
            disabled={mutation.isPending || cast.length === 0}
            data-testid="button-hero-cast-refresh"
            className="gap-1.5"
          >
            {refreshLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Re-pin
          </Button>
        </div>
        {cast.length > 0 && (
          <ul
            className="divide-y divide-gray-100 border border-gray-100 rounded-md"
            data-testid="hero-cast-list"
          >
            {cast.map((entry) => (
              <li
                key={entry.key}
                className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
                data-testid={`hero-cast-entry-${entry.key}`}
              >
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{entry.label}</div>
                  <div className="text-xs text-gray-500 truncate">{entry.description}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {entry.studentId != null && (
                    <Link href={`/students/${entry.studentId}`}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        data-testid={`hero-cast-link-student-${entry.studentId}`}
                      >
                        <Users className="w-3 h-3" />
                        {entry.studentName ?? `Student #${entry.studentId}`}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </Button>
                    </Link>
                  )}
                  {entry.staffId != null && entry.studentId == null && (
                    <Link href={`/staff/${entry.staffId}`}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        data-testid={`hero-cast-link-staff-${entry.staffId}`}
                      >
                        <Users className="w-3 h-3" />
                        {entry.staffName ?? `Staff #${entry.staffId}`}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </Button>
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {cast.length === 0 && !mutation.isPending && (
          <p className="text-xs text-gray-400 italic">
            No cast loaded yet. Click "Generate cast" to pin the curated personas.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Panel 12 — Environment reset / refresh district
// ---------------------------------------------------------------------------
/**
 * Wipes the active demo district's sample data and re-seeds it from a clean
 * baseline. Strong type-to-confirm gate so a stray click can't blow away
 * the demo mid-presentation. The backend additionally re-verifies
 * is_demo=true on the targeted district, so even a forged direct API call
 * cannot reset a real tenant.
 */
function ResetDistrictPanel({ districtId, districtName }: {
  districtId: number; districtName: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [lastResult, setLastResult] = useState<ResetResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () => apiPost<ResetResponse>("/api/demo-control/reset-district", { districtId }),
    onSuccess: (resp) => {
      setLastResult(resp);
      setOpen(false);
      setTyped("");
      toast.success(`Reset complete — ${districtName} restored to baseline.`);
      // Nuke every cached query — every list in the app is now stale.
      qc.invalidateQueries();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Reset failed";
      toast.error(msg);
    },
  });

  // Confirmation phrase must match the district name exactly. Case-insensitive
  // and whitespace-tolerant so muscle memory ("metrowest" instead of
  // "MetroWest Collaborative") doesn't trip up a quick reset between demos.
  const confirmReady = typed.trim().toLowerCase() === districtName.trim().toLowerCase();

  return (
    <Card data-testid="demo-control-slot-12" className="md:col-span-2 border-red-200">
      <PanelHeader num={12} title="Environment reset" icon={RefreshCw} />
      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-gray-500">
          Wipes <span className="font-medium text-gray-700">{districtName}</span>'s
          sample data and re-seeds the canonical demo baseline. Hard-locked to
          demo districts — cannot touch real tenants.
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => { setTyped(""); setOpen(true); }}
            disabled={mutation.isPending}
            data-testid="button-reset-district-open"
            className="gap-1.5"
          >
            {mutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            Reset district…
          </Button>
        </div>
        {lastResult && (
          <div
            className="text-xs text-gray-600 border border-gray-100 rounded-md p-2 bg-gray-50"
            data-testid="reset-district-result"
          >
            Last reset: {(lastResult.elapsedMs / 1000).toFixed(1)}s ·
            {" "}{lastResult.seed?.studentsCreated ?? 0} students,
            {" "}{lastResult.seed?.staffCreated ?? 0} staff seeded.
          </div>
        )}
      </CardContent>

      <AlertDialog open={open} onOpenChange={(o) => { if (!mutation.isPending) setOpen(o); }}>
        <AlertDialogContent data-testid="reset-district-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" /> Reset {districtName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This wipes every student, staff, alert, session, and obligation in
              this demo district and re-seeds the canonical baseline.
              {" "}<span className="font-medium">This cannot be undone.</span>
              {" "}Type the district name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 pt-2">
            <Label htmlFor="reset-confirm-input" className="text-xs text-gray-600">
              Type "<span className="font-mono">{districtName}</span>" to enable reset.
            </Label>
            <Input
              id="reset-confirm-input"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={districtName}
              disabled={mutation.isPending}
              data-testid="input-reset-confirm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={mutation.isPending}
              data-testid="button-reset-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); mutation.mutate(); }}
              disabled={!confirmReady || mutation.isPending}
              data-testid="button-reset-confirm"
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
            >
              {mutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Reset now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Panels 2 / 9 / 13 — narrative cluster (in-meeting controls)
// ---------------------------------------------------------------------------

function DemoFlowLauncherPanel() {
  const { flow, startFlow, exitFlow } = useDemoMode();
  return (
    <Card data-testid="demo-control-slot-2">
      <PanelHeader num={2} title="Demo flow launcher" icon={Compass} />
      <CardContent className="p-4">
        <p className="text-xs text-gray-500 mb-3">
          Start a persona walkthrough. The runner pins a "next step" widget to the screen so you don't have to fumble between routes mid-meeting.
        </p>
        <div className="space-y-2">
          {PERSONA_WALKTHROUGHS.map((wt) => {
            const active = flow?.flowId === wt.id;
            return (
              <button
                key={wt.id}
                type="button"
                onClick={() => startFlow(wt.id)}
                data-testid={`button-launch-flow-${wt.id}`}
                className={`w-full text-left rounded-md border px-3 py-2 transition ${
                  active
                    ? "border-amber-400 bg-amber-50"
                    : "border-gray-200 hover:border-amber-300 hover:bg-amber-50/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900">{wt.label} walkthrough</span>
                  <span className="text-[11px] text-gray-500">{wt.steps.length} steps</span>
                </div>
                <div className="text-[12px] text-gray-500 mt-0.5">{wt.blurb}</div>
              </button>
            );
          })}
        </div>
        {flow && (
          <button
            type="button"
            onClick={exitFlow}
            data-testid="button-stop-flow"
            className="mt-3 w-full text-xs text-gray-600 hover:text-gray-900 underline"
          >
            Stop the active walkthrough
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function RoleWalkthroughTogglePanel() {
  const { role, setRole, isPlatformAdmin } = useRole();
  const [, navigate] = useLocation();
  return (
    <Card data-testid="demo-control-slot-9">
      <PanelHeader num={9} title="Role-based walkthrough" icon={Users} />
      <CardContent className="p-4">
        <p className="text-xs text-gray-500 mb-3">
          Switch the visible district story by persona. Filters dashboards and nav to that role's surfaces. Override is scoped to your session and only available to platform admins on demo districts.
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {PERSONA_TOGGLE.map((p) => {
            const active = role === p.role;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!isPlatformAdmin}
                onClick={() => {
                  setRole(p.role);
                  // setRole navigates to ROLE_HOME; for personas whose
                  // landing surface differs (e.g. Executive → /executive)
                  // override on the next tick so the persona-specific
                  // surface is what the audience sees.
                  setTimeout(() => navigate(p.homeHref), 0);
                }}
                data-testid={`button-toggle-role-${p.id}`}
                className={`text-left rounded-md border px-2.5 py-2 text-xs font-medium transition ${
                  active
                    ? "border-amber-400 bg-amber-50 text-amber-900"
                    : "border-gray-200 hover:border-amber-300 hover:bg-amber-50/40 text-gray-800"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {p.label}
                <div className="text-[10.5px] font-normal text-gray-500">{p.homeHref}</div>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            setRole("admin");
            setTimeout(() => navigate("/demo-control-center"), 0);
          }}
          data-testid="button-revert-role"
          className="mt-3 inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
        >
          <RotateCcw className="w-3 h-3" /> Revert to Admin
        </button>
      </CardContent>
    </Card>
  );
}

function FeatureHighlightModePanel() {
  const { highlightMode, setHighlightMode } = useDemoMode();
  return (
    <Card data-testid="demo-control-slot-13">
      <PanelHeader num={13} title="Feature highlight mode" icon={Lightbulb} />
      <CardContent className="p-4">
        <p className="text-xs text-gray-500 mb-3">
          Optional in-app overlay. Highlights why a given alert exists, how a student got at risk, and how the most recent logged session updated compliance.
        </p>
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
          <div>
            <div className="text-sm font-medium text-gray-900">Highlight mode</div>
            <div className="text-[11px] text-gray-500">
              {highlightMode ? "On — overlays visible across the app" : "Off"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHighlightMode(!highlightMode)}
            data-testid="button-toggle-highlight-mode"
            aria-pressed={highlightMode}
            className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium transition ${
              highlightMode
                ? "bg-amber-600 text-white hover:bg-amber-700"
                : "bg-gray-100 text-gray-800 hover:bg-gray-200"
            }`}
          >
            {highlightMode ? "Turn off" : "Turn on"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DemoControlCenterPage() {
  const { isPlatformAdmin } = useRole();
  const demoDistrict = useActiveDemoDistrict();
  const { setSelectedDistrictId } = useSchoolContext();

  const { data: overview } = useQuery<OverviewResponse>({
    queryKey: ["demo-control", "overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/demo-control/overview"),
    enabled: isPlatformAdmin && !!demoDistrict,
  });

  if (!isPlatformAdmin) return <NotFoundStub />;
  if (!demoDistrict) return <NotFoundStub />;

  const demoOptions = overview?.demoDistricts ?? [];

  // Render slots in order; replace the implemented slots with their real
  // panels and leave the rest as numbered placeholders.
  const renderSlot = (n: number) => {
    // Key filled panels by both slot AND demo district id so switching the
    // active demo district unmounts/remounts them — that drops any local
    // cast / reset-result state from the previous district instead of
    // leaving stale rows visible.
    if (n === 1) return <ReadinessPanel key={`${n}-${demoDistrict.id}`} districtId={demoDistrict.id} />;
    if (n === 2) return <DemoFlowLauncherPanel key={n} />;
    if (n === 3) return <HeroCastPanel key={`${n}-${demoDistrict.id}`} districtId={demoDistrict.id} />;
    if (n === 4) return <BeforeAfterPanel key={`${n}-${demoDistrict.id}`} districtName={demoDistrict.name} />;
    if (n === 5) return <CompExposurePanel key={`${n}-${demoDistrict.id}`} districtId={demoDistrict.id} />;
    if (n === 6) return <CaseloadSimulatorPanel key={`${n}-${demoDistrict.id}`} districtId={demoDistrict.id} />;
    if (n === 7) return <ImportPreviewPanel key={`${n}-${demoDistrict.id}`} districtId={demoDistrict.id} />;
    if (n === 8) return <ExecPacketPanel key={`${n}-${demoDistrict.id}`} districtId={demoDistrict.id} />;
    if (n === 9) return <RoleWalkthroughTogglePanel key={n} />;
    if (n === 10) return <RealismPanel key={`${n}-${demoDistrict.id}`} districtId={demoDistrict.id} />;
    if (n === 11) return <AlertTunerPanel key={`${n}-${demoDistrict.id}`} districtId={demoDistrict.id} />;
    if (n === 12) return (
      <ResetDistrictPanel
        key={`${n}-${demoDistrict.id}`}
        districtId={demoDistrict.id}
        districtName={demoDistrict.name}
      />
    );
    if (n === 13) return <FeatureHighlightModePanel key={n} />;
    return <PlaceholderSlot key={n} num={n} />;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-amber-600" />
            Demo Control Center
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Internal console for running flawless Noverta demos. All actions are scoped to demo districts only.
            {" "}Targeting <span className="font-medium text-gray-700">{demoDistrict.name}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="demo-district-selector" className="text-xs text-gray-500 whitespace-nowrap">
            Demo district
          </Label>
          <Select
            value={String(demoDistrict.id)}
            onValueChange={(v) => setSelectedDistrictId(Number(v))}
            disabled={demoOptions.length <= 1}
          >
            <SelectTrigger
              id="demo-district-selector"
              data-testid="select-demo-district"
              className="w-[240px] h-8 text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {demoOptions.map((d) => (
                <SelectItem
                  key={d.id}
                  value={String(d.id)}
                  data-testid={`option-demo-district-${d.id}`}
                >
                  {d.name}
                </SelectItem>
              ))}
              {demoOptions.length === 0 && (
                <SelectItem value={String(demoDistrict.id)} data-testid={`option-demo-district-${demoDistrict.id}`}>
                  {demoDistrict.name}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Link href="/admin/demo-readiness">
            <Button variant="outline" size="sm" className="gap-2">
              <Activity className="w-3.5 h-3.5" />Open Pre-Flight
            </Button>
          </Link>
        </div>
      </header>

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        data-testid="demo-control-grid"
      >
        {Array.from({ length: TOTAL_PANEL_SLOTS }, (_, i) => renderSlot(i + 1))}
      </div>
    </div>
  );
}
