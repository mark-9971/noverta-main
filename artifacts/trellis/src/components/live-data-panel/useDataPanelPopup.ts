import { useEffect, useRef, useCallback, useState } from "react";
import type { CollectedGoalEntry } from "./types";

const CHANNEL_NAME = "trellis-data-panel";

interface PopupMessage {
  type: "data-update" | "popup-ready" | "popup-closed" | "open-popup";
  timerId: string;
  entries?: Record<string, CollectedGoalEntry>;
}

export function useDataPanelSync(
  timerId: string,
  entries: Map<number, CollectedGoalEntry>,
  onEntriesChange: (entries: Map<number, CollectedGoalEntry>) => void,
) {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    try {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = ch;
      ch.onmessage = (e: MessageEvent<PopupMessage>) => {
        if (e.data.timerId !== timerId) return;
        if (e.data.type === "data-update" && e.data.entries) {
          const map = new Map<number, CollectedGoalEntry>();
          Object.entries(e.data.entries).forEach(([k, v]) => map.set(Number(k), v));
          onEntriesChange(map);
        }
      };
      return () => { ch.close(); channelRef.current = null; };
    } catch {
      return;
    }
  }, [timerId, onEntriesChange]);

  const broadcastUpdate = useCallback((newEntries: Map<number, CollectedGoalEntry>) => {
    if (!channelRef.current) return;
    const obj: Record<string, CollectedGoalEntry> = {};
    newEntries.forEach((v, k) => { obj[String(k)] = v; });
    channelRef.current.postMessage({ type: "data-update", timerId, entries: obj } as PopupMessage);
  }, [timerId]);

  return { broadcastUpdate };
}

export function usePopupWindow() {
  const popupRef = useRef<Window | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  const openPopup = useCallback((timerId: string, studentId: number, studentName: string, startedAt: number) => {
    const params = new URLSearchParams({
      timerId, studentId: String(studentId), studentName, startedAt: String(startedAt),
    });
    const url = `${import.meta.env.BASE_URL}data-panel?${params.toString()}`;
    const w = window.open(url, `data-panel-${timerId}`, "width=420,height=700,scrollbars=yes,resizable=yes");
    if (w) {
      popupRef.current = w;
      setIsPopupOpen(true);
      const checkClosed = setInterval(() => {
        if (w.closed) { clearInterval(checkClosed); popupRef.current = null; setIsPopupOpen(false); }
      }, 500);
    }
    return !!w;
  }, []);

  const closePopup = useCallback(() => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
    setIsPopupOpen(false);
  }, []);

  return { openPopup, closePopup, isPopupOpen };
}
