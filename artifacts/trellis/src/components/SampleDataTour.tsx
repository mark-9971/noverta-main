import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { Sparkles, X, ArrowRight, ArrowLeft, Compass } from "lucide-react";
import { startShowcaseTour } from "@/components/ShowcaseTour";

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

const STORAGE_KEY_PREFIX = "trellis.sampleTour.v1";
const START_FLAG = "trellis.sampleTour.start";

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
    selector: '[data-tour-id="compliance-summary"]',
    path: "/compliance-risk-report",
    title: "Welcome — your sample district is loaded",
    body:
      "This is the compliance-risk view. The headline numbers show what share of mandated minutes have been delivered, and how much exposure has accumulated.",
  },
  {
    selector: '[data-tour-id="shortfall-student"]',
    path: "/compliance-risk-report",
    title: "One student already falling behind",
    body:
      "Noverta surfaces students whose delivered minutes lag their IEP requirement. This is the shortfall that triggers compensatory time if it isn't addressed.",
  },
  {
    selector: '[data-tour-id="cost-risk"]',
    path: "/compliance-risk-report",
    title: "Compensatory exposure projection",
    body:
      "Each shortfall translates into estimated dollars the district may owe in make-up services. This is the cost-risk lens that lets you prioritize.",
  },
  {
    selector: '[data-tour-id="readiness-checklist"]',
    path: "/",
    title: "Your readiness checklist",
    body:
      "When you're ready to bring in your real district, this checklist walks through the steps — connecting your SIS, importing students, assigning providers.",
  },
  {
    selector: '[data-testid="banner-sample-data"]',
    path: null,
    title: "Remove sample data anytime",
    body:
      "Sample students and staff are tagged separately from your real roster. Tear them down with one click from the banner at the top.",
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
    
  }
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

export function SampleDataTour() {
  // E2E escape hatch: tests inject window.__TRELLIS_DISABLE_TOURS__=true or
  // set localStorage["trellis.disableTours"]="1" to fully suppress the tour
  // (no auto-open, no replay event handling, no overlay render). Checked at
  // the top of render so all activation paths are short-circuited.
  if (typeof window !== "undefined") {
    const w = window as unknown as { __TRELLIS_DISABLE_TOURS__?: boolean };
    if (w.__TRELLIS_DISABLE_TOURS__ === true) return null;
    try {
      if (window.localStorage.getItem("trellis.disableTours") === "1") return null;
    } catch {
      // ignore
    }
  }
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

  // Tour is gated to admins of districts where sample data is currently
  // loaded. It fires once per browser when the admin first lands after a
  // seed (start flag), or once if hasSampleData becomes true and the user
  // has not yet seen it.
  useEffect(() => {
    if (!clerkLoaded) return;
    // E2E escape hatch: tests inject window.__TRELLIS_DISABLE_TOURS__ or set
    // localStorage["trellis.disableTours"]="1" to prevent the tour from
    // auto-opening (and auto-navigating to /compliance-risk-report on Step 1)
    // during automated runs.
    if (typeof window !== "undefined") {
      const w = window as unknown as { __TRELLIS_DISABLE_TOURS__?: boolean };
      if (w.__TRELLIS_DISABLE_TOURS__ === true) return;
      try {
        if (window.localStorage.getItem("trellis.disableTours") === "1") return;
      } catch {
        // ignore
      }
    }
    if (!isAdmin || !data?.hasSampleData) return;
    if (active) return;
    if (consumeStartFlag()) {
      setStepIdx(0);
      setActive(true);
      return;
    }
    if (!readSeen(userId, data?.districtId ?? null)) {
      setStepIdx(0);
      setActive(true);
    }
  }, [clerkLoaded, userId, data?.districtId, isAdmin, data?.hasSampleData, active]);

  // Listen for an explicit "replay tour" request (e.g. from the
  // SampleDataBanner's "Replay tour" button). The localStorage flags set
  // by the dispatcher cover the case where this component isn't mounted
  // yet; this listener handles the case where it already is.
  useEffect(() => {
    function onReplay() {
      if (!isAdmin || !data?.hasSampleData) return;
      setStepIdx(0);
      setActive(true);
    }
    window.addEventListener("trellis:sampleTour:replay", onReplay);
    return () => window.removeEventListener("trellis:sampleTour:replay", onReplay);
  }, [isAdmin, data?.hasSampleData]);

  // Auto-close if sample data is removed (e.g. via the banner) while the
  // tour is mid-flight — the surfaces it points at will go empty and the
  // tour would just be confusing.
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
    const maxAttempts = 20; 

    
    if (step.path && location !== step.path) {
      navigate(step.path);
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
    
  }, [active, stepIdx]);

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const isFirst = stepIdx === 0;

  function dismiss() {
    setActive(false);
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
    const POP_W = 340;
    const POP_H_EST = 200;
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
      aria-label="Noverta sample data tour"
      data-testid="sample-data-tour"
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
              "0 0 0 9999px rgba(15, 23, 42, 0.55), 0 0 0 2px rgba(16, 185, 129, 0.9), 0 0 24px rgba(16, 185, 129, 0.45)",
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
        className="rounded-xl bg-white shadow-2xl border border-emerald-100"
        data-testid={`tour-step-${stepIdx}`}
        style={{
          position: "fixed",
          top: popoverPos.top,
          left: popoverPos.left,
          width: 340,
          maxWidth: "calc(100vw - 32px)",
          pointerEvents: "auto",
        }}
      >
        <div className="flex items-start gap-2 px-4 pt-3.5 pb-1">
          <div className="flex-shrink-0 w-7 h-7 rounded-md bg-emerald-100 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-emerald-700 uppercase tracking-wide">
              Sample data tour · {stepIdx + 1} of {STEPS.length}
            </div>
            <div className="text-[15px] font-semibold text-gray-900 leading-snug mt-0.5">
              {step.title}
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Skip tour"
            data-testid="button-tour-dismiss"
            className="flex-shrink-0 -mr-1 -mt-1 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="px-4 py-2 text-sm text-gray-600 leading-relaxed">{step.body}</p>
        {isLast && (
          <div className="px-4 pb-2">
            <button
              type="button"
              data-testid="button-tour-handoff-showcase"
              onClick={() => {
                // Mark this tour seen, then hand off to the longer
                // cross-module showcase tour.
                markSeen(userId, data?.districtId ?? null);
                setActive(false);
                startShowcaseTour();
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              Continue with the full showcase tour
            </button>
            <p className="text-[11px] text-gray-400 mt-1.5 text-center">
              Walks through the strongest screen of every module.
            </p>
          </div>
        )}
        <div className="flex items-center justify-between px-3 py-2.5 border-t border-gray-100 bg-gray-50/60 rounded-b-xl">
          <button
            onClick={dismiss}
            data-testid="button-tour-skip"
            className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={back}
              disabled={isFirst}
              data-testid="button-tour-back"
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ArrowLeft className="w-3 h-3" /> Back
            </button>
            <button
              onClick={next}
              data-testid="button-tour-next"
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
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
