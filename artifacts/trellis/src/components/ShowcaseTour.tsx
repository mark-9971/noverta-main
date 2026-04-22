import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { Compass, X, ArrowRight, ArrowLeft } from "lucide-react";

/**
 * Showcase Tour — a longer, cross-module guided walkthrough that visits
 * the strongest screen of each major Trellis module so a viewer can see
 * "everything" without clicking around. Designed to live alongside the
 * shorter SampleDataTour: that tour orients a new admin to the freshly
 * seeded sample district, and this one points at the breadth of the
 * product across modules.
 *
 * Persistence and gating mirror SampleDataTour: gated to admins on
 * districts where sample data is loaded, persisted per Clerk user ×
 * district, replayable from the SampleDataBanner (via a custom event)
 * and from a Settings → General control. Triggered explicitly — there
 * is no auto-start on first sample-data load (the SampleDataTour owns
 * that moment, and hands off into this one if the user opts in).
 */

interface SampleStatus {
  hasSampleData: boolean;
  sampleStudents: number;
  sampleStaff: number;
  districtId?: number;
}

interface TourStep {
  // CSS selector for the element to highlight; null centers the popover.
  selector: string | null;
  // If set, the tour will navigate here before showing the step.
  path: string | null;
  title: string;
  body: string;
}

const STORAGE_KEY_PREFIX = "trellis.showcaseTour.v1";
const START_FLAG = "trellis.showcaseTour.start";

function storageKeyFor(
  userId: string | null | undefined,
  districtId: number | null | undefined,
): string {
  const u = userId ?? "anon";
  const d = districtId != null ? String(districtId) : "nodistrict";
  return `${STORAGE_KEY_PREFIX}.${d}.${u}`;
}

const STEPS: TourStep[] = [
  {
    selector: '[data-testid="section-overall-compliance"]',
    path: "/",
    title: "Dashboard — are we compliant?",
    body:
      "The home dashboard answers the leadership question first: what share of mandated minutes have we delivered, and which students need attention right now.",
  },
  {
    selector: '[data-tour-id="cost-risk"]',
    path: "/compliance?tab=risk-report",
    title: "Compliance & exposure",
    body:
      "Drill in to the compliance-risk view: every shortfall is translated into projected compensatory dollars so leadership can prioritize.",
  },
  {
    selector: '[data-tour-id="showcase-iep-builder"]',
    path: "/iep-builder",
    title: "IEP draft builder",
    body:
      "A guided, multi-step IEP draft your team can collaborate on — context, parent input, teacher input, transition, and AI-assisted generation.",
  },
  {
    selector: '[data-tour-id="showcase-progress-reports"]',
    path: "/progress-reports",
    title: "Progress reports",
    body:
      "Quarterly progress reports auto-generated from logged sessions and goal data — review, edit, and send to families in minutes instead of hours.",
  },
  {
    selector: '[data-tour-id="showcase-parent-portal"]',
    path: "/parent-communication",
    title: "Parent communication",
    body:
      "All parent contacts, follow-ups, and required notifications in one log so the district can prove engagement and never miss a mandated touchpoint.",
  },
  {
    selector: '[data-tour-id="showcase-protective-measures"]',
    path: "/protective-measures",
    title: "Restraint & seclusion incidents",
    body:
      "Compliant incident capture with state-reportable fields, quick-report mode for the field, and DESE bulk export for monthly filings.",
  },
  {
    selector: '[data-tour-id="showcase-compensatory"]',
    path: "/compensatory",
    title: "Compensatory obligations",
    body:
      "Track owed minutes per student, calculate shortfalls, and log make-up sessions — the workflow that closes the loop on compliance exposure.",
  },
  {
    selector: '[data-tour-id="showcase-medicaid"]',
    path: "/medicaid-billing",
    title: "Medicaid claim queue",
    body:
      "Build claim drafts from logged sessions, review them in the queue, and export a CSV for upload to your district's Medicaid billing system.",
  },
  {
    selector: '[data-tour-id="showcase-sis-sync"]',
    path: "/settings?tab=sis",
    title: "SIS sync",
    body:
      "CSV roster upload works today; PowerSchool, Infinite Campus, Skyward, and SFTP connectors are in early pilot. Configure your roster source here.",
  },
  {
    selector: '[data-tour-id="showcase-reports"]',
    path: "/reports",
    title: "Reports & exports",
    body:
      "Executive summary, minute summary, missed sessions, parent summary, audit package — every report your team needs for board meetings or audits.",
  },
];

