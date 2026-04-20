import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useDemoMode } from "@/lib/demo-mode";
import { useRole } from "@/lib/role-context";
import { useActiveDemoDistrict } from "@/components/DemoBanner";
import { getWalkthrough } from "./walkthroughs";
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";

/**
 * Floating, persistent runner for the demo flow launcher (Panel 2). When a
 * platform admin starts a persona walkthrough from the Demo Control Center,
 * this widget pins to the bottom of the screen across every route, shows the
 * current step, and offers Next / Back / Exit so the runner doesn't have to
 * fumble between routes mid-demo.
 *
 * Strict guards:
 *   - Only renders for platform admins on a demo district. If either guard
 *     fails, the runner exits the flow so we never persist demo navigation
 *     into a non-demo scope.
 */
export function DemoFlowRunner() {
  const { flow, setStep, exitFlow } = useDemoMode();
  const { isPlatformAdmin, role, setRole } = useRole();
  const demoDistrict = useActiveDemoDistrict();
  const [location, navigate] = useLocation();

  // Auto-exit if guards fail. The flow is meaningless outside a demo
  // district / for a non-platform-admin viewer.
  useEffect(() => {
    if (!flow) return;
    if (!isPlatformAdmin || !demoDistrict) exitFlow();
  }, [flow, isPlatformAdmin, demoDistrict, exitFlow]);

  // Keep the persona role aligned with the active flow, and navigate to the
  // step's route. Both are safe no-ops when already aligned.
  useEffect(() => {
    if (!flow) return;
    const wt = getWalkthrough(flow.flowId);
    if (!wt) return;
    if (role !== wt.role) setRole(wt.role);
    const step = wt.steps[flow.stepIdx];
    if (!step) return;
    const [path] = step.path.split("?");
    if (location !== step.path && location !== path) {
      navigate(step.path);
    }
    // We intentionally only react to flow changes, not to location changes
    // — letting the runner re-navigate on every route change would prevent
    // the user from clicking around between steps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow?.flowId, flow?.stepIdx]);

  if (!flow || !isPlatformAdmin || !demoDistrict) return null;
  const wt = getWalkthrough(flow.flowId);
  if (!wt) return null;
  const step = wt.steps[flow.stepIdx];
  if (!step) return null;

  const isFirst = flow.stepIdx === 0;
  const isLast = flow.stepIdx === wt.steps.length - 1;

  return createPortal(
    <div
      role="dialog"
      aria-label={`Demo walkthrough: ${wt.label}`}
      data-testid="demo-flow-runner"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] w-[min(640px,calc(100vw-32px))]"
    >
      <div className="rounded-xl bg-white shadow-2xl border border-amber-200 overflow-hidden">
        <div className="flex items-start gap-3 px-4 pt-3 pb-2 bg-amber-50/80 border-b border-amber-100">
          <div className="flex-shrink-0 w-8 h-8 rounded-md bg-amber-100 flex items-center justify-center">
            <Compass className="w-4 h-4 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-amber-700 uppercase tracking-wide">
              {wt.label} walkthrough · {flow.stepIdx + 1} of {wt.steps.length}
            </div>
            <div className="text-[15px] font-semibold text-gray-900 leading-snug mt-0.5">
              {step.title}
            </div>
          </div>
          <button
            onClick={exitFlow}
            aria-label="Exit walkthrough"
            data-testid="button-demo-flow-exit"
            className="flex-shrink-0 -mr-1 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-amber-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="px-4 py-2.5 text-sm text-gray-600 leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-between px-3 py-2.5 border-t border-gray-100 bg-gray-50/60">
          <button
            onClick={exitFlow}
            data-testid="button-demo-flow-end"
            className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
          >
            End walkthrough
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setStep(Math.max(0, flow.stepIdx - 1))}
              disabled={isFirst}
              data-testid="button-demo-flow-back"
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ArrowLeft className="w-3 h-3" /> Back
            </button>
            <button
              onClick={() => isLast ? exitFlow() : setStep(flow.stepIdx + 1)}
              data-testid="button-demo-flow-next"
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700"
            >
              {isLast ? "Finish" : "Next step"} {!isLast && <ArrowRight className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
