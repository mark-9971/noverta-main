import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  CheckCircle2, AlertTriangle, XCircle, Loader2, ShieldCheck, ChevronRight,
  FlaskConical, Sparkles,
} from "lucide-react";
import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";

type ReadinessStatus = "pass" | "warn" | "fail";

interface ReadinessCheck {
  id: string;
  group: "data" | "config" | "operations";
  label: string;
  status: ReadinessStatus;
  detail: string;
  fixHref?: string;
}

interface ReadinessReport {
  districtName: string | null;
  checks: ReadinessCheck[];
  summary: { pass: number; warn: number; fail: number; total: number };
}

const STATUS_ICON = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
};

const STATUS_COLOR = {
  pass: "text-emerald-600",
  warn: "text-amber-600",
  fail: "text-red-600",
};

const GROUP_LABEL: Record<ReadinessCheck["group"], string> = {
  data: "Data",
  config: "Configuration",
  operations: "Operations",
};

export default function PilotReadinessPanel() {
  const { data, isLoading, error } = useQuery<ReadinessReport>({
    queryKey: ["pilot-readiness"],
    queryFn: async () => {
      const res = await authFetch("/api/admin/pilot-readiness");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking pilot readiness…
        </div>
      </section>
    );
  }

  if (error || !data) return null;

  // Show fails and warns prominently; group passes into a single summary row.
  const issues = data.checks.filter((c) => c.status !== "pass");
  const allGood = issues.length === 0;

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-900">Pilot Readiness</h3>
          <span className="text-xs text-gray-500">
            {data.summary.pass} of {data.summary.total} checks passing
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {data.summary.warn > 0 && <span className="text-amber-700">{data.summary.warn} warn</span>}
          {data.summary.fail > 0 && <span className="text-red-700">{data.summary.fail} blocking</span>}
        </div>
      </header>

      {allGood ? (
        <p className="text-sm text-emerald-700">
          All {data.summary.total} readiness checks pass. Your district is set up to use Trellis in production.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {issues.map((check) => {
            const Icon = STATUS_ICON[check.status];
            const inner = (
              <div className="flex items-start gap-3 py-2.5">
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${STATUS_COLOR[check.status]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-gray-900">{check.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">
                      {GROUP_LABEL[check.group]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{check.detail}</p>
                </div>
                {check.fixHref && (
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                )}
              </div>
            );
            return (
              <li key={check.id}>
                {check.fixHref ? (
                  <Link href={check.fixHref} className="block hover:bg-gray-50 -mx-2 px-2 rounded">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}

      <SampleDataRestoreFooter />
    </section>
  );
}

interface SampleStatus {
  hasSampleData: boolean;
  sampleStudents: number;
  sampleStaff: number;
}

/**
 * Roster-size presets exposed to the admin. `null` means "let the seeder
 * pick its default" (~63 students for the small profile). Custom values
 * are clamped to 60–1000 — the seeder accepts up to 5000 but the wizard
 * surface caps at 1000 to keep demo turn-around reasonable. Staff /
 * providers / paras / case managers / schools auto-scale via the
 * seeder's existing `staffStudentCount` plumbing.
 */
const ROSTER_PRESETS: { label: string; value: number | null; blurb: string }[] = [
  { label: "Small",   value: null, blurb: "~63 students · default" },
  { label: "Medium",  value: 140,  blurb: "Multi-school caseload" },
  { label: "Large",   value: 220,  blurb: "District-wide demo" },
  { label: "XL",      value: 500,  blurb: "Stress-test charts" },
  { label: "Stress",  value: 1000, blurb: "Peak-load preview" },
];

function approxStaff(students: number): { providers: number; paras: number; cms: number } {
  // Mirrors the seeder's per-specialty STAFF_RATIOS (lib/db roster/staff.ts):
  //   Speech 1:75, OT 1:80, PT 1:250, Counselor 1:150 → providers = sum of 4
  //   Paraprofessional 1:60, Case Manager 1:22.
  // We keep this as a "rough estimate" — the server applies a load-aware
  // floor (loadAwareFloor) that may bump these up further when the worst-case
  // monthly minutes per specialty exceed PROVIDER_MONTHLY_MIN_CAPACITY.
  const speech    = Math.ceil(students / 75);
  const ot        = Math.ceil(students / 80);
  const pt        = Math.ceil(students / 250);
  const counselor = Math.ceil(students / 150);
  return {
    providers: speech + ot + pt + counselor,
    paras:     Math.ceil(students / 60),
    cms:       Math.ceil(students / 22),
  };
}

/**
 * Persistent affordance that lets an admin reseed sample data after they've
 * torn it down. Lives in the readiness panel so it's reachable from the main
 * admin dashboard (not just the /setup wizard). When sample data is already
 * present, surfaces a "Replace at new size" path so the operator can resize
 * the demo roster without first running a separate teardown.
 */
function SampleDataRestoreFooter() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [alreadySeededNotice, setAlreadySeededNotice] = useState<string | null>(null);
  // null  = use default (small profile)
  // 60-1000 = explicit targetStudents passed to the seeder
  const [targetStudents, setTargetStudents] = useState<number | null>(null);
  const isAdmin = role === "admin" || role === "coordinator";

  const { data, isLoading } = useQuery<SampleStatus>({
    queryKey: ["sample-data/status"],
    queryFn: async () => {
      const r = await authFetch("/api/sample-data");
      if (!r.ok) throw new Error("sample-data status failed");
      return r.json();
    },
    staleTime: 60_000,
    enabled: isAdmin,
  });

  const seed = useMutation({
    mutationFn: async (opts: { replaceExisting: boolean }) => {
      // Replace path: tear down first so the second POST takes the new
      // targetStudents value (the route is idempotent and would otherwise
      // no-op).
      if (opts.replaceExisting) {
        const del = await authFetch("/api/sample-data", { method: "DELETE" });
        if (!del.ok) {
          const body = await del.json().catch(() => ({}));
          throw new Error(body?.error || "Failed to remove existing sample data");
        }
      }
      const body = targetStudents != null ? { targetStudents } : undefined;
      const r = await authFetch("/api/sample-data", {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const respBody = await r.json().catch(() => ({}));
      if (!r.ok) {
        const code = typeof respBody?.code === "string" ? respBody.code : null;
        const detail = typeof respBody?.detail === "string" ? respBody.detail : null;
        const base = respBody?.error || "Failed to load sample data";
        const msg = code && detail
          ? `${base} (${code}): ${detail}`
          : code
            ? `${base} (${code})`
            : base;
        throw new Error(msg);
      }
      return respBody;
    },
    onSuccess: (body, vars) => {
      queryClient.invalidateQueries();
      if (body?.alreadySeeded) {
        const students = body?.sampleStudents ?? 0;
        const staff = body?.sampleStaff ?? 0;
        setAlreadySeededNotice(
          `Sample data was already present — no new rows added (${students} sample student${students === 1 ? "" : "s"}, ${staff} sample staff). Use "Replace at new size" to resize.`,
        );
        return;
      }
      if (vars.replaceExisting) {
        // Stay on the dashboard — the global banner will re-render with
        // the new counts.
        setAlreadySeededNotice(null);
        return;
      }
      navigate("/compliance-risk-report");
    },
    onError: (e: unknown) => {
      // The replace flow is DELETE→POST without a server-side rollback —
      // if POST fails after a successful DELETE, the existing roster is
      // already gone. Refetch the status query so the banner + button
      // text reflect the post-delete (likely empty) reality instead of
      // the pre-delete `hasData=true` cache.
      queryClient.invalidateQueries({ queryKey: ["sample-data/status"] });
      setError(e instanceof Error ? e.message : "Failed to load sample data");
    },
  });

  if (!isAdmin || isLoading || !data) return null;

  const hasData = data.hasSampleData;
  const previewN = targetStudents ?? 63;
  const staffPreview = approxStaff(previewN);

  return (
    <div
      className="mt-4 pt-3 border-t border-gray-100 space-y-2.5"
      data-testid="readiness-add-sample-data"
    >
      <div className="flex items-start gap-3">
        <FlaskConical className="w-4 h-4 text-emerald-700 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-900">
            {hasData ? "Resize the sample roster" : "Need a populated workspace for a demo?"}
          </p>
          <p className="text-[11px] text-gray-500">
            {hasData
              ? `Currently ${data.sampleStudents} students · ${data.sampleStaff} staff. Pick a new size below to wipe + reseed.`
              : `Pick a roster size — staff, schools, sessions, and curated spotlight cases all scale together.`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Roster size presets">
        {ROSTER_PRESETS.map((p) => {
          const active = p.value === targetStudents;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => setTargetStudents(p.value)}
              className={`text-[11px] font-medium px-2 py-1 rounded border transition-colors ${
                active
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
              }`}
              title={p.blurb}
              data-testid={`button-roster-preset-${p.label.toLowerCase()}`}
            >
              {p.label}
              <span className="ml-1 text-[10px] opacity-70">
                {p.value ?? 63}
              </span>
            </button>
          );
        })}
        <label className="flex items-center gap-1 text-[11px] text-gray-600 ml-1">
          <span>or</span>
          <input
            type="number"
            min={60}
            max={1000}
            step={10}
            value={targetStudents ?? ""}
            placeholder="custom"
            onChange={(e) => {
              const v = e.target.value.trim();
              if (v === "") { setTargetStudents(null); return; }
              const n = Math.max(60, Math.min(1000, Math.round(Number(v))));
              if (Number.isFinite(n)) setTargetStudents(n);
            }}
            className="w-16 px-1.5 py-0.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:border-emerald-400"
            data-testid="input-roster-custom"
          />
        </label>
      </div>

      <p className="text-[10px] text-gray-400">
        Will provision ≈{previewN} students, ≈{staffPreview.providers} providers,
        ≈{staffPreview.paras} paras, ≈{staffPreview.cms} case managers
        (server applies the canonical scaling clamp).
      </p>

      {error && <p className="text-[11px] text-red-600">{error}</p>}
      {alreadySeededNotice && (
        <p
          className="text-[11px] text-sky-700"
          data-testid="text-already-seeded-notice"
        >
          {alreadySeededNotice}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setError(null);
            setAlreadySeededNotice(null);
            seed.mutate({ replaceExisting: hasData });
          }}
          disabled={seed.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-md hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
          data-testid="button-add-sample-data"
        >
          {seed.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {hasData
            ? `Replace at ${previewN} students`
            : `Add ${previewN} sample students`}
        </button>
      </div>
    </div>
  );
}
