import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, ShieldCheck, ChevronRight } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

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
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-emerald-700">{data.summary.pass} passing</span>
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
    </section>
  );
}
