import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

export function ExportTab() {
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<"csv" | "json">("csv");

  const { data: preview } = useQuery({
    queryKey: ["medicaid-claims", "approved"],
    queryFn: () => authFetch("/api/medicaid/claims?status=approved&limit=1").then(r => r.ok ? r.json() : null),
    staleTime: 30_000,
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/medicaid/claims/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Export failed");
      }
      if (format === "csv") {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `medicaid-claims-export.csv`;
        a.click();
        URL.revokeObjectURL(url);
        return { claimCount: 0 };
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (format === "json") {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `medicaid-claims-${data.batchId || "export"}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success("Claims exported successfully");
      queryClient.invalidateQueries({ queryKey: ["medicaid-claims"] });
      queryClient.invalidateQueries({ queryKey: ["medicaid-revenue"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const approvedCount = preview?.total ?? 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-gray-200/60">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-gray-600">Export Approved Claims</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <p className="text-[13px] text-gray-500">
            Export all <b className="text-gray-800">{approvedCount} approved</b> claims for upload to your district's Medicaid billing system.
            Exported claims will be marked as "exported" to prevent double-billing.
          </p>

          <div>
            <label className="text-[11px] font-medium text-gray-500 mb-2 block">Export Format</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")} className="text-emerald-600" />
                <div>
                  <span className="text-sm font-medium text-gray-700">CSV (837P-style)</span>
                  <p className="text-[10px] text-gray-400">Standard billing CSV for most systems</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={format === "json"} onChange={() => setFormat("json")} className="text-emerald-600" />
                <div>
                  <span className="text-sm font-medium text-gray-700">JSON</span>
                  <p className="text-[10px] text-gray-400">Structured data for API integrations</p>
                </div>
              </label>
            </div>
          </div>

          <Button
            onClick={() => exportMutation.mutate()}
            disabled={approvedCount === 0 || exportMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            {exportMutation.isPending ? "Exporting..." : `Export ${approvedCount} Claims`}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-gray-200/60">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-gray-600">Export Format Details</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="text-[12px] text-gray-500 space-y-2">
            <p><b className="text-gray-700">CSV columns:</b> ClaimID, PatientMedicaidID, PatientLastName, PatientFirstName, PatientDOB, ProviderNPI, ProviderMedicaidID, ServiceDate, CPTCode, Modifier, PlaceOfService, Units, BilledAmount, DiagnosisCode, ServiceDescription</p>
            <p><b className="text-gray-700">837P compatibility:</b> The CSV format includes all fields needed for standard Medicaid professional claims. Map columns to your billing system's import template.</p>
            <p><b className="text-gray-700">Audit trail:</b> Each export creates a batch ID linking claims to the export event for reconciliation.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
