import { useState } from "react";
import * as Sentry from "@sentry/react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Activity, Database, Server, Clock, Mail, Bug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HealthData {
  status: "ok" | "degraded";
  db: "connected" | "error";
  uptime: number;
  version: string;
  timestamp: string;
  errors: { last1h: number; last24h?: number };
  sentry: "enabled" | "disabled";
  email: "configured" | "not_configured";
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

function SentrySmokeTest() {
  const [feedback, setFeedback] = useState<string | null>(null);

  function fireFrontend() {
    try {
      Sentry.captureException(new Error("frontend sentry test"));
      setFeedback("Sent test event to Sentry. Check the project's Issues feed.");
    } catch (err) {
      setFeedback(`Failed to send: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function fireBackend() {
    try {
      const res = await authFetch("/api/_internal/sentry-test?tag=ui", { method: "GET" });
      setFeedback(`Backend test endpoint responded with ${res.status}. (500 means it threw — that's expected.)`);
    } catch (err) {
      setFeedback(`Backend test request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <details className="mt-4 text-xs text-gray-500">
      <summary className="cursor-pointer select-none flex items-center gap-1.5 hover:text-gray-700">
        <Bug className="w-3.5 h-3.5" />
        Sentry smoke test (admin only)
      </summary>
      <div className="mt-3 p-3 border border-gray-200 rounded-md bg-gray-50 space-y-2">
        <p className="text-gray-600">
          Fires a test event so you can confirm Sentry is wired up after a deploy.
          The backend button only works when <span className="font-mono">SENTRY_TEST_ENABLED=true</span> is set on the API.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fireFrontend}>
            Fire frontend test
          </Button>
          <Button size="sm" variant="outline" onClick={fireBackend}>
            Fire backend test
          </Button>
        </div>
        {feedback && <p className="text-gray-700">{feedback}</p>}
      </div>
    </details>
  );
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
  const errorCount = data?.errors?.last24h ?? data?.errors?.last1h ?? 0;
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
              <AlertTriangle className="w-4 h-4" /> Server Errors (last 24h)
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
                ? "No 5xx errors in the last 24 hours"
                : `5xx errors in the last 24 hours — check server logs`}
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
            <SentrySmokeTest />
          </CardContent>
        </Card>

        <Card className={!isLoading && data?.email === "not_configured" ? "border-amber-200 bg-amber-50/30" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1.5">
            {isLoading ? (
              <Skeleton />
            ) : (
              <StatusDot
                ok={data?.email === "configured"}
                label={data?.email === "configured" ? "Resend configured" : "Not configured — email is disabled"}
              />
            )}
            <p className="text-xs text-gray-500">
              {data?.email === "configured"
                ? "Email delivery is active. Parent notifications, missed-service alerts, and weekly digests will send."
                : "No emails are being sent. Parent/guardian notifications, incident notifications, missed-service alerts, weekly compliance digests, and pilot scorecards are all silently skipped."}
            </p>
            {!isLoading && data?.email === "not_configured" && (
              <div className="mt-2 p-2.5 bg-amber-100 border border-amber-200 rounded-md text-xs text-amber-900 space-y-1">
                <p className="font-semibold">To enable email delivery:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-0.5">
                  <li>Create a free account at <span className="font-mono">resend.com</span></li>
                  <li>Verify your sending domain (or use Resend's shared domain for testing)</li>
                  <li>Create an API key in the Resend dashboard</li>
                  <li>Add it as <span className="font-mono font-semibold">RESEND_API_KEY</span> in the Replit Secrets panel</li>
                  <li>Restart the API server — no code changes needed</li>
                </ol>
                <p className="text-amber-700 mt-1">The sending address is <span className="font-mono">noreply@trellis.education</span> — ensure your Resend domain matches or update <span className="font-mono">FROM_EMAIL</span> in <span className="font-mono">lib/email.ts</span>.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
