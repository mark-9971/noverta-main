import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus, Bug, Lightbulb, HelpCircle, X, Camera, Loader2, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { getRecentConsoleErrors } from "@/lib/console-error-tracker";
import { cn } from "@/lib/utils";

type FeedbackType = "bug" | "suggestion" | "question";

interface EligibilityResponse {
  enabled: boolean;
  isPilot?: boolean;
  isDemo?: boolean;
}

const TYPES: Array<{ value: FeedbackType; label: string; description: string; icon: typeof Bug; color: string }> = [
  { value: "bug", label: "Bug", description: "Something is broken or wrong", icon: Bug, color: "text-rose-600 bg-rose-50 border-rose-200" },
  { value: "suggestion", label: "Suggestion", description: "An improvement or new idea", icon: Lightbulb, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "question", label: "Question", description: "I'm stuck or need help", icon: HelpCircle, color: "text-sky-600 bg-sky-50 border-sky-200" },
];

// Cap on the screenshot data URL length we send to the server. We rescale and
// re-compress aggressively to stay well under the API's 2 MB hard cap.
const SCREENSHOT_MAX_BYTES = 1_500_000;

import { isScreenshotMode as __isScreenshotMode } from "@/lib/screenshot-mode";
export function FeedbackWidget() {
  if (__isScreenshotMode()) return null;
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<EligibilityResponse>("/pilot-feedback/eligibility")
      .then((res) => { if (!cancelled) setEligible(!!res.enabled); })
      .catch(() => { if (!cancelled) setEligible(false); });
    return () => { cancelled = true; };
  }, []);

  if (!eligible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        aria-label="Send pilot feedback"
        data-testid="open-feedback-widget"
      >
        <MessageSquarePlus className="w-4 h-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<FeedbackType>("bug");
  const [description, setDescription] = useState("");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const consoleErrors = useRef(getRecentConsoleErrors());

  // Try to capture a screenshot once when the modal opens, behind the
  // fade-in so the user sees the modal immediately.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setCapturing(true);
      try {
        const dataUrl = await captureScreenshot();
        if (!cancelled) setScreenshotDataUrl(dataUrl);
      } catch (err) {
        if (!cancelled) setCaptureError(err instanceof Error ? err.message : "Screenshot failed");
      } finally {
        if (!cancelled) setCapturing(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ESC closes; click outside closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function handleSubmit() {
    if (description.trim().length < 3) {
      toast.error("Add a short description so we can help.");
      return;
    }
    setSubmitting(true);
    try {
      await apiPost("/pilot-feedback", {
        type,
        description: description.trim(),
        pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        screenshotDataUrl: includeScreenshot ? screenshotDataUrl : null,
        consoleErrors: consoleErrors.current,
        extraContext: {
          viewport: typeof window !== "undefined"
            ? { width: window.innerWidth, height: window.innerHeight }
            : undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      toast.success("Thanks — we got your feedback. The team will follow up.");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      toast.error(`Could not send feedback: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Send pilot feedback"
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Send pilot feedback</h2>
            <p className="text-xs text-gray-500 mt-0.5">Goes straight to your account manager.</p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
            aria-label="Close"
            disabled={submitting}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Type chooser */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Type</p>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((t) => {
                const active = type === t.value;
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 px-2 py-3 rounded-lg border text-xs font-medium transition-colors",
                      active
                        ? `${t.color} ring-2 ring-offset-1 ring-emerald-500/40`
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    )}
                    data-testid={`feedback-type-${t.value}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              {TYPES.find((t) => t.value === type)?.description}
            </p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="feedback-description" className="block text-xs font-medium text-gray-700 mb-1.5">
              What happened?
            </label>
            <textarea
              id="feedback-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={5000}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:outline-none resize-y"
              placeholder={
                type === "bug"
                  ? "What did you do? What did you expect? What actually happened?"
                  : type === "suggestion"
                  ? "What would help you here?"
                  : "What are you trying to do?"
              }
              autoFocus
              data-testid="feedback-description"
            />
            <p className="text-[11px] text-gray-400 mt-1">{description.length} / 5000</p>
          </div>

          {/* Screenshot */}
          <div className="border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={includeScreenshot}
                  onChange={(e) => setIncludeScreenshot(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  data-testid="feedback-include-screenshot"
                />
                Include screenshot
              </label>
              {capturing && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
            </div>

            {captureError && (
              <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 rounded p-2">
                <ImageOff className="w-3 h-3 flex-shrink-0" />
                <span>Couldn't auto-capture a screenshot ({captureError}). You can still send the rest.</span>
              </div>
            )}

            {includeScreenshot && screenshotDataUrl && (
              <div className="relative">
                <img
                  src={screenshotDataUrl}
                  alt="Captured screenshot preview"
                  className="w-full rounded border border-gray-200 max-h-48 object-contain bg-gray-50"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Auto-captured {Math.round(screenshotDataUrl.length / 1024)} KB
                </p>
              </div>
            )}
            {!screenshotDataUrl && includeScreenshot && !capturing && !captureError && (
              <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                <Camera className="w-3 h-3" /> No screenshot captured yet.
              </p>
            )}
          </div>

          {/* Auto-attached context */}
          <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
            <p className="font-medium text-gray-600">We'll also send:</p>
            <ul className="space-y-0.5 list-disc pl-5">
              <li>Your email and role</li>
              <li>The page you're on ({truncateMiddle(typeof window !== "undefined" ? window.location.pathname : "", 60)})</li>
              <li>Your browser and screen size</li>
              {consoleErrors.current.length > 0 && (
                <li>The {consoleErrors.current.length} most recent in-app error{consoleErrors.current.length === 1 ? "" : "s"}</li>
              )}
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-end gap-2 bg-gray-50">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || description.trim().length < 3}
            className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed flex items-center gap-2"
            data-testid="feedback-submit"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Send feedback
          </button>
        </div>
      </div>
    </div>
  );
}

function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return `${s.slice(0, half)}…${s.slice(s.length - half)}`;
}

// Capture a screenshot of the current page using html-to-image. Rescales the
// output if it would exceed the size cap so we always send something usable.
// html-to-image may fail (e.g. tainted canvases from third-party iframes); the
// caller treats that as a soft failure and lets the user submit without one.
async function captureScreenshot(): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const { toPng } = await import("html-to-image");
  const root = document.body;

  const tryCapture = async (pixelRatio: number, quality: number): Promise<string> => {
    return toPng(root, {
      pixelRatio,
      quality,
      cacheBust: true,
      // Skip the floating widget itself so the screenshot reflects what the
      // user actually sees on the page, not the modal that sits over it.
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.dataset?.feedbackWidget === "true") return false;
        if (node.getAttribute?.("role") === "dialog") return false;
        return true;
      },
    });
  };

  // Step down the pixel ratio until we're under the cap. Most desktops will
  // capture under 500 KB at ratio 1; very large pages may need 0.5.
  for (const ratio of [1, 0.75, 0.5]) {
    try {
      const dataUrl = await tryCapture(ratio, 0.85);
      if (dataUrl.length <= SCREENSHOT_MAX_BYTES) return dataUrl;
    } catch (err) {
      if (ratio === 0.5) throw err;
    }
  }
  return null;
}
