import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type DemoFlowId = "admin" | "coordinator" | "para" | "bcba" | "executive";

const FLOW_KEY = "trellis.demoFlow.v1";
const HIGHLIGHT_KEY = "trellis.demoHighlight.v1";

interface DemoFlowState {
  flowId: DemoFlowId;
  stepIdx: number;
}

interface DemoModeContextValue {
  flow: DemoFlowState | null;
  highlightMode: boolean;
  startFlow: (flowId: DemoFlowId) => void;
  setStep: (idx: number) => void;
  exitFlow: () => void;
  setHighlightMode: (on: boolean) => void;
  toggleHighlightMode: () => void;
}

const DemoModeContext = createContext<DemoModeContextValue | null>(null);

function readFlow(): DemoFlowState | null {
  try {
    const raw = window.localStorage.getItem(FLOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.flowId === "string" && typeof parsed?.stepIdx === "number") {
      return { flowId: parsed.flowId as DemoFlowId, stepIdx: parsed.stepIdx };
    }
  } catch { /* ignore */ }
  return null;
}

function readHighlight(): boolean {
  try { return window.localStorage.getItem(HIGHLIGHT_KEY) === "1"; }
  catch { return false; }
}

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [flow, setFlow] = useState<DemoFlowState | null>(() =>
    typeof window === "undefined" ? null : readFlow(),
  );
  const [highlightMode, setHighlightModeState] = useState<boolean>(() =>
    typeof window === "undefined" ? false : readHighlight(),
  );

  // Sync from other tabs / direct localStorage edits.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === FLOW_KEY) setFlow(readFlow());
      if (e.key === HIGHLIGHT_KEY) setHighlightModeState(readHighlight());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persistFlow = useCallback((next: DemoFlowState | null) => {
    setFlow(next);
    try {
      if (next) window.localStorage.setItem(FLOW_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(FLOW_KEY);
    } catch { /* ignore */ }
  }, []);

  const startFlow = useCallback((flowId: DemoFlowId) => {
    persistFlow({ flowId, stepIdx: 0 });
  }, [persistFlow]);

  const setStep = useCallback((idx: number) => {
    setFlow(prev => {
      if (!prev) return prev;
      const next = { ...prev, stepIdx: idx };
      try { window.localStorage.setItem(FLOW_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const exitFlow = useCallback(() => persistFlow(null), [persistFlow]);

  const setHighlightMode = useCallback((on: boolean) => {
    setHighlightModeState(on);
    try {
      if (on) window.localStorage.setItem(HIGHLIGHT_KEY, "1");
      else window.localStorage.removeItem(HIGHLIGHT_KEY);
    } catch { /* ignore */ }
  }, []);

  const toggleHighlightMode = useCallback(
    () => setHighlightMode(!highlightMode),
    [highlightMode, setHighlightMode],
  );

  return (
    <DemoModeContext.Provider value={{
      flow, highlightMode, startFlow, setStep, exitFlow, setHighlightMode, toggleHighlightMode,
    }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode(): DemoModeContextValue {
  const ctx = useContext(DemoModeContext);
  if (!ctx) {
    // Allow consumers outside the provider to no-op so the runner/overlay
    // can mount conditionally without forcing a provider in test contexts.
    return {
      flow: null,
      highlightMode: false,
      startFlow: () => {},
      setStep: () => {},
      exitFlow: () => {},
      setHighlightMode: () => {},
      toggleHighlightMode: () => {},
    };
  }
  return ctx;
}
