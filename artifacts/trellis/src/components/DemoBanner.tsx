import { useMemo, useState } from "react";
import { useListDistricts, useListSchools } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { authFetch } from "@/lib/auth-fetch";
import { CheckCircle2, FlaskConical, Loader2, RotateCcw } from "lucide-react";

interface DistrictLite {
  id: number;
  name: string;
  isDemo?: boolean;
  isPilot?: boolean;
}

interface SchoolLite {
  id: number;
  districtId?: number | null;
}

function useActiveDistrictByFlag(flag: "isDemo" | "isPilot") {
  const { selectedDistrictId, selectedSchoolId } = useSchoolContext();
  const { data: districtData } = useListDistricts();
  const { data: schoolData } = useListSchools();
  const districts = (districtData as DistrictLite[] | undefined) ?? [];
  const schools = (schoolData as SchoolLite[] | undefined) ?? [];

  return useMemo(() => {
    if (!districts.length) return null;
    const matchById = new Map(districts.filter(d => d[flag]).map(d => [d.id, d]));
    if (matchById.size === 0) return null;

    if (selectedDistrictId) return matchById.get(selectedDistrictId) ?? null;
    if (selectedSchoolId) {
      const school = schools.find(s => s.id === selectedSchoolId);
      if (school?.districtId != null) return matchById.get(school.districtId) ?? null;
      return null;
    }
    if (districts.length === 1 && districts[0][flag]) return districts[0];
    return null;
  }, [districts, schools, selectedDistrictId, selectedSchoolId, flag]);
}

export function useActiveDemoDistrict() {
  return useActiveDistrictByFlag("isDemo");
}

export function useActivePilotDistrict() {
  return useActiveDistrictByFlag("isPilot");
}

interface ResetResponse {
  ok: boolean;
  elapsedMs: number;
  variety: {
    alertsInserted: number;
    alertsSkipped: number;
    compliancePct: string;
  };
}

/**
 * Persistent, non-dismissible banner shown whenever the active scope is a
 * demo district (e.g. MetroWest Collaborative). Indicates to viewers that
 * actions are not real, and exposes a one-click "Reset demo data" affordance
 * to platform admins so the canonical demo state can be restored between
 * back-to-back sales demos.
 */
export function DemoBanner() {
  const demoDistrict = useActiveDemoDistrict();
  const { isPlatformAdmin } = useRole();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [lastResult, setLastResult] = useState<ResetResponse | null>(null);

  const reset = useMutation({
    mutationFn: async (): Promise<ResetResponse> => {
      const r = await authFetch("/api/sample-data/reset-demo", { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || "Demo reset failed");
      return body as ResetResponse;
    },
    onSuccess: (body) => {
      setConfirming(false);
      setLastResult(body);
      // Invalidate everything so freshly-shaped alerts/compliance load.
      queryClient.invalidateQueries();
    },
  });

  if (!demoDistrict) return null;

  const resetError = reset.error instanceof Error ? reset.error.message : null;

  return (
    <div
      role="status"
      aria-label="Sample data notice"
      data-testid="banner-demo-data"
      className="flex flex-wrap items-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-900"
    >
      <FlaskConical className="w-3.5 h-3.5 flex-shrink-0 text-amber-700" />
      <span className="font-semibold">Sample data — actions are not real.</span>
      <span className="text-amber-800 hidden sm:inline">
        You're viewing <span className="font-medium">{demoDistrict.name}</span>, a sample district
        for demos and product tours.
      </span>

      <div className="ml-auto flex items-center gap-2">
        {lastResult && !reset.isPending && !confirming && (
          <span
            className="inline-flex items-center gap-1 text-emerald-800"
            data-testid="text-demo-reset-success"
          >
            <CheckCircle2 className="w-3 h-3" />
            Demo reset · compliance {lastResult.variety.compliancePct}% ·{" "}
            {lastResult.variety.alertsInserted} new / {lastResult.variety.alertsSkipped} kept
          </span>
        )}
        {resetError && !reset.isPending && (
          <span className="text-red-700" data-testid="text-demo-reset-error">{resetError}</span>
        )}

        {isPlatformAdmin && !confirming && !reset.isPending && (
          <button
            onClick={() => { setLastResult(null); setConfirming(true); }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-700 text-white hover:bg-amber-800"
            data-testid="button-reset-demo"
            title="Re-run the demo variety + module sweep scripts to restore the canonical demo state"
          >
            <RotateCcw className="w-3 h-3" /> Reset demo data
          </button>
        )}

        {isPlatformAdmin && confirming && !reset.isPending && (
          <>
            <span className="text-amber-900 font-medium">
              Reset {demoDistrict.name} to canonical demo state?
            </span>
            <button
              onClick={() => reset.mutate()}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-700 text-white hover:bg-amber-800"
              data-testid="button-confirm-reset-demo"
            >
              Yes, reset
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-2 py-0.5 rounded text-amber-800 hover:text-amber-900"
              data-testid="button-cancel-reset-demo"
            >
              Cancel
            </button>
          </>
        )}

        {reset.isPending && (
          <span
            className="inline-flex items-center gap-1 text-amber-900 font-medium"
            data-testid="text-demo-reset-progress"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            Resetting demo data…
          </span>
        )}
      </div>
    </div>
  );
}
