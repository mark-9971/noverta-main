import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Activity, Database, Server, Clock, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HealthData {
  status: "ok" | "degraded";
  db: "connected" | "error";
  uptime: number;
  version: string;
  timestamp: string;
  errors: { last1h: number };
  sentry: "enabled" | "disabled";
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
      ) : (
        <XCircle className="w-5 h-5 text-red-500" />
      )}
      <span className={`text-sm font-medium ${ok ? "text-emerald-700" : "text-red-600"}`}>
        {label}
      </span>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-gray-100 rounded animate-pulse ${className ?? "h-5 w-24"}`} />;
}

export default function SystemStatusPage() {
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery<HealthData>({
    queryKey: ["system-health"],
    queryFn: () =>
      authFetch("/api/health").then((r) => {
        if (!r.ok && r.status !== 503) throw new Error("Health endpoint unreachable");
        return r.json();
      }),
    refetchInterval: 30_000,
    retry: 1,
  });

  const apiOk = !isError && data?.status !== undefined;
  const dbOk = data?.db === "connected";
  const errorCount = data?.errors?.last1h ?? 0;
  const errorRateOk = errorCount === 0;
  const overallOk = apiOk && dbOk && errorRateOk;

  const lastChecked = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">System Status</h1>
          <p className="text-sm text-gray-500 mt-1">
            Live health of the Trellis platform
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className={`border-2 ${overallOk ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"}`}>
        <CardContent className="py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="w-5 h-5 rounded-full bg-gray-300 animate-pulse" />
            ) : overallOk ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-red-500" />
            )}
            <div>
              <p className="font-semibold text-gray-900">
                {isLoading
                  ? "Checking…"
                  : overallOk
                  ? "All systems operational"
                  : "Service degraded"}
              </p>
              {lastChecked && (
                <p className="text-xs text-gray-500">Last checked at {lastChecked}</p>
              )}
            </div>
          </div>
          {data && (
            <Badge
              variant={overallOk ? "default" : "destructive"}
              className={overallOk ? "bg-emerald-600" : ""}
            >
              {data.status.toUpperCase()}
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Server className="w-4 h-4" /> API Server
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {isLoading ? (
              <Skeleton />
            ) : isError ? (
              <StatusDot ok={false} label="Unreachable" />
            ) : (
              <StatusDot ok={true} label="Online" />
            )}
            {data?.version && (
              <p className="text-xs text-gray-400">Version {data.version}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Database className="w-4 h-4" /> Database
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <Skeleton />
            ) : isError ? (
              <StatusDot ok={false} label="Unknown" />
            ) : (
              <StatusDot ok={dbOk} label={dbOk ? "Connected" : "Unreachable"} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Uptime
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <Skeleton className="h-5 w-20" />
            ) : data?.uptime !== undefined ? (
              <p className="text-sm font-medium text-gray-800">{formatUptime(data.uptime)}</p>
            ) : (
              <p className="text-sm text-gray-400">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Server Errors (last 1h)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {isLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <p
                className={`text-2xl font-bold ${
                  errorCount === 0 ? "text-emerald-600" : errorCount < 5 ? "text-amber-600" : "text-red-600"
                }`}
              >
                {errorCount}
              </p>
            )}
            <p className="text-xs text-gray-400">
              {errorCount === 0
                ? "No 5xx errors in the last hour"
                : `5xx errors in the last hour — check server logs`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Error Reporting
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {isLoading ? (
              <Skeleton />
            ) : (
              <StatusDot
                ok={data?.sentry === "enabled"}
                label={data?.sentry === "enabled" ? "Sentry enabled" : "Not configured"}
              />
            )}
            <p className="text-xs text-gray-400">
              {data?.sentry === "enabled"
                ? "Errors are being captured and reported to Sentry"
                : "Set SENTRY_DSN and VITE_SENTRY_DSN secrets to enable"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            <StatusDot ok={false} label="Not yet configured" />
            <p className="text-xs text-gray-400">
              Real email delivery and failure tracking will be shown here once email sending is enabled.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
