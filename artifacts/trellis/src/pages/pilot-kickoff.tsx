/**
 * Pilot Kickoff CSV import wizard.
 *
 * Goal: get a brand-new pilot district to "live with real students, staff,
 * services, and schedules" in under 30 minutes — without waiting on IT to
 * stand up an SIS sync. Lives alongside (and is intentionally simpler than)
 * the full /import data import surface.
 *
 * Flow: students → staff → services → schedules → summary.
 *
 * Each step is independent: the admin can download a template, upload a CSV,
 * see row-level validation errors inline, fix the file, and re-upload as
 * many times as they want without losing prior steps. Successful imports are
 * tagged source = "pilot_csv" on the server so reconciliation with a future
 * SIS sync is unambiguous.
 */
import { useState, useMemo, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  Users, UserPlus, ClipboardList, CalendarClock, CheckCircle2, Circle,
  Download, Upload, ArrowRight, ArrowLeft, AlertTriangle, RefreshCw,
  Rocket, XCircle, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/auth-fetch";

type StepKey = "students" | "staff" | "services" | "schedules";

interface StepDef {
  key: StepKey;
  label: string;
  icon: typeof Users;
  templateKey: string;
  importPath: string;
  blurb: string;
  prereq?: string;
  requiredCols: string;
  validateFirst?: boolean;
  validateType?: string;
}

const STEPS: StepDef[] = [
  {
    key: "students",
    label: "Students",
    icon: Users,
    templateKey: "students",
    importPath: "/api/imports/students",
    blurb: "Upload your SPED roster — names, grades, disability category, and case manager.",
    requiredCols: "first_name, last_name (everything else optional)",
  },
  {
    key: "staff",
    label: "Staff",
    icon: UserPlus,
    templateKey: "staff",
    importPath: "/api/imports/staff",
    blurb: "Upload providers, paras, case managers, and admins who will use Noverta.",
    requiredCols: "first_name, last_name, role",
  },
  {
    key: "services",
    label: "Services",
    icon: ClipboardList,
    templateKey: "service_requirements",
    importPath: "/api/imports/service-requirements",
    blurb: "Upload IEP-mandated service minutes per student. Each row is one student's mandate for one service type.",
    prereq: "Students must be imported first — each student name or ID in this file must match your student roster.",
    requiredCols: "service_type, required_minutes  +  student_external_id OR (student_first_name + student_last_name)",
    validateFirst: true,
    validateType: "service-requirements",
  },
  {
    key: "schedules",
    label: "Schedules",
    icon: CalendarClock,
    templateKey: "staff_schedules",
    importPath: "/api/imports/staff-schedules",
    blurb: "Upload each provider's weekly schedule blocks (one row per day).",
    prereq: "Staff must be imported first.",
    requiredCols: "staff identifier, school, day_of_week, start_time, end_time",
  },
];

interface StepResult {
  imported: number;
  updated?: number;
  skipped?: number;
  errored: number;
  rowsProcessed: number;
  errors: string[];
}

type StepState =
  | { status: "idle" }
  | { status: "uploading"; fileName: string }
  | { status: "result"; fileName: string; result: StepResult };

interface CumulativeStats {
  imported: number;
  skipped: number;
  errored: number;
}

export default function PilotKickoffWizard() {
  const [, setLocation] = useLocation();
  const [activeIdx, setActiveIdx] = useState(0);
  const [stepState, setStepState] = useState<Record<StepKey, StepState>>({
    students: { status: "idle" },
    staff: { status: "idle" },
    services: { status: "idle" },
    schedules: { status: "idle" },
  });
  // Cumulative totals across every upload attempt for each step. Re-uploading
  // a deduped CSV must NOT regress these counts — they only grow.
  const [cumulative, setCumulative] = useState<Record<StepKey, CumulativeStats>>({
    students: { imported: 0, skipped: 0, errored: 0 },
    staff: { imported: 0, skipped: 0, errored: 0 },
    services: { imported: 0, skipped: 0, errored: 0 },
    schedules: { imported: 0, skipped: 0, errored: 0 },
  });
  // Once a step has successfully imported or successfully deduped (imported==0
  // && errored==0 && skipped>0, meaning rows already exist on the server), we
  // remember it as done so re-uploading a fully-deduped file doesn't regress.
  const [everDone, setEverDone] = useState<Record<StepKey, boolean>>({
    students: false, staff: false, services: false, schedules: false,
  });
  const [completed, setCompleted] = useState(false);

  const active = STEPS[activeIdx];
  const stepDone = (k: StepKey) => everDone[k];

  const handleStepChange = (key: StepKey, next: StepState) => {
    setStepState(prev => ({ ...prev, [key]: next }));
    if (next.status === "result") {
      const r = next.result;
      setCumulative(prev => ({
        ...prev,
        [key]: {
          imported: prev[key].imported + r.imported + (r.updated ?? 0),
          skipped: prev[key].skipped + (r.skipped ?? 0),
          errored: prev[key].errored + r.errored,
        },
      }));
      const importedSomething = r.imported > 0 || (r.updated ?? 0) > 0;
      const fullyDeduped = r.errored === 0 && r.imported === 0 && (r.skipped ?? 0) > 0;
      if (importedSomething || fullyDeduped) {
        setEverDone(prev => ({ ...prev, [key]: true }));
      }
    }
  };

  const totalImported = useMemo(
    () => STEPS.reduce((sum, s) => sum + cumulative[s.key].imported, 0),
    [cumulative],
  );
  const totalSkipped = useMemo(
    () => STEPS.reduce((sum, s) => sum + cumulative[s.key].skipped + cumulative[s.key].errored, 0),
    [cumulative],
  );

  if (completed) {
    return <SummaryScreen
      stepState={stepState}
      totalImported={totalImported}
      totalSkipped={totalSkipped}
      onContinue={() => setLocation("/dashboard")}
      onBack={() => setCompleted(false)}
    />;
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto" data-testid="page-pilot-kickoff">
      <header className="mb-6">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5 mb-2">
          <Rocket className="w-3 h-3" /> Pilot kickoff
        </div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Get your pilot live with a CSV import</h1>
        <p className="text-sm text-gray-500 mt-1.5 max-w-2xl">
          No SIS sync needed. Walk through four CSV uploads — students, staff,
          services, and weekly schedules — and you'll be tracking compliance in
          under 30 minutes. Imported rows are tagged so they reconcile cleanly
          when SIS sync goes live later.
        </p>
      </header>

      <Stepper steps={STEPS} activeIdx={activeIdx} stepDone={stepDone} onJump={setActiveIdx} />

      <Card className="mt-4" data-testid={`card-step-${active.key}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <active.icon className="w-4 h-4 text-emerald-600" />
            Step {activeIdx + 1} of {STEPS.length}: {active.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">{active.blurb}</p>
          <div className="rounded-md bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600 space-y-1">
            <div><span className="font-semibold text-gray-700">Required columns:</span> {active.requiredCols}</div>
            {active.prereq && (
              <div className="flex items-center gap-1.5 text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5" /> {active.prereq}
              </div>
            )}
          </div>

          <StepUploader
            step={active}
            state={stepState[active.key]}
            onChange={(s) => handleStepChange(active.key, s)}
          />

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
            <Button
              variant="ghost"
              size="sm"
              disabled={activeIdx === 0}
              onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
              data-testid="button-step-back"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => activeIdx < STEPS.length - 1 ? setActiveIdx(i => i + 1) : setCompleted(true)}
                data-testid="button-step-skip"
              >
                Skip for now
              </Button>
              {activeIdx < STEPS.length - 1 ? (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setActiveIdx(i => i + 1)}
                  disabled={!stepDone(active.key)}
                  data-testid="button-step-next"
                >
                  Next: {STEPS[activeIdx + 1].label} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setCompleted(true)}
                  data-testid="button-step-finish"
                >
                  Finish import <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400 mt-4 text-center">
        Rows you've already imported are persisted in Noverta — re-uploading a
        corrected CSV won't create duplicates.{" "}
        <Link href="/onboarding" className="underline hover:text-gray-600">Back to onboarding hub</Link>
      </p>
    </div>
  );
}

function Stepper({ steps, activeIdx, stepDone, onJump }: {
  steps: StepDef[];
  activeIdx: number;
  stepDone: (k: StepKey) => boolean;
  onJump: (i: number) => void;
}) {
  return (
    <ol className="flex items-center gap-1 text-xs flex-wrap" data-testid="pilot-kickoff-stepper">
      {steps.map((s, i) => {
        const done = stepDone(s.key);
        const active = i === activeIdx;
        return (
          <li key={s.key} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onJump(i)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors ${
                active
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
                  : done
                    ? "bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50/50"
                    : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
              data-testid={`stepper-step-${s.key}`}
            >
              {done
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                : <Circle className="w-3.5 h-3.5 text-gray-300" />}
              <span>{i + 1}. {s.label}</span>
            </button>
            {i < steps.length - 1 && <span className="text-gray-300">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

interface ValidationPreview {
  fileName: string;
  csvData: string;
  valid: number;
  warnings: number;
  errors: number;
  total: number;
  errorMessages: string[];
}

function StepUploader({ step, state, onChange }: {
  step: StepDef;
  state: StepState;
  onChange: (s: StepState) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [preview, setPreview] = useState<ValidationPreview | null>(null);

  async function downloadTemplate() {
    try {
      const r = await authFetch(`/api/imports/templates/${step.templateKey}`);
      if (!r.ok) { setError(`Failed to fetch template (${r.status})`); return; }
      const csv = await r.text();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `noverta_${step.templateKey}_template.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "Could not download template");
    }
  }

  async function doImport(csvData: string, fileName: string) {
    setPreview(null);
    onChange({ status: "uploading", fileName });
    try {
      const r = await authFetch(step.importPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvData, fileName, source: "pilot_csv", duplicateHandling: "skip" }),
      });
      if (!r.ok) {
        let msg = `Upload failed (${r.status})`;
        try { const j = await r.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
        setError(msg);
        onChange({ status: "idle" });
        return;
      }
      const data = await r.json();
      onChange({
        status: "result", fileName, result: {
          imported: data.rowsImported ?? 0,
          updated: data.rowsUpdated ?? 0,
          skipped: data.rowsSkipped ?? 0,
          errored: data.rowsErrored ?? 0,
          rowsProcessed: data.rowsProcessed ?? 0,
          errors: data.errors ?? [],
        },
      });
    } catch (e: any) {
      setError(e?.message || "Upload failed");
      onChange({ status: "idle" });
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setPreview(null);
    const text = await file.text();

    if (step.validateFirst && step.validateType) {
      setValidating(true);
      try {
        const r = await authFetch("/api/imports/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csvData: text, importType: step.validateType }),
        });
        if (!r.ok) {
          let msg = `Validation failed (${r.status})`;
          try { const j = await r.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
          setError(msg);
          setValidating(false);
          return;
        }
        const vdata = await r.json();
        const rows: Array<{ status: string; messages: string[] }> = vdata.validations ?? [];
        const valid = rows.filter(r => r.status === "valid").length;
        const warnings = rows.filter(r => r.status === "warning").length;
        const errors = rows.filter(r => r.status === "error").length;
        const errorMessages = rows
          .flatMap((r, i) => r.status === "error" ? r.messages.map(m => `Row ${i + 2}: ${m}`) : [])
          .slice(0, 20);
        setPreview({ fileName: file.name, csvData: text, valid, warnings, errors, total: rows.length, errorMessages });
      } catch (e: any) {
        setError(e?.message || "Validation failed");
      } finally {
        setValidating(false);
      }
      return;
    }

    await doImport(text, file.name);
  }

  const busy = state.status === "uploading" || validating;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={downloadTemplate} data-testid={`button-download-template-${step.key}`}>
          <Download className="w-3.5 h-3.5 mr-1.5" /> Download CSV template
        </Button>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={() => { setPreview(null); fileRef.current?.click(); }}
          disabled={busy}
          data-testid={`button-upload-${step.key}`}
        >
          {validating
            ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Checking…</>
            : state.status === "uploading"
              ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Uploading…</>
              : preview || state.status === "result"
                ? <><Upload className="w-3.5 h-3.5 mr-1.5" /> Choose different CSV</>
                : step.validateFirst
                  ? <><ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Validate &amp; Import CSV</>
                  : <><Upload className="w-3.5 h-3.5 mr-1.5" /> Upload CSV</>}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
          data-testid={`input-file-${step.key}`}
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2" data-testid={`step-error-${step.key}`}>
          <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}

      {preview && state.status !== "result" && (
        <ValidationPreviewCard
          preview={preview}
          onConfirm={() => void doImport(preview.csvData, preview.fileName)}
          onCancel={() => setPreview(null)}
          stepKey={step.key}
        />
      )}

      {state.status === "result" && (
        <ResultPanel stepKey={step.key} fileName={state.fileName} result={state.result} />
      )}
    </div>
  );
}

