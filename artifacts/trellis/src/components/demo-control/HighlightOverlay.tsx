import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDemoMode } from "@/lib/demo-mode";
import { useRole } from "@/lib/role-context";
import { useActiveDemoDistrict } from "@/components/DemoBanner";
import { Lightbulb, X } from "lucide-react";

/**
 * Optional in-app highlight overlay (Panel 13). When toggled on from the
 * Demo Control Center, this scans the current page for elements tagged with
 * `data-demo-highlight="alert" | "risk" | "session"` and renders a small
 * outline + caption next to each, explaining why the alert exists, how a
 * student got at risk, or how the most recent logged session updated
 * compliance.
 *
 * Strict guards:
 *   - Platform admins on a demo district only. Otherwise renders null.
 *   - Pure DOM scan; no data fetching. Tagged elements live in the existing
 *     dashboard surfaces.
 */
type HighlightKind = "alert" | "risk" | "session";

const HIGHLIGHT_COPY: Record<HighlightKind, { title: string; body: string; color: string }> = {
  alert: {
    title: "Why this alert?",
    body: "Triggered when delivered minutes for a mandated service drop below the IEP target. Clearing it requires either a logged make-up session or a formal compensatory plan.",
    color: "ring-red-400 bg-red-50/95 border-red-300 text-red-900",
  },
  risk: {
    title: "How this student got at risk",
    body: "The student's running 4-week minute delivery vs. their IEP requirement crossed the risk threshold. Click into the student to see which weeks fell short and which provider was assigned.",
    color: "ring-amber-400 bg-amber-50/95 border-amber-300 text-amber-900",
  },
  session: {
    title: "How this session updated compliance",
    body: "The most recent logged session was credited to the student's mandated minute total in real time — that's how the dashboard recalculates compliance without an overnight job.",
    color: "ring-emerald-400 bg-emerald-50/95 border-emerald-300 text-emerald-900",
  },
};

interface Annotation {
  kind: HighlightKind;
  rect: DOMRect;
}

function scan(): Annotation[] {
  const out: Annotation[] = [];
  const seen = new Set<HighlightKind>();
  const els = document.querySelectorAll<HTMLElement>("[data-demo-highlight]");
  els.forEach((el) => {
    const kind = el.getAttribute("data-demo-highlight") as HighlightKind | null;
    if (!kind || !(kind in HIGHLIGHT_COPY)) return;
    // Show one annotation per kind per page to avoid clutter — first match wins.
    if (seen.has(kind)) return;
    seen.add(kind);
    out.push({ kind, rect: el.getBoundingClientRect() });
  });
  return out;
}

export function HighlightOverlay() {
  const { highlightMode, setHighlightMode } = useDemoMode();
  const { isPlatformAdmin } = useRole();
  const demoDistrict = useActiveDemoDistrict();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const enabled = highlightMode && isPlatformAdmin && !!demoDistrict;

  useEffect(() => {
    if (!enabled) {
      setAnnotations([]);
      return;
    }
    let raf = 0;
    function tick() {
      setAnnotations(scan());
      raf = window.requestAnimationFrame(tick);
    }
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, [enabled]);

  if (!enabled) return null;

  return createPortal(
    <div
      aria-hidden
      data-testid="demo-highlight-overlay"
      className="fixed inset-0 z-[60] pointer-events-none"
    >
      {annotations.map((a, i) => {
        const copy = HIGHLIGHT_COPY[a.kind];
        const top = a.rect.top - 6;
        const left = a.rect.left - 6;
        const w = a.rect.width + 12;
        const h = a.rect.height + 12;
        const POP_W = 280;
        const popLeft = Math.min(window.innerWidth - POP_W - 16, Math.max(16, a.rect.right + 12));
        const popTop = Math.max(16, a.rect.top);
        return (
          <div key={`${a.kind}-${i}`}>
            <div
              className={`absolute rounded-lg ring-2 ${copy.color.split(" ").filter(c => c.startsWith("ring-")).join(" ")} pointer-events-none`}
              style={{ top, left, width: w, height: h }}
            />
            <div
              className={`absolute rounded-md border shadow-lg p-2.5 ${copy.color} pointer-events-auto`}
              style={{ top: popTop, left: popLeft, width: POP_W }}
              data-testid={`demo-highlight-${a.kind}`}
            >
              <div className="flex items-start gap-2">
                <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold leading-tight">{copy.title}</div>
                  <p className="text-[11.5px] leading-snug mt-1 opacity-90">{copy.body}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {annotations.length === 0 && (
        <div
          data-testid="demo-highlight-empty"
          className="absolute top-20 right-4 max-w-xs rounded-md border border-amber-300 bg-amber-50 text-amber-900 shadow p-3 pointer-events-auto"
        >
          <div className="flex items-start gap-2">
            <Lightbulb className="w-4 h-4 mt-0.5" />
            <div className="flex-1 text-[12px]">
              <div className="font-semibold">Highlight mode is on</div>
              <p className="leading-snug mt-1">
                Nothing on this page is tagged for explanation. Open a dashboard with alerts, at-risk students, or a recent session log.
              </p>
              <button
                onClick={() => setHighlightMode(false)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 hover:text-amber-900"
                data-testid="button-demo-highlight-dismiss"
              >
                <X className="w-3 h-3" /> Turn off highlight mode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
