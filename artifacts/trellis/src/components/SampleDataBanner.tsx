import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { CheckCircle2, FlaskConical, Loader2, PlayCircle, Sparkles, X } from "lucide-react";

const TOUR_STORAGE_PREFIX = "trellis.sampleTour.v1";
const TOUR_START_FLAG = "trellis.sampleTour.start";

function armReplayTour() {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(TOUR_STORAGE_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
    window.localStorage.setItem(TOUR_START_FLAG, "1");
  } catch {
    /* localStorage unavailable; tour will still re-arm via the event below */
  }
  // Notify a mounted SampleDataTour to reopen at step 0 immediately. The
  // localStorage flags above also let the tour fire if it mounts later
  // (e.g. after a route change).
  try {
    window.dispatchEvent(new Event("trellis:sampleTour:replay"));
  } catch {
    /* no-op */
  }
}

interface SampleStatus {
  hasSampleData: boolean;
  sampleStudents: number;
  sampleStaff: number;
}

const REMOVED_NOTICE_TIMEOUT_MS = 30_000;

/**
 * Banner shown across the app when the current district has sample data
 * loaded. Only visible to admins/coordinators (the only roles who can
 * provision or remove sample data). Includes one-click teardown and a
 * follow-up "Sample data removed — Restore" notice so admins can put it
 * back without leaving the page they're on.
 */
export function SampleDataBanner() {
  const { role } = useRole();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [removedNotice, setRemovedNotice] = useState(false);
  const [alreadySeededNotice, setAlreadySeededNotice] = useState(false);
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
      setConfirming(false);
      setRemovedNotice(true);
      // Invalidate everything that may have shown sample rows.
      queryClient.invalidateQueries();
    },
  });

  const reseed = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/sample-data", { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || "Failed to load sample data");
      return body;
    },
    onSuccess: (body) => {
      setRemovedNotice(false);
      setAlreadySeededNotice(Boolean(body?.alreadySeeded));
      queryClient.invalidateQueries();
      // Land back on the value-moment surface so the freshly seeded
      // dashboards aren't empty.
      navigate("/compliance-risk-report");
    },
  });

  // Auto-dismiss the "removed" notice so it doesn't linger forever; admins
  // who need it later can use the persistent affordance in the readiness
  // panel.
  useEffect(() => {
    if (!removedNotice) return;
    const t = setTimeout(() => setRemovedNotice(false), REMOVED_NOTICE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [removedNotice]);

  useEffect(() => {
    if (!alreadySeededNotice) return;
    const t = setTimeout(() => setAlreadySeededNotice(false), REMOVED_NOTICE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [alreadySeededNotice]);

  if (!isAdmin) return null;

  if (alreadySeededNotice) {
    return (
      <div
        role="status"
        aria-label="Sample data already present"
        data-testid="banner-sample-data-already-seeded"
        className="flex flex-wrap items-center gap-2 px-4 py-1.5 bg-sky-50 border-b border-sky-200 text-[12px] text-sky-900"
      >
        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-sky-700" />
        <span className="font-semibold">Sample data was already present</span>
        <span className="text-sky-800">
          No new rows added — your workspace already had{" "}
          <span className="font-medium">{data?.sampleStudents ?? 0}</span> sample student
          {data?.sampleStudents === 1 ? "" : "s"} and {data?.sampleStaff ?? 0} sample staff.
        </span>
        <div className="ml-auto">
          <button
            onClick={() => setAlreadySeededNotice(false)}
            className="px-2 py-0.5 rounded text-sky-800 hover:text-sky-900"
            aria-label="Dismiss"
            data-testid="button-dismiss-already-seeded-notice"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  if (removedNotice) {
    const reseedError = reseed.error instanceof Error ? reseed.error.message : null;
    return (
      <div
        role="status"
        aria-label="Sample data removed"
        data-testid="banner-sample-data-removed"
        className="flex flex-wrap items-center gap-2 px-4 py-1.5 bg-emerald-50 border-b border-emerald-200 text-[12px] text-emerald-900"
      >
        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-700" />
        <span className="font-semibold">Sample data removed</span>
        <span className="text-emerald-800">
          Your workspace is back to your real roster.
          {reseedError && <span className="ml-1 text-red-700">{reseedError}</span>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => reseed.mutate()}
            disabled={reseed.isPending}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
            data-testid="button-restore-sample"
          >
            {reseed.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            Restore sample data
          </button>
          <button
            onClick={() => setRemovedNotice(false)}
            disabled={reseed.isPending}
            className="px-2 py-0.5 rounded text-emerald-800 hover:text-emerald-900"
            aria-label="Dismiss"
            data-testid="button-dismiss-removed-notice"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  if (!data?.hasSampleData) return null;

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
        {!confirming && (
          <button
            onClick={armReplayTour}
            className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-900 underline"
            data-testid="button-replay-tour"
            title="Reopen the guided product tour from step 1"
          >
            <PlayCircle className="w-3 h-3" /> Replay tour
          </button>
        )}
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