function readSeen(
  userId: string | null | undefined,
  districtId: number | null | undefined,
): boolean {
  try {
    return window.localStorage.getItem(storageKeyFor(userId, districtId)) === "seen";
  } catch {
    return false;
  }
}

function markSeen(
  userId: string | null | undefined,
  districtId: number | null | undefined,
) {
  try {
    window.localStorage.setItem(storageKeyFor(userId, districtId), "seen");
    window.localStorage.removeItem(START_FLAG);
  } catch {
    /* ignore */
  }
}

function toursDisabled(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { __TRELLIS_DISABLE_TOURS__?: boolean };
  if (w.__TRELLIS_DISABLE_TOURS__ === true) return true;
  try {
    if (window.localStorage.getItem("trellis.disableTours") === "1") return true;
  } catch {
    // ignore
  }
  return false;
}

function consumeStartFlag(): boolean {
  try {
    const v = window.localStorage.getItem(START_FLAG) === "1";
    if (v) window.localStorage.removeItem(START_FLAG);
    return v;
  } catch {
    return false;
  }
}

/**
 * Imperative entry point used by the dashboard button, the
 * SampleDataTour handoff, and the Settings replay control. Sets a
 * localStorage flag (so the tour fires even if the user navigates
 * before it mounts) and dispatches an event for the already-mounted
 * case.
 */
export function startShowcaseTour() {
  // The start flag bypasses the per-user × per-district seen check
  // inside the tour, so we don't need to clear any seen keys here.
  // Leaving them intact preserves accurate per-user × per-district
  // history in shared-browser scenarios (e.g. multiple SEs walking
  // through different demo districts on the same machine).
  try {
    window.localStorage.setItem(START_FLAG, "1");
  } catch {
    /* localStorage unavailable; the event below still re-opens it */
  }
  try {
    window.dispatchEvent(new Event("trellis:showcaseTour:start"));
  } catch {
    /* no-op */
  }
}

