/**
 * Panel 4 — Before-vs-after estimator.
 *
 * Pure client-side calculator: a runner enters the manual labor a district is
 * doing today (hours reconciling minutes, hours on makeup tracking, hours on
 * leadership reports, # spreadsheets, # unresolved missing logs) and the panel
 * recomputes a live "what Trellis centralizes / automates / surfaces sooner"
 * summary. Output is exportable as a self-contained one-page HTML.
 *
 * Pure compute means no DB writes — zero risk of mutating the active demo
 * district. Inputs persist in component state only.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calculator, Download } from "lucide-react";

interface Props {
  districtName: string;
}

interface Inputs {
  hoursReconcilingMinutes: number;
  hoursMakeupTracking: number;
  hoursLeadershipReports: number;
  spreadsheets: number;
  unresolvedMissingLogs: number;
}

const DEFAULTS: Inputs = {
  hoursReconcilingMinutes: 8,
  hoursMakeupTracking: 6,
  hoursLeadershipReports: 4,
  spreadsheets: 12,
  unresolvedMissingLogs: 35,
};

const FIELDS: Array<{ key: keyof Inputs; label: string; suffix: string; max: number }> = [
  { key: "hoursReconcilingMinutes", label: "Hours/wk reconciling minutes", suffix: "hrs", max: 80 },
  { key: "hoursMakeupTracking",     label: "Hours/wk on makeup tracking",  suffix: "hrs", max: 80 },
  { key: "hoursLeadershipReports",  label: "Hours/wk on leadership reports", suffix: "hrs", max: 80 },
  { key: "spreadsheets",            label: "Spreadsheets in use",          suffix: "files", max: 200 },
  { key: "unresolvedMissingLogs",   label: "Unresolved missing session logs", suffix: "logs", max: 500 },
];

function compute(inp: Inputs) {
  const totalHours = inp.hoursReconcilingMinutes + inp.hoursMakeupTracking + inp.hoursLeadershipReports;
  // Trellis automates ~92% of reconciling, ~80% of makeup tracking, ~95% of leadership reports.
  const hoursSaved =
    inp.hoursReconcilingMinutes * 0.92 +
    inp.hoursMakeupTracking * 0.80 +
    inp.hoursLeadershipReports * 0.95;
  // Loaded staff cost (~$55/hr) × 36 weeks of school year.
  const annualDollarsSaved = Math.round(hoursSaved * 55 * 36);
  // Spreadsheets collapsed to 1 source of truth (keep 1).
  const spreadsheetsRetired = Math.max(0, inp.spreadsheets - 1);
  // Missing logs: Trellis surfaces them within 24h instead of 30+ days,
  // and ~85% close themselves once surfaced.
  const logsAutoSurfaced = Math.round(inp.unresolvedMissingLogs * 0.85);
  const compensatoryRiskMinutes = inp.unresolvedMissingLogs * 30;
  const compensatoryDollarsAvoided = Math.round(compensatoryRiskMinutes / 60 * 85);

  return {
    totalHours: Math.round(totalHours),
    hoursSaved: Math.round(hoursSaved),
    annualDollarsSaved,
    spreadsheetsRetired,
    logsAutoSurfaced,
    compensatoryRiskMinutes,
    compensatoryDollarsAvoided,
  };
}

function buildOnePagerHtml(districtName: string, inp: Inputs, out: ReturnType<typeof compute>): string {
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Trellis impact — ${esc(districtName)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:24px auto;padding:0 20px;color:#111}
h1{font-size:22px;margin:0 0 4px}h2{font-size:13px;color:#374151;margin-top:18px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
.banner{background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:8px 12px;border-radius:6px;font-size:12px;margin:8px 0 16px}
.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.k{border:1px solid #ddd;border-radius:6px;padding:10px}
.kl{font-size:10px;text-transform:uppercase;color:#6b7280}
.kv{font-size:20px;font-weight:600;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #eee}
th{font-size:10px;text-transform:uppercase;color:#6b7280}
.up{color:#047857;font-weight:600}.foot{font-size:10px;color:#6b7280;margin-top:24px;border-top:1px solid #eee;padding-top:8px}
</style></head><body>
<div class="banner">SAMPLE — Generated from a Trellis demo. Numbers are estimates based on inputs.</div>
<h1>${esc(districtName)} — Today vs. on Trellis</h1>
<div class="kpi">
  <div class="k"><div class="kl">Hours saved / week</div><div class="kv up">${out.hoursSaved}</div></div>
  <div class="k"><div class="kl">Annual labor recovered</div><div class="kv up">$${out.annualDollarsSaved.toLocaleString()}</div></div>
  <div class="k"><div class="kl">Comp. exposure avoided</div><div class="kv up">$${out.compensatoryDollarsAvoided.toLocaleString()}</div></div>
</div>
<h2>What changes</h2>
<table><thead><tr><th>Today</th><th>On Trellis</th></tr></thead><tbody>
<tr><td>${inp.hoursReconcilingMinutes} hrs/wk reconciling minutes by hand</td><td class="up">Auto-reconciled — staff log once</td></tr>
<tr><td>${inp.hoursMakeupTracking} hrs/wk chasing makeup sessions</td><td class="up">Makeups suggested + tracked centrally</td></tr>
<tr><td>${inp.hoursLeadershipReports} hrs/wk building leadership reports</td><td class="up">Live dashboards — no spreadsheet rebuild</td></tr>
<tr><td>${inp.spreadsheets} spreadsheets in flight</td><td class="up">${out.spreadsheetsRetired} retired → 1 source of truth</td></tr>
<tr><td>${inp.unresolvedMissingLogs} unresolved missing logs</td><td class="up">${out.logsAutoSurfaced} surfaced within 24h</td></tr>
</tbody></table>
<h2>Summary</h2>
<p style="font-size:13px">Trellis would centralize ${esc(inp.spreadsheets)} spreadsheets to one workspace, automate roughly ${out.hoursSaved} hours of weekly reconciliation and reporting, and surface ${out.logsAutoSurfaced} stalled session logs within a day instead of weeks — recovering an estimated <strong>$${out.annualDollarsSaved.toLocaleString()}</strong> in labor and avoiding <strong>$${out.compensatoryDollarsAvoided.toLocaleString()}</strong> in compensatory exposure annually.</p>
<div class="foot">Generated ${new Date().toLocaleString()} from the Demo Control Center for the ${esc(districtName)} demo district.</div>
</body></html>`;
}

export default function BeforeAfterPanel({ districtName }: Props) {
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);
  const out = useMemo(() => compute(inputs), [inputs]);

  function set<K extends keyof Inputs>(k: K, v: number) {
    setInputs(prev => ({ ...prev, [k]: Number.isFinite(v) ? v : 0 }));
  }

  function downloadOnePager() {
    const html = buildOnePagerHtml(districtName, inputs, out);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trellis-before-after-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Card data-testid="demo-control-slot-4">
      <CardHeader className="py-3 bg-emerald-50 border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px]">4</span>
          <Calculator className="w-4 h-4 text-emerald-600" />
          Before-vs-after estimator
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-1 gap-2">
          {FIELDS.map(f => (
            <div key={f.key} className="flex items-center gap-2">
              <Label htmlFor={`ba-${f.key}`} className="text-xs text-gray-600 flex-1">
                {f.label}
              </Label>
              <Input
                id={`ba-${f.key}`}
                data-testid={`input-ba-${f.key}`}
                type="number"
                min={0}
                max={f.max}
                value={inputs[f.key]}
                onChange={e => set(f.key, Math.max(0, Math.min(f.max, Number(e.target.value) || 0)))}
                className="w-20 h-7 text-xs text-right"
              />
              <span className="text-[10px] text-gray-400 w-10">{f.suffix}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <Stat label="Hrs/wk saved" value={out.hoursSaved} />
          <Stat label="Annual labor $" value={`$${(out.annualDollarsSaved / 1000).toFixed(0)}k`} />
          <Stat label="Comp. $ avoided" value={`$${(out.compensatoryDollarsAvoided / 1000).toFixed(0)}k`} />
        </div>

        <ul className="text-xs text-gray-600 space-y-1 pt-1">
          <li>• Centralize <strong>{inputs.spreadsheets}</strong> spreadsheets → <strong>1</strong> workspace ({out.spreadsheetsRetired} retired)</li>
          <li>• Auto-surface <strong>{out.logsAutoSurfaced}</strong> of {inputs.unresolvedMissingLogs} stalled logs within 24h</li>
          <li>• Recover <strong>{out.hoursSaved}</strong> of {out.totalHours} weekly admin hours</li>
        </ul>

        <Button
          onClick={downloadOnePager}
          variant="outline"
          size="sm"
          className="w-full gap-2"
          data-testid="button-ba-download"
        >
          <Download className="w-3.5 h-3.5" /> Download one-page summary
        </Button>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded p-2 text-center bg-gray-50">
      <div className="text-[9px] uppercase text-gray-500 tracking-wide">{label}</div>
      <div className="text-base font-semibold text-emerald-700 mt-0.5">{value}</div>
    </div>
  );
}
