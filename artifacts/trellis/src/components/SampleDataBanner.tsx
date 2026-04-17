import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { FlaskConical, Loader2, X } from "lucide-react";

interface SampleStatus {
  hasSampleData: boolean;
  sampleStudents: number;
  sampleStaff: number;
}

/**
 * Banner shown across the app when the current district has sample data
 * loaded. Only visible to admins/coordinators (the only roles who can
 * provision or remove sample data). Includes a one-click teardown.
 */
export function SampleDataBanner() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const isAdmin = role === "admin" || role === "coordinator";

  const { data } = useQuery<SampleStatus>({
    queryKey: ["sample-data/status"],
    queryFn: async () => {
      const r = await authFetch("/api/sample-data");
      if (!r.ok) throw new Error("sample-data status failed");
      return r.json();
    },
    staleTime: 60_000,
    enabled: isAdmin,
  });

  const teardown = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/sample-data", { method: "DELETE" });
      if (!r.ok) throw new Error("Teardown failed");
      return r.json();
    },
    onSuccess: () => {
      // Invalidate everything that may have shown sample rows.
      queryClient.invalidateQueries();
    },
  });

  if (!isAdmin || !data?.hasSampleData) return null;

  return (
    <div
      role="status"
      aria-label="Sample data notice"
      data-testid="banner-sample-data"
      className="flex flex-wrap items-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-900"
    >
      <FlaskConical className="w-3.5 h-3.5 flex-shrink-0 text-amber-700" />
      <span className="font-semibold">Sample data</span>
      <span className="text-amber-800">
        Your workspace includes <span className="font-medium">{data.sampleStudents}</span> sample
        student{data.sampleStudents === 1 ? "" : "s"} and {data.sampleStaff} sample staff so you
        can explore Trellis with realistic numbers. Replace with your real roster anytime.
      </span>
      <div className="ml-auto flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-amber-900 font-medium">Remove all sample data?</span>
            <button
              onClick={() => teardown.mutate()}
              disabled={teardown.isPending}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50"
              data-testid="button-confirm-teardown"
            >
              {teardown.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Yes, remove
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={teardown.isPending}
              className="px-2 py-0.5 rounded text-amber-800 hover:text-amber-900"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-900 underline"
            data-testid="button-remove-sample"
          >
            <X className="w-3 h-3" /> Remove sample data
          </button>
        )}
      </div>
    </div>
  );
}
