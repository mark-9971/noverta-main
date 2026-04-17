import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";
import type { RatesResponse } from "./types";

export function RateConfigTab({ ratesData, loading, showForm, onToggleForm, queryClient }: {
  ratesData: RatesResponse | undefined;
  loading: boolean;
  showForm: boolean;
  onToggleForm: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [formServiceTypeId, setFormServiceTypeId] = useState("");
  const [formInHouseRate, setFormInHouseRate] = useState("");
  const [formContractedRate, setFormContractedRate] = useState("");
  const [formEffectiveDate, setFormEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/compensatory-finance/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceTypeId: Number(formServiceTypeId),
          inHouseRate: formInHouseRate ? Number(formInHouseRate) : null,
          contractedRate: formContractedRate ? Number(formContractedRate) : null,
          effectiveDate: formEffectiveDate,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compensatory-finance-rates"] });
      queryClient.invalidateQueries({ queryKey: ["compensatory-finance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["compensatory-finance-students"] });
      queryClient.invalidateQueries({ queryKey: ["compensatory-finance-burndown"] });
      toast.success("Rate saved");
      onToggleForm();
      setFormServiceTypeId("");
      setFormInHouseRate("");
      setFormContractedRate("");
    },
    onError: () => toast.error("Failed to save rate"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/compensatory-finance/rates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compensatory-finance-rates"] });
      queryClient.invalidateQueries({ queryKey: ["compensatory-finance-overview"] });
      toast.success("Rate deleted");
    },
    onError: () => toast.error("Failed to delete rate"),
  });

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure in-house and contracted rates per service type. These rates are used to calculate dollar values for compensatory obligations.
        </p>
        <Button variant="outline" size="sm" onClick={onToggleForm} className="gap-2">
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Add Rate"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs">Service Type</Label>
                <select
                  value={formServiceTypeId}
                  onChange={e => setFormServiceTypeId(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background"
                >
                  <option value="">Select...</option>
                  {ratesData?.serviceTypes.map(st => (
                    <option key={st.id} value={st.id}>{st.name} {st.defaultBillingRate ? `(default: $${st.defaultBillingRate}/hr)` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">In-House Rate ($/hr)</Label>
                <Input type="number" step="0.01" value={formInHouseRate} onChange={e => setFormInHouseRate(e.target.value)} className="mt-1" placeholder="e.g. 75.00" />
              </div>
              <div>
                <Label className="text-xs">Contracted Rate ($/hr)</Label>
                <Input type="number" step="0.01" value={formContractedRate} onChange={e => setFormContractedRate(e.target.value)} className="mt-1" placeholder="e.g. 125.00" />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Effective Date</Label>
                  <Input type="date" value={formEffectiveDate} onChange={e => setFormEffectiveDate(e.target.value)} className="mt-1" />
                </div>
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={!formServiceTypeId || saveMutation.isPending}
                >
                  Save
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          {!ratesData?.configs.length ? (
            <p className="text-center text-muted-foreground py-8">No custom rates configured. Default service type rates will be used.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">Service Type</th>
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">In-House Rate</th>
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">Contracted Rate</th>
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">Default Rate</th>
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">Effective Date</th>
                  <th className="pb-2 text-muted-foreground font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ratesData.configs.map(c => (
                  <tr key={c.id} className="hover:bg-muted/50">
                    <td className="py-2.5 pr-4 font-medium">{c.serviceTypeName}</td>
                    <td className="py-2.5 pr-4">{c.inHouseRate ? `$${parseFloat(c.inHouseRate).toFixed(2)}/hr` : "-"}</td>
                    <td className="py-2.5 pr-4">{c.contractedRate ? `$${parseFloat(c.contractedRate).toFixed(2)}/hr` : "-"}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{c.defaultRate ? `$${parseFloat(c.defaultRate).toFixed(2)}/hr` : "-"}</td>
                    <td className="py-2.5 pr-4">{c.effectiveDate}</td>
                    <td className="py-2.5">
                      <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(c.id)} disabled={deleteMutation.isPending}>
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
