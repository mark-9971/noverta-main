import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Save, Info, CheckCircle2, AlertCircle, Pencil, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ServiceType {
  id: number;
  name: string;
  category: string;
  defaultBillingRate: string | null;
  cptCode: string | null;
}

interface RateConfig {
  id: number;
  serviceTypeId: number;
  inHouseRate: string | null;
  contractedRate: string | null;
  effectiveDate: string;
  notes: string | null;
  serviceTypeName: string;
}

interface RatesResponse {
  configs: RateConfig[];
  serviceTypes: Pick<ServiceType, "id" | "name" | "defaultBillingRate">[];
}

const CATEGORY_LABELS: Record<string, string> = {
  aba: "Applied Behavior Analysis",
  speech: "Speech-Language",
  ot: "Occupational Therapy",
  pt: "Physical Therapy",
  counseling: "Counseling",
  para_support: "Paraprofessional Support",
  other: "Other",
};

const SYSTEM_DEFAULT_RATE = 75;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function RateRow({
  serviceType,
  config,
  onSaved,
}: {
  serviceType: ServiceType;
  config: RateConfig | undefined;
  onSaved: () => void;
}) {
  // Display the most specific rate: inHouseRate first, then contractedRate as fallback.
  const activeRate = config?.inHouseRate ?? config?.contractedRate ?? null;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(activeRate ?? "");
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (rate: number) => {
      const res = await authFetch("/api/compensatory-finance/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceTypeId: serviceType.id,
          inHouseRate: rate,
          effectiveDate: today(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to save rate");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["district-rates"] });
      queryClient.invalidateQueries({ queryKey: ["cost-avoidance-risks"] });
      setEditing(false);
      onSaved();
      toast.success(`Rate saved for ${serviceType.name}`);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to save rate");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/compensatory-finance/rates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to remove rate");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["district-rates"] });
      queryClient.invalidateQueries({ queryKey: ["cost-avoidance-risks"] });
      onSaved();
      toast.success(`Rate removed for ${serviceType.name}`);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to remove rate");
    },
  });

  const hasDistrictRate = activeRate != null;
  const displayRate = hasDistrictRate
    ? `$${parseFloat(activeRate!).toFixed(2)}/hr`
    : null;

  const fallbackLabel = serviceType.defaultBillingRate
    ? `$${parseFloat(serviceType.defaultBillingRate).toFixed(2)}/hr (catalog)`
    : `$${SYSTEM_DEFAULT_RATE}.00/hr (system default)`;

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed === "") {
      toast.error("Enter a valid dollar amount (e.g. 85.00)");
      return;
    }
    const parsed = parseFloat(trimmed);
    if (!isFinite(parsed) || parsed <= 0) {
      toast.error("Rate must be a positive number greater than zero");
      return;
    }
    saveMutation.mutate(parsed);
  };

  const handleCancel = () => {
    setValue(config?.inHouseRate ?? "");
    setEditing(false);
  };

  const isPending = saveMutation.isPending || deleteMutation.isPending;

  return (
    <div className="flex items-center gap-3 py-3 px-4 hover:bg-gray-50/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{serviceType.name}</span>
          {hasDistrictRate ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" /> District rate
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
              <AlertCircle className="w-2.5 h-2.5" /> Using fallback
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-400 capitalize mt-0.5">
          {CATEGORY_LABELS[serviceType.category] || serviceType.category}
          {serviceType.cptCode && ` · CPT ${serviceType.cptCode}`}
        </p>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={String(SYSTEM_DEFAULT_RATE)}
              className="w-24 pl-5 pr-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              autoFocus
              onKeyDown={e => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
            />
          </div>
          <span className="text-xs text-gray-400">/hr</span>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending}
            className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
          >
            <Save className="w-3 h-3" />
          </Button>
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="text-right min-w-[96px]">
            {displayRate ? (
              <span className="text-sm font-semibold text-gray-900">{displayRate}</span>
            ) : (
              <span className="text-sm text-gray-400">{fallbackLabel}</span>
            )}
          </div>
          <button
            onClick={() => { setValue(activeRate ?? ""); setEditing(true); }}
            disabled={isPending}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="Edit rate"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {config && (
            <button
              onClick={() => deleteMutation.mutate(config.id)}
              disabled={isPending}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
              title="Remove district rate"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function BillingRatesPage() {
  const queryClient = useQueryClient();

  const { data: serviceTypes, isLoading: stLoading, isError: stError } = useQuery<ServiceType[]>({
    queryKey: ["service-types"],
    queryFn: () => authFetch("/api/service-types").then(r => {
      if (!r.ok) throw new Error("Failed to load service types");
      return r.json();
    }),
    staleTime: 60_000,
  });

  const { data: ratesData, isLoading: ratesLoading, isError: ratesError } = useQuery<RatesResponse>({
    queryKey: ["district-rates"],
    queryFn: () => authFetch("/api/compensatory-finance/rates").then(r => {
      if (!r.ok) throw new Error("Failed to load rate configs");
      return r.json();
    }),
    staleTime: 30_000,
  });

  const isLoading = stLoading || ratesLoading;
  const isError = stError || ratesError;

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["cost-avoidance-risks"] });
  };

  // Configs arrive sorted by effectiveDate DESC; iterate once and keep only the first
  // (most-recent) entry per serviceTypeId so newer rates always win.
  const configsByServiceType = new Map<number, RateConfig>();
  for (const c of (ratesData?.configs ?? [])) {
    if (!configsByServiceType.has(c.serviceTypeId)) {
      configsByServiceType.set(c.serviceTypeId, c);
    }
  }

  const withRate = serviceTypes?.filter(s => configsByServiceType.has(s.id)) ?? [];
  const withoutRate = serviceTypes?.filter(s => !configsByServiceType.has(s.id)) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Billing Rates</h2>
        <p className="text-sm text-gray-500 mt-1">
          Set your district's hourly billing rates for each service type. These rates are used to
          estimate financial exposure on the Cost Avoidance dashboard.
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-blue-800">
          <p className="font-medium mb-0.5">Rate priority: district rate → catalog rate → ${SYSTEM_DEFAULT_RATE}/hr system default</p>
          <p>
            District rates you configure here take precedence over any shared catalog rates.
            Service types without a district rate fall back to the catalog default, then to the
            ${SYSTEM_DEFAULT_RATE}/hr system default. Rates marked "system default" on the
            Cost Avoidance dashboard indicate an estimate — configure a rate to improve accuracy.
          </p>
        </div>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load billing rates. Please refresh and try again.
        </div>
      )}

      {serviceTypes && ratesData && (
        <>
          {withoutRate.length > 0 && (
            <Card className="border-amber-200/60">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  No district rate set ({withoutRate.length} service type{withoutRate.length !== 1 ? "s" : ""})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {withoutRate.map(st => (
                    <RateRow
                      key={st.id}
                      serviceType={st}
                      config={undefined}
                      onSaved={handleSaved}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {withRate.length > 0 && (
            <Card className="border-emerald-200/60">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  District-configured rates ({withRate.length} service type{withRate.length !== 1 ? "s" : ""})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {withRate.map(st => (
                    <RateRow
                      key={st.id}
                      serviceType={st}
                      config={configsByServiceType.get(st.id)}
                      onSaved={handleSaved}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {serviceTypes.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
              <DollarSign className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No service types configured yet.</p>
              <p className="text-xs text-gray-400 mt-1">Add service types in Settings → Service Types to get started.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
