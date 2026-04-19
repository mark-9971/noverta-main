import { useQuery } from "@tanstack/react-query";
import { HardDrive, AlertTriangle } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { Progress } from "@/components/ui/progress";

interface UploadQuotaResponse {
  districtId: number;
  quotaDate: string;
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function formatGB(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}

export default function UploadQuotaPage() {
  const { data, isLoading, error } = useQuery<UploadQuotaResponse>({
    queryKey: ["admin/upload-quota"],
    queryFn: async () => {
      const r = await authFetch("/api/admin/upload-quota");
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load upload quota (${r.status})`);
      }
      return r.json();
    },
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HardDrive className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-700">Daily upload quota</h2>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5" data-testid="upload-quota-card">
        {isLoading && (
          <p className="text-sm text-gray-500">Loading quota usage…</p>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-rose-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{(error as Error).message}</p>
          </div>
        )}

        {data && (() => {
          const pct = data.limitBytes > 0
            ? Math.min(100, (data.usedBytes / data.limitBytes) * 100)
            : 0;
          const usedMB = formatMB(data.usedBytes);
          const limitGB = formatGB(data.limitBytes);
          const remainingMB = formatMB(data.remainingBytes);
          const isNearLimit = pct >= 80;
          const isAtLimit = pct >= 100;

          return (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <p className="text-2xl font-semibold text-gray-900" data-testid="text-quota-used">
                    {usedMB} MB
                    <span className="text-sm font-normal text-gray-500"> of {limitGB} GB</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Upload activity for {data.quotaDate} (UTC). Quota resets at UTC midnight.
                  </p>
                </div>
                <span
                  className={`text-sm font-medium tabular-nums ${
                    isAtLimit ? "text-rose-700" : isNearLimit ? "text-amber-700" : "text-gray-700"
                  }`}
                  data-testid="text-quota-percent"
                >
                  {pct.toFixed(1)}%
                </span>
              </div>

              <Progress
                value={pct}
                className={`h-2 ${isAtLimit ? "bg-rose-100" : isNearLimit ? "bg-amber-100" : ""}`}
                data-testid="progress-quota"
              />

              <p className="text-xs text-gray-500" data-testid="text-quota-remaining">
                {isAtLimit
                  ? "Daily upload quota exhausted. New uploads will be rejected until UTC midnight."
                  : `${remainingMB} MB remaining today.`}
              </p>

              {isNearLimit && !isAtLimit && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>Approaching the daily upload limit. New uploads may start being rejected soon.</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <p className="text-xs text-gray-500">
        Each district can upload up to 1 GB per UTC day. This protects shared storage and bandwidth across all districts on the platform.
      </p>
    </div>
  );
}
