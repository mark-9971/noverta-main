import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck, ShieldAlert, ShieldX, RefreshCw, ChevronDown, ChevronUp,
  Users, UserCheck, Calendar, ClipboardList, Database, AlertTriangle,
  CheckCircle, XCircle, Info, ExternalLink, ArrowRight
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { Link } from "wouter";

interface HealthCheckItem {
  id: number;
  label: string;
  detail: string;
}

interface HealthCheck {
  id: string;
  category: "students" | "staff" | "services" | "schedules" | "data_quality";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  count: number;
  total: number;
  items: HealthCheckItem[];
}

interface HealthResult {
  overallStatus: "good" | "needs_attention" | "not_ready";
  summary: {
    totalStudents: number;
    totalStaff: number;
    totalServiceReqs: number;
    totalScheduleBlocks: number;
    checksRun: number;
    passed: number;
    warnings: number;
    critical: number;
  };
  checks: HealthCheck[];
}

const CATEGORY_META: Record<string, { label: string; icon: any; color: string }> = {
  students: { label: "Students", icon: Users, color: "emerald" },
  staff: { label: "Staff & Providers", icon: UserCheck, color: "blue" },
  services: { label: "Service Requirements", icon: ClipboardList, color: "purple" },
  schedules: { label: "Schedules", icon: Calendar, color: "orange" },
  data_quality: { label: "Data Quality", icon: Database, color: "gray" },
};

