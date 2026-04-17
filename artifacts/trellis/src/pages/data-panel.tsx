import { useEffect, useState, useCallback, useRef } from "react";
import { LiveDataPanel } from "@/components/live-data-panel/LiveDataPanel";
import type { CollectedGoalEntry } from "@/components/live-data-panel/types";

const CHANNEL_NAME = "trellis-data-panel";

interface PopupMessage {
  type: "data-update" | "popup-ready" | "popup-closed";
  timerId: string;
  entries?: Record<string, CollectedGoalEntry>;
}

export default function DataPanelPage() {
  const params = new URLSearchParams(window.location.search);
  const timerId = params.get("timerId") || "";
  const studentId = Number(params.get("studentId") || "0");
  const studentName = params.get("studentName") || "";
  const startedAt = Number(params.get("startedAt") || "0");

  const [entries, setEntries] = useState<Map<number, CollectedGoalEntry>>(new Map());
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    document.title = `Data: ${studentName}`;
    try {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = ch;
      ch.onmessage = (e: MessageEvent<PopupMessage>) => {
        if (e.data.timerId !== timerId) return;
        if (e.data.type === "data-update" && e.data.entries) {
          const map = new Map<number, CollectedGoalEntry>();
          Object.entries(e.data.entries).forEach(([k, v]) => map.set(Number(k), v));
          setEntries(map);
        }
      };
      ch.postMessage({ type: "popup-ready", timerId } as PopupMessage);
      window.addEventListener("beforeunload", () => {
        ch.postMessage({ type: "popup-closed", timerId } as PopupMessage);
      });
      return () => ch.close();
    } catch {
      return;
    }
  }, [timerId, studentName]);

  const handleEntriesChange = useCallback((newEntries: Map<number, CollectedGoalEntry>) => {
    setEntries(newEntries);
    if (channelRef.current) {
      const obj: Record<string, CollectedGoalEntry> = {};
      newEntries.forEach((v, k) => { obj[String(k)] = v; });
      channelRef.current.postMessage({ type: "data-update", timerId, entries: obj } as PopupMessage);
    }
  }, [timerId]);

  if (!studentId || !timerId) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <p className="text-gray-500">Invalid data panel link. Please open from the timer.</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white">
      <LiveDataPanel
        studentId={studentId}
        studentName={studentName}
        timerStartedAt={startedAt}
        onClose={() => window.close()}
        collectedEntries={entries}
        onEntriesChange={handleEntriesChange}
      />
    </div>
  );
}