export function ShowcaseTour() {
  // E2E escape hatch — see SampleDataTour for rationale.
  if (toursDisabled()) return null;
  const { role } = useRole();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const userId = clerkUser?.id ?? null;
  const [location, navigate] = useLocation();
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

  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);

  // Honor the start flag set by startShowcaseTour() before the
  // component mounted (e.g. set on the dashboard, then user navigates
  // and the tour mounts on the new page).
  useEffect(() => {
    if (!clerkLoaded) return;
    if (toursDisabled()) return;
    if (!isAdmin || !data?.hasSampleData) return;
    if (active) return;
    if (consumeStartFlag()) {
      setStepIdx(0);
      setActive(true);
    }
  }, [clerkLoaded, isAdmin, data?.hasSampleData, active]);

  // Live "start" event for the case where the tour is already mounted.
  useEffect(() => {
    function onStart() {
      if (toursDisabled()) return;
      if (!isAdmin || !data?.hasSampleData) return;
      setStepIdx(0);
      setActive(true);
    }
    window.addEventListener("trellis:showcaseTour:start", onStart);
    return () => window.removeEventListener("trellis:showcaseTour:start", onStart);
  }, [isAdmin, data?.hasSampleData]);

  // Auto-close if sample data is removed mid-flight — the surfaces it
  // points at will go empty and the tour would just be confusing.
  useEffect(() => {
    if (active && (!isAdmin || data?.hasSampleData === false)) {
      setActive(false);
    }
  }, [active, isAdmin, data?.hasSampleData]);

  useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIdx];
    if (!step) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30;

    if (step.path) {
      // Compare against the current location ignoring the query string,
      // because some target paths include `?tab=…`.
      const [stepPath] = step.path.split("?");
      if (location !== stepPath && location !== step.path) {
        console.error("[ShowcaseTour] navigating to", step.path, "from", location);
        navigate(step.path);
      }
    }

    function tick() {
      if (cancelled) return;
      const step = STEPS[stepIdx];
      if (!step) return;

      if (!step.selector) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        const inView =
          r.top >= 0 &&
          r.bottom <= window.innerHeight &&
          r.left >= 0 &&
          r.right <= window.innerWidth;
        if (!inView) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        setRect(el.getBoundingClientRect());
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        rafRef.current = window.setTimeout(tick, 200) as unknown as number;
      } else {
        setRect(null);
      }
    }

    tick();

    function onResize() {
      const step = STEPS[stepIdx];
      if (!step?.selector) return;
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) setRect(el.getBoundingClientRect());
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      cancelled = true;
      if (rafRef.current) {
        window.clearTimeout(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, stepIdx, location, navigate]);

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const isFirst = stepIdx === 0;

  function dismiss() {
    setActive(false);
    // Mark as "seen" on either skip or finish — both count as completed
    // for the per-user × per-district flag, mirroring SampleDataTour.
    markSeen(userId, data?.districtId ?? null);
  }

  function next() {
    if (isLast) {
      dismiss();
      return;
    }
    setStepIdx((i) => i + 1);
  }

  function back() {
    if (isFirst) return;
    setStepIdx((i) => Math.max(0, i - 1));
  }

  const popoverPos = useMemo(() => {
    const PAD = 8;
    const POP_W = 360;
    const POP_H_EST = 220;
    if (!rect) {
      return {
        top: Math.max(16, window.innerHeight / 2 - POP_H_EST / 2),
        left: Math.max(16, window.innerWidth / 2 - POP_W / 2),
        centered: true,
      };
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeBelow = spaceBelow > POP_H_EST + 24;
    const top = placeBelow
      ? rect.bottom + PAD + 6
      : Math.max(16, rect.top - POP_H_EST - PAD - 6);
    let left = rect.left;
    if (left + POP_W > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - POP_W - 16);
    }
    if (left < 16) left = 16;
    return { top, left, centered: false };
  }, [rect]);

  if (!active || !step) return null;

  return createPortal(
    <div
      role="dialog"
      aria-label="Trellis showcase tour"
      data-testid="showcase-tour"
      className="fixed inset-0 z-[80]"
      style={{ pointerEvents: "none" }}
    >
      {rect ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 10,
            boxShadow:
              "0 0 0 9999px rgba(15, 23, 42, 0.55), 0 0 0 2px rgba(99, 102, 241, 0.9), 0 0 24px rgba(99, 102, 241, 0.45)",
            transition: "top 150ms ease, left 150ms ease, width 150ms ease, height 150ms ease",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            pointerEvents: "auto",
          }}
          onClick={dismiss}
        />
      )}

      <div
        className="rounded-xl bg-white shadow-2xl border border-indigo-100"
        data-testid={`showcase-step-${stepIdx}`}
        style={{
          position: "fixed",
          top: popoverPos.top,
          left: popoverPos.left,
          width: 360,
          maxWidth: "calc(100vw - 32px)",
          pointerEvents: "auto",
        }}
      >
        <div className="flex items-start gap-2 px-4 pt-3.5 pb-1">
          <div className="flex-shrink-0 w-7 h-7 rounded-md bg-indigo-100 flex items-center justify-center">
            <Compass className="w-4 h-4 text-indigo-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-indigo-700 uppercase tracking-wide">
              Showcase tour · {stepIdx + 1} of {STEPS.length}
            </div>
            <div className="text-[15px] font-semibold text-gray-900 leading-snug mt-0.5">
              {step.title}
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Skip tour"
            data-testid="button-showcase-dismiss"
            className="flex-shrink-0 -mr-1 -mt-1 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="px-4 py-2 text-sm text-gray-600 leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-between px-3 py-2.5 border-t border-gray-100 bg-gray-50/60 rounded-b-xl">
          <button
            onClick={dismiss}
            data-testid="button-showcase-skip"
            className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={back}
              disabled={isFirst}
              data-testid="button-showcase-back"
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ArrowLeft className="w-3 h-3" /> Back
            </button>
            <button
              onClick={next}
              data-testid="button-showcase-next"
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {isLast ? "Finish" : "Next"} {!isLast && <ArrowRight className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
