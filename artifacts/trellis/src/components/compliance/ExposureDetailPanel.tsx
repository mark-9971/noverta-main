import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface ExposureItem {
  date: string;
  serviceType: string;
  provider: string;
  scheduledDurationMinutes: number;
  status: string;
  hourlyRate: number | null;
  rateSource: string;
  exposureAmount: number | null;
  serviceRequirementId: number;
}

interface ExposureDetail {
  studentId: number;
  studentName: string;
  items: ExposureItem[];
  aggregateExposure: number;
  aggregateShortfallMinutes: number;
  rateConfigured: boolean;
}

function fmtDollars(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function statusLabel(status: string) {
  if (status === "missed") return "Missed";
  if (status === "partial") return "Partial";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusBadge(status: string) {
  const cls = status === "missed"
    ? "bg-red-100 text-red-700 border-red-200"
    : "bg-amber-100 text-amber-700 border-amber-200";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {statusLabel(status)}
    </span>
  );
}

function downloadCSV(data: ExposureDetail, itemsExposureTotal: number) {
  const headers = ["Date", "Service Type", "Provider", "Scheduled Duration (min)", "Status", "CPT Rate", "Exposure Amount"];
  const rows = data.items.map(item => [
    item.date,
    item.serviceType,
    item.provider,
    String(item.scheduledDurationMinutes),
    statusLabel(item.status),
    item.hourlyRate != null ? `$${item.hourlyRate.toFixed(2)}/hr` : "Rate not configured",
    item.exposureAmount != null ? `$${item.exposureAmount.toFixed(2)}` : "N/A",
  ]);

  const remainingExposure = Math.round((data.aggregateExposure - itemsExposureTotal) * 100) / 100;
  if (remainingExposure > 0.005) {
    rows.push([
      "",
      "Remaining shortfall (minutes without logged sessions)",
      "",
      "",
      "",
      "",
      `$${remainingExposure.toFixed(2)}`,
    ]);
  }

  rows.push([
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    `$${data.aggregateExposure.toFixed(2)}`,
  ]);

  const escape = (v: string) => {
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const csv = [headers, ...rows].map(row => row.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Exposure_Detail_${data.studentName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  studentId: number | null;
  studentName?: string;
  serviceRequirementId?: number;
  onClose: () => void;
}

export default function ExposureDetailPanel({ studentId, studentName, serviceRequirementId, onClose }: Props) {
  const query = useQuery<ExposureDetail>({
    queryKey: ["/api/reports/exposure-detail", studentId, serviceRequirementId],
    queryFn: async () => {
      const params = serviceRequirementId != null ? `?serviceRequirementId=${serviceRequirementId}` : "";
      const res = await authFetch(`/api/reports/exposure-detail/${studentId}${params}`);
      if (!res.ok) throw new Error("Failed to load exposure detail");
      return res.json();
    },
    enabled: studentId != null,
    staleTime: 30_000,
  });

  const data = query.data;

  // Sum of explicitly-logged session exposures (items that have a rate configured)
  const itemsExposureTotal = data
    ? Math.round(data.items.reduce((acc, it) => acc + (it.exposureAmount ?? 0), 0) * 100) / 100
    : 0;

  // Gap between aggregate shortfall exposure and sum of logged sessions.
  // A positive value means some shortfall minutes had no corresponding session log.
  const remainingExposure = data
    ? Math.round((data.aggregateExposure - itemsExposureTotal) * 100) / 100
    : 0;

  return (
    <Sheet open={studentId != null} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="px-5 py-4 border-b bg-gray-50/70 sticky top-0 z-10">
          <SheetTitle className="text-base font-bold text-gray-800 flex items-center gap-2">
            Financial Exposure — {studentName ?? data?.studentName ?? "Student"}
          </SheetTitle>
          <p className="text-[12px] text-gray-400 mt-0.5 font-normal">
            Itemised missed &amp; partial sessions for the current service interval
          </p>
        </SheetHeader>

        <div className="px-5 py-4 space-y-4">
          {query.isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin h-7 w-7 border-2 border-emerald-600 border-t-transparent rounded-full" />
            </div>
          )}

          {query.isError && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Failed to load exposure details. Please try again.
            </div>
          )}

          {data && data.items.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-500">
              <p className="font-medium text-gray-700 mb-1">No missed or partial sessions logged</p>
              <p className="text-[13px] text-gray-400">
                This student has no explicitly logged missed or partial sessions in the current interval.
                The shortfall of {data.aggregateShortfallMinutes} min reflects required minutes not yet delivered.
              </p>
            </div>
          )}

          {data && (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200">
                      <th className="px-3 py-2.5 text-left">Date</th>
                      <th className="px-3 py-2.5 text-left">Service Type</th>
                      <th className="px-3 py-2.5 text-left">Provider</th>
                      <th className="px-3 py-2.5 text-right">Sched. (min)</th>
                      <th className="px-3 py-2.5 text-left">Status</th>
                      <th className="px-3 py-2.5 text-right">CPT Rate</th>
                      <th className="px-3 py-2.5 text-right">Exposure</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.items.map((item, i) => (
                      <tr key={i} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-3 py-2.5 text-[12px] text-gray-600 whitespace-nowrap">{fmtDate(item.date)}</td>
                        <td className="px-3 py-2.5 text-[12px] text-gray-700 max-w-[140px] truncate">{item.serviceType}</td>
                        <td className="px-3 py-2.5 text-[12px] text-gray-600 max-w-[120px] truncate">{item.provider}</td>
                        <td className="px-3 py-2.5 text-[13px] text-gray-700 text-right tabular-nums font-medium">{item.scheduledDurationMinutes}</td>
                        <td className="px-3 py-2.5">{statusBadge(item.status)}</td>
                        <td className="px-3 py-2.5 text-right text-[12px] tabular-nums">
                          {item.hourlyRate != null
                            ? <span className="text-gray-700">${item.hourlyRate.toFixed(2)}/hr</span>
                            : <span className="text-amber-600 font-medium">Not set</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {item.exposureAmount != null
                            ? <span className="text-red-700 font-semibold text-[13px]">{fmtDollars(item.exposureAmount)}</span>
                            : <span className="text-amber-600 text-[12px]">N/A</span>}
                        </td>
                      </tr>
                    ))}

                    {remainingExposure > 0.005 && (
                      <tr className="bg-amber-50/40 hover:bg-amber-50/60 transition-colors">
                        <td className="px-3 py-2.5 text-[12px] text-gray-400 whitespace-nowrap italic">—</td>
                        <td colSpan={5} className="px-3 py-2.5 text-[12px] text-gray-500 italic">
                          Remaining shortfall (minutes without logged sessions)
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          <span className="text-red-600 font-semibold text-[13px]">{fmtDollars(remainingExposure)}</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan={5} className="px-3 py-2.5 text-[12px] font-semibold text-gray-600">
                        Total Exposure
                        <span className="ml-2 text-[11px] font-normal text-gray-400">
                          ({data.aggregateShortfallMinutes} min shortfall × rate ÷ 60)
                        </span>
                      </td>
                      <td />
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {data.rateConfigured
                          ? <span className="text-red-700 font-bold text-[14px]">{fmtDollars(data.aggregateExposure)}</span>
                          : <span className="text-amber-600 font-semibold text-[13px]">Rate not configured</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                Based on service-type CPT rates. Adjust rates in{" "}
                <a
                  href="/settings?tab=cpt-codes"
                  className="text-emerald-600 hover:underline"
                >
                  Settings → CPT Codes
                </a>
                . Total reflects the aggregate shortfall (required − delivered minutes × rate ÷ 60) used by the Compliance Risk Report.
                The reconciliation row accounts for shortfall minutes not captured via explicit session logs.
              </p>
            </>
          )}

          {data && !data.rateConfigured && (
            <div className="flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
              <span>
                One or more service types do not have a configured CPT rate. Configure rates in{" "}
                <a href="/settings?tab=cpt-codes" className="underline font-medium">
                  Settings → CPT Codes
                </a>{" "}
                to see dollar exposure amounts.
              </span>
            </div>
          )}

          {data && (
            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => {
                  try {
                    downloadCSV(data, itemsExposureTotal);
                  } catch {
                    toast.error("Failed to export CSV");
                  }
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Export as CSV
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