const STATUS_META = {
  good: { label: "Ready for Pilot", icon: ShieldCheck, color: "emerald", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  needs_attention: { label: "Needs Attention", icon: ShieldAlert, color: "amber", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  not_ready: { label: "Not Ready", icon: ShieldX, color: "red", bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
};

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical") return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  return <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
}

function HealthCheckCard({ check }: { check: HealthCheck }) {
  const [expanded, setExpanded] = useState(false);
  const passed = check.count === 0;
  const pct = check.total > 0 ? Math.round(((check.total - check.count) / check.total) * 100) : 100;

  return (
    <div className={`rounded-xl border transition-all ${
      passed ? "border-gray-100 bg-white" :
      check.severity === "critical" ? "border-red-200 bg-red-50/30" :
      check.severity === "warning" ? "border-amber-200 bg-amber-50/20" :
      "border-gray-100 bg-white"
    }`}>
      <button
        onClick={() => !passed && check.items.length > 0 && setExpanded(!expanded)}
        className="w-full text-left p-4 flex items-start gap-3"
      >
        <SeverityIcon severity={passed ? "info" : check.severity} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-[13px] font-semibold ${passed ? "text-gray-500" : "text-gray-700"}`}>
              {check.title}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!passed && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  check.severity === "critical" ? "bg-red-100 text-red-700" :
                  check.severity === "warning" ? "bg-amber-100 text-amber-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {check.count} of {check.total}
                </span>
              )}
              {passed && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  All clear
                </span>
              )}
            </div>
          </div>
          <p className={`text-[11px] mt-0.5 leading-relaxed ${passed ? "text-gray-400" : "text-gray-500"}`}>
            {check.description}
          </p>
          {!passed && check.total > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    check.severity === "critical" ? "bg-red-400" :
                    check.severity === "warning" ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400 font-medium">{pct}%</span>
            </div>
          )}
        </div>
        {!passed && check.items.length > 0 && (
          expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
        )}
      </button>

      {expanded && check.items.length > 0 && (
        <div className="border-t border-gray-100 px-4 pb-3">
          <div className="max-h-[300px] overflow-y-auto mt-2 space-y-1">
            {check.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50/80 group">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-gray-400 font-mono w-5 text-right">{i + 1}</span>
                  <span className="text-[12px] font-medium text-gray-700 truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 truncate max-w-[250px]">{item.detail}</span>
                  {(check.category === "students" || check.id === "students_no_iep_goals") && (
                    <Link href={`/students/${item.id}`} className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink className="w-3 h-3 text-emerald-500" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {check.count > check.items.length && (
              <p className="text-[11px] text-gray-400 text-center py-2">
                Showing {check.items.length} of {check.count} — review in the full list
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataHealthPage() {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runHealthCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/data-health");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Health check failed (${res.status})`);
      }
      const data = await res.json();
      setResult(data);
      setLastRun(new Date());
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { runHealthCheck(); }, []);

  const categories = result ? [...new Set(result.checks.map(c => c.category))] : [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1000px] mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Data Health Check</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Verify your district's data is complete and ready for Trellis
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRun && (
            <span className="text-[11px] text-gray-400">
              Last run {lastRun.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-[12px] gap-1.5"
            onClick={runHealthCheck}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Checking..." : "Re-run"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-[13px] text-red-700 font-medium">{error}</p>
        </div>
      )}

      {loading && !result && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      )}

      {result && (
        <>
          {(() => {
            const st = STATUS_META[result.overallStatus];
            const Icon = st.icon;
            return (
              <div className={`${st.bg} ${st.border} border rounded-xl p-5`}>
                <div className="flex items-center gap-3">
                  <Icon className={`w-8 h-8 ${st.text}`} />
                  <div>
                    <p className={`text-lg font-bold ${st.text}`}>{st.label}</p>
                    <p className="text-[13px] text-gray-600 mt-0.5">
                      {result.overallStatus === "good" && "Your district data looks solid. All critical checks pass — you're ready to start using Trellis."}
                      {result.overallStatus === "needs_attention" && "Most data is in place, but some areas need attention before going live. Review the warnings below."}
                      {result.overallStatus === "not_ready" && "Critical data gaps detected. Fix the issues marked in red before starting your pilot."}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-white border border-gray-100">
              <p className="text-2xl font-bold text-gray-700">{result.summary.totalStudents}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Active Students</p>
            </div>
            <div className="p-4 rounded-xl bg-white border border-gray-100">
              <p className="text-2xl font-bold text-gray-700">{result.summary.totalStaff}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Active Staff</p>
            </div>
            <div className="p-4 rounded-xl bg-white border border-gray-100">
              <p className="text-2xl font-bold text-gray-700">{result.summary.totalServiceReqs}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Service Requirements</p>
            </div>
            <div className="p-4 rounded-xl bg-white border border-gray-100">
              <p className="text-2xl font-bold text-gray-700">{result.summary.totalScheduleBlocks}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Schedule Blocks</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              className={`p-3 rounded-xl border text-center transition-all ${
                result.summary.critical > 0 ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-100"
              }`}
              onClick={() => {
                const el = document.getElementById("check-critical");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <p className={`text-2xl font-bold ${result.summary.critical > 0 ? "text-red-600" : "text-gray-300"}`}>{result.summary.critical}</p>
              <p className="text-[11px] text-gray-500">Critical</p>
            </button>
            <button
              className={`p-3 rounded-xl border text-center transition-all ${
                result.summary.warnings > 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100"
              }`}
              onClick={() => {
                const el = document.getElementById("check-warning");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <p className={`text-2xl font-bold ${result.summary.warnings > 0 ? "text-amber-600" : "text-gray-300"}`}>{result.summary.warnings}</p>
              <p className="text-[11px] text-gray-500">Warnings</p>
            </button>
            <div className="p-3 rounded-xl border bg-emerald-50/50 border-emerald-100 text-center">
              <p className="text-2xl font-bold text-emerald-600">{result.summary.passed}</p>
              <p className="text-[11px] text-gray-500">Passed</p>
            </div>
          </div>

          {categories.map(cat => {
            const meta = CATEGORY_META[cat];
            const catChecks = result.checks.filter(c => c.category === cat);
            const hasCritical = catChecks.some(c => c.severity === "critical" && c.count > 0);
            const hasWarning = catChecks.some(c => c.severity === "warning" && c.count > 0);
            const CatIcon = meta.icon;

            return (
              <div key={cat} id={hasCritical ? "check-critical" : hasWarning ? "check-warning" : undefined}>
                <div className="flex items-center gap-2 mb-3">
                  <CatIcon className="w-4 h-4 text-gray-400" />
                  <h2 className="text-[14px] font-semibold text-gray-700">{meta.label}</h2>
                  {hasCritical && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">Issues found</span>}
                  {!hasCritical && hasWarning && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600">Warnings</span>}
                  {!hasCritical && !hasWarning && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600">All clear</span>}
                </div>
                <div className="space-y-2">
                  {catChecks.map(check => (
                    <HealthCheckCard key={check.id} check={check} />
                  ))}
                </div>
              </div>
            );
          })}

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-semibold text-gray-600">Next Steps</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="space-y-2">
                {result.summary.critical > 0 && (
                  <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[12px] font-semibold text-red-700">Fix critical issues first</p>
                      <p className="text-[11px] text-red-600 mt-0.5">
                        Service requirements without providers and students without mandated services will prevent compliance tracking from working.
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Link href="/import">
                          <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1">
                            <ArrowRight className="w-3 h-3" /> Import Data
                          </Button>
                        </Link>
                        <Link href="/students">
                          <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1">
                            <ArrowRight className="w-3 h-3" /> Student List
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
                {result.summary.warnings > 0 && (
                  <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[12px] font-semibold text-amber-700">Review warnings</p>
                      <p className="text-[11px] text-amber-600 mt-0.5">
                        Missing schedules and unassigned providers won't block your pilot, but they'll limit what Trellis can track automatically.
                      </p>
                    </div>
                  </div>
                )}
                {result.summary.passed === result.summary.checksRun && (
                  <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[12px] font-semibold text-emerald-700">All checks pass</p>
                      <p className="text-[11px] text-emerald-600 mt-0.5">
                        Your data is well-structured. You can start using Trellis for daily session logging and compliance tracking.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
