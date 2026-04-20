import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, ShieldCheck, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api";

interface Check {
  key: string;
  label: string;
  pass: boolean;
  detail: string;
}

interface ReadinessResponse {
  ok: boolean;
  districtId: number;
  districtName: string;
  checks: Check[];
  passing: number;
  total: number;
  status: "pass" | "warn" | "fail";
}

const FIX_HREF: Record<string, { href: string; label: string }> = {
  schools:    { href: "/settings",     label: "Open settings" },
  students:   { href: "/students",     label: "Open students" },
  staff:      { href: "/staff",        label: "Open staff" },
  alerts:     { href: "/alerts",       label: "Open alerts" },
  openAlerts: { href: "/alerts",       label: "Open alerts" },
  comp:       { href: "/compensatory", label: "Open compensatory" },
  sessions:   { href: "/sessions",     label: "Open sessions" },
};

function StatusIcon({ pass }: { pass: boolean }) {
  return pass
    ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
    : <XCircle className="w-4 h-4 text-red-600" />;
}

export default function ReadinessPanel({ districtId }: { districtId: number }) {
  const { data, isLoading, error } = useQuery<ReadinessResponse>({
    queryKey: ["demo-control", "readiness", districtId],
    queryFn: () => apiGet<ReadinessResponse>(`/api/demo-control/readiness?districtId=${districtId}`),
    refetchInterval: 60_000,
  });

  const headerBadge = (() => {
    if (!data) return null;
    if (data.status === "pass") return <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">All clear</span>;
    if (data.status === "warn") return <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Needs attention</span>;
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-100 text-red-700">Not ready</span>;
  })();

  return (
    <Card data-testid="demo-control-slot-1">
      <CardHeader className="py-3 bg-gray-50 border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-[10px] text-white">1</span>
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Pilot readiness</span>
          {data && (
            <span className="text-[11px] text-gray-500 font-normal ml-1">
              {data.passing}/{data.total} passing
            </span>
          )}
          <div className="ml-auto">{headerBadge}</div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Running readiness checks…
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 py-2">
            <AlertTriangle className="w-3.5 h-3.5" /> Couldn't load readiness checks.
          </div>
        )}
        {data && (
          <ul className="divide-y divide-gray-100" data-testid="demo-control-readiness-list">
            {data.checks.map((check) => {
              const fix = FIX_HREF[check.key];
              return (
                <li key={check.key} className="py-2 flex items-start gap-2.5" data-testid={`readiness-check-${check.key}`}>
                  <StatusIcon pass={check.pass} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-gray-900">{check.label}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{check.detail}</div>
                  </div>
                  {!check.pass && fix && (
                    <Link
                      href={fix.href}
                      data-testid={`readiness-fix-${check.key}`}
                      className="flex items-center gap-0.5 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                    >
                      Fix <ChevronRight className="w-3 h-3" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
