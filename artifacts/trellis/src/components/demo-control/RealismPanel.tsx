import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, FlaskConical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api";

type CheckStatus = "pass" | "warn" | "fail";

interface RealismCheck {
  name: string;
  status: CheckStatus;
  message: string;
}

interface RealismResponse {
  ok: boolean;
  districtId: number;
  districtName: string;
  checks: RealismCheck[];
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
  if (status === "warn") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-600" />;
}

export default function RealismPanel({ districtId }: { districtId: number }) {
  const { data, isLoading, error } = useQuery<RealismResponse>({
    queryKey: ["demo-control", "data-health", districtId],
    queryFn: () => apiGet<RealismResponse>(`/api/demo-control/data-health?districtId=${districtId}`),
    refetchInterval: 60_000,
  });

  const flagged = data?.checks.filter(c => c.status !== "pass") ?? [];
  const passing = data?.checks.filter(c => c.status === "pass").length ?? 0;
  const total = data?.checks.length ?? 0;

  return (
    <Card data-testid="demo-control-slot-10">
      <CardHeader className="py-3 bg-gray-50 border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-600 text-[10px] text-white">10</span>
          <FlaskConical className="w-4 h-4 text-amber-600" />
          <span>Data realism</span>
          {data && (
            <span className="text-[11px] text-gray-500 font-normal ml-1">
              {passing}/{total} clean
            </span>
          )}
          {data && (
            <div className="ml-auto">
              {flagged.length === 0 ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Looks real</span>
              ) : (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700">{flagged.length} flag{flagged.length === 1 ? "" : "s"}</span>
              )}
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Inspecting demo data…
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 py-2">
            <AlertTriangle className="w-3.5 h-3.5" /> Couldn't load realism checks.
          </div>
        )}
        {data && flagged.length === 0 && (
          <p className="text-[12px] text-gray-500 py-2">
            No realism flags — student counts, alert mix, and compensatory data look plausible for a demo.
          </p>
        )}
        {data && flagged.length > 0 && (
          <ul className="divide-y divide-gray-100" data-testid="demo-control-realism-list">
            {flagged.map((check) => (
              <li
                key={check.name}
                className="py-2 flex items-start gap-2.5"
                data-testid={`realism-flag-${check.name.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <StatusIcon status={check.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-gray-900">{check.name}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{check.message}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
