import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

type Status = "pass" | "warn" | "fail";

interface ReadinessCheck {
  id: string;
  label: string;
  status: Status;
  message: string;
  remediation?: string;
  href?: string;
}

interface ReadinessReport {
  generatedAt: string;
  demoDistrict: { id: number; name: string } | null;
  checks: ReadinessCheck[];
  summary: { pass: number; warn: number; fail: number; total: number };
}

function statusIcon(status: Status) {
  if (status === "pass") return <CheckCircle2 className="w-6 h-6 text-emerald-600" />;
  if (status === "warn") return <AlertTriangle className="w-6 h-6 text-amber-500" />;
  return <XCircle className="w-6 h-6 text-red-600" />;
}

function statusRingClasses(status: Status) {
  if (status === "pass") return "border-emerald-200 bg-emerald-50/40";
  if (status === "warn") return "border-amber-200 bg-amber-50/40";
  return "border-red-200 bg-red-50/40";
}

function summaryBadge(s: ReadinessReport["summary"]) {
  if (s.fail > 0) {
    return (
      <Badge variant="destructive">{s.fail} failing · {s.warn} warning</Badge>
    );
  }
  if (s.warn > 0) {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500/90">
        {s.warn} warning
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-600 hover:bg-emerald-600/90">All clear</Badge>
  );
}

export default function DemoReadinessPage() {
  const { isPlatformAdmin } = useRole();

  const { data, isLoading, isError, refetch, isFetching } = useQuery<ReadinessReport>({
    queryKey: ["demo-readiness"],
    queryFn: () => apiGet<ReadinessReport>("/api/support/demo-readiness"),
    enabled: isPlatformAdmin,
    refetchInterval: 60_000,
  });

  if (!isPlatformAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Restricted</h1>
        <p className="text-sm text-gray-500 mt-2">
          Demo Pre-Flight is available to platform administrators only.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Demo Pre-Flight</h1>
          <p className="text-sm text-gray-500 mt-1">
            One-glance readiness for the demo district before a sales call.
            {data?.demoDistrict && (
              <> Showing <span className="font-medium text-gray-700">{data.demoDistrict.name}</span>.</>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {data && (
        <Card className={`border-2 ${
          data.summary.fail > 0
            ? "border-red-200 bg-red-50/40"
            : data.summary.warn > 0
              ? "border-amber-200 bg-amber-50/40"
              : "border-emerald-200 bg-emerald-50/40"
        }`}>
          <CardContent className="py-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {statusIcon(data.summary.fail > 0 ? "fail" : data.summary.warn > 0 ? "warn" : "pass")}
              <div>
                <p className="font-semibold text-gray-900">
                  {data.summary.fail > 0
                    ? "Demo not ready — resolve failing checks before going live"
                    : data.summary.warn > 0
                      ? "Demo usable, but some checks need attention"
                      : "Demo is ready to show"}
                </p>
                <p className="text-xs text-gray-500">
                  {data.summary.pass} of {data.summary.total} checks passing · generated {new Date(data.generatedAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
            {summaryBadge(data.summary)}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="py-4 text-sm text-red-700">
            Failed to load demo readiness. Try refreshing — if it keeps failing, the
            API server may be down.
          </CardContent>
        </Card>
      )}

      {data && (
        <ul className="space-y-3">
          {data.checks.map(check => (
            <li key={check.id}>
              <Card className={`border ${statusRingClasses(check.status)}`}>
                <CardContent className="py-4 flex items-start gap-4">
                  <div className="pt-0.5">{statusIcon(check.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-gray-900">{check.label}</p>
                      <span className={`text-xs uppercase tracking-wide font-semibold ${
                        check.status === "pass"
                          ? "text-emerald-700"
                          : check.status === "warn"
                            ? "text-amber-700"
                            : "text-red-700"
                      }`}>
                        {check.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{check.message}</p>
                    {check.remediation && (
                      <p className="text-xs text-gray-500 mt-2">
                        <span className="font-semibold text-gray-600">Fix:</span>{" "}
                        {check.remediation}
                      </p>
                    )}
                    {check.href && (
                      <Link
                        href={check.href}
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 mt-2"
                      >
                        Open related screen <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