function ValidationPreviewCard({ preview, onConfirm, onCancel, stepKey }: {
  preview: ValidationPreview;
  onConfirm: () => void;
  onCancel: () => void;
  stepKey: StepKey;
}) {
  const allGood = preview.errors === 0;
  const tone = allGood ? "emerald" : preview.valid === 0 ? "red" : "amber";
  const borderCls = tone === "emerald" ? "border-emerald-200 bg-emerald-50" : tone === "red" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50";
  const headingCls = tone === "emerald" ? "text-emerald-800" : tone === "red" ? "text-red-800" : "text-amber-800";

  return (
    <div className={`rounded-md border px-3 py-3 text-xs space-y-3 ${borderCls}`} data-testid={`validation-preview-${stepKey}`}>
      <div className={`font-semibold flex items-center gap-1.5 ${headingCls}`}>
        {allGood
          ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {preview.total} row{preview.total !== 1 ? "s" : ""} validated — ready to import</>
          : preview.valid === 0
            ? <><XCircle className="w-4 h-4 text-red-600" /> All {preview.total} rows have errors — fix your CSV before importing</>
            : <><AlertTriangle className="w-4 h-4 text-amber-600" /> {preview.errors} of {preview.total} rows have errors</>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/70 border border-gray-100 rounded px-2 py-1.5 text-center">
          <div className="text-[10px] uppercase tracking-wide text-emerald-600">Ready</div>
          <div className="text-sm font-semibold text-gray-900">{preview.valid + preview.warnings}</div>
        </div>
        {preview.errors > 0 && (
          <div className="bg-white/70 border border-gray-100 rounded px-2 py-1.5 text-center">
            <div className="text-[10px] uppercase tracking-wide text-red-600">Errors</div>
            <div className="text-sm font-semibold text-red-700">{preview.errors}</div>
          </div>
        )}
        <div className="bg-white/70 border border-gray-100 rounded px-2 py-1.5 text-center">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">Total rows</div>
          <div className="text-sm font-semibold text-gray-900">{preview.total}</div>
        </div>
      </div>
      {preview.errorMessages.length > 0 && (
        <details data-testid={`validation-errors-${stepKey}`}>
          <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
            {preview.errors} issue{preview.errors !== 1 ? "s" : ""} to fix — expand to see details
          </summary>
          <ul className="mt-1.5 space-y-0.5 max-h-40 overflow-auto pl-3 list-disc text-gray-700">
            {preview.errorMessages.map((msg, i) => <li key={i}>{msg}</li>)}
          </ul>
        </details>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} data-testid={`button-validation-cancel-${stepKey}`}>
          Fix CSV and re-upload
        </Button>
        {(preview.valid + preview.warnings) > 0 && (
          <Button
            size="sm"
            className={allGood ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}
            onClick={onConfirm}
            data-testid={`button-validation-confirm-${stepKey}`}
          >
            {allGood
              ? <>Import all {preview.valid + preview.warnings} rows <ArrowRight className="w-3.5 h-3.5 ml-1" /></>
              : <>Import {preview.valid + preview.warnings} valid rows, skip {preview.errors} <ArrowRight className="w-3.5 h-3.5 ml-1" /></>}
          </Button>
        )}
      </div>
    </div>
  );
}

function ResultPanel({ stepKey, fileName, result }: { stepKey: StepKey; fileName: string; result: StepResult }) {
  const successful = result.imported + (result.updated ?? 0);
  const failed = result.errored + (result.skipped ?? 0);
  const allFailed = successful === 0 && failed > 0;
  const partial = successful > 0 && failed > 0;

  return (
    <div
      className={`rounded-md border px-3 py-3 text-xs space-y-2 ${
        allFailed ? "border-red-200 bg-red-50" :
          partial ? "border-amber-200 bg-amber-50" :
            "border-emerald-200 bg-emerald-50"
      }`}
      data-testid={`step-result-${stepKey}`}
    >
      <div className="flex items-center gap-2 font-semibold">
        {allFailed
          ? <><XCircle className="w-4 h-4 text-red-600" /> No rows imported from {fileName}</>
          : partial
            ? <><AlertTriangle className="w-4 h-4 text-amber-600" /> Imported with errors — {fileName}</>
            : <><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Imported {fileName}</>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <Stat label="Rows in file" value={result.rowsProcessed} />
        <Stat label="Imported" value={result.imported} />
        {(result.updated ?? 0) > 0 && <Stat label="Updated" value={result.updated!} />}
        {(result.skipped ?? 0) > 0 && <Stat label="Skipped" value={result.skipped!} />}
        {result.errored > 0 && <Stat label="Errored" value={result.errored} tone="bad" />}
      </div>
      {result.errors.length > 0 && (
        <details className="mt-1" data-testid={`step-errors-${stepKey}`}>
          <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
            {result.errors.length} row issue{result.errors.length === 1 ? "" : "s"} — fix these in your CSV and re-upload
          </summary>
          <ul className="mt-1.5 space-y-0.5 max-h-48 overflow-auto pl-3 list-disc text-gray-700">
            {result.errors.map((err, i) => (
              <li key={i} data-testid={`step-error-row-${stepKey}-${i}`}>{err}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className="bg-white/70 border border-gray-100 rounded px-2 py-1.5">
      <div className={`text-[10px] uppercase tracking-wide ${tone === "bad" ? "text-red-600" : "text-gray-400"}`}>{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tone === "bad" ? "text-red-700" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}

function SummaryScreen({ stepState, totalImported, totalSkipped, onContinue, onBack }: {
  stepState: Record<StepKey, StepState>;
  totalImported: number;
  totalSkipped: number;
  onContinue: () => void;
  onBack: () => void;
}) {
  const anyImported = totalImported > 0;
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto" data-testid="page-pilot-kickoff-summary">
      <Card className="border-emerald-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            {anyImported ? "Pilot kickoff import complete" : "Nothing imported yet"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {anyImported ? (
            <p className="text-sm text-gray-600">
              {totalImported.toLocaleString()} row{totalImported === 1 ? "" : "s"} imported across the four steps.
              Imported records are tagged <code className="px-1 py-0.5 bg-gray-100 rounded text-[11px]">source = pilot_csv</code>{" "}
              so they can be reconciled with SIS sync later without creating duplicates.
            </p>
          ) : (
            <p className="text-sm text-amber-700">
              You skipped every step — nothing was imported. Use Back to upload a CSV, or jump straight to the dashboard
              and come back later.
            </p>
          )}

          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
            {STEPS.map(s => {
              const st = stepState[s.key];
              const result = st.status === "result" ? st.result : null;
              const Icon = s.icon;
              return (
                <li
                  key={s.key}
                  className="px-3 py-2.5 flex items-center justify-between gap-3"
                  data-testid={`summary-row-${s.key}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-800">{s.label}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {result ? (
                      <>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          {result.imported + (result.updated ?? 0)} imported
                        </Badge>
                        {(result.errored + (result.skipped ?? 0)) > 0 && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            {result.errored + (result.skipped ?? 0)} skipped
                          </Badge>
                        )}
                      </>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
                        Skipped
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {totalSkipped > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {totalSkipped} row{totalSkipped === 1 ? "" : "s"} could not be imported and were skipped. You can edit your
              CSV and re-upload from the wizard at any time — already-imported rows won't be duplicated.
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-100">
            <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-summary-back">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to wizard
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={onContinue}
              data-testid="button-summary-continue"
            >
              Continue to dashboard <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
