import { useEffect, useRef, useCallback, useState } from "react";
import type { CollectedGoalEntry } from "./types";

const CHANNEL_NAME = "noverta-data-panel";
// Compat alias: dual-broadcast/dual-listen during the rename transition so
// popups opened with the legacy channel name still receive updates. Safe to
// remove after one cycle of popup re-opens.
const LEGACY_CHANNEL_NAME = "trellis-data-panel";

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
  const legacyChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    try {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      const legacyCh = new BroadcastChannel(LEGACY_CHANNEL_NAME);
      channelRef.current = ch;
      legacyChannelRef.current = legacyCh;
      const handler = (e: MessageEvent<PopupMessage>) => {
        if (e.data.timerId !== timerId) return;
        if (e.data.type === "data-update" && e.data.entries) {
          const map = new Map<number, CollectedGoalEntry>();
          Object.entries(e.data.entries).forEach(([k, v]) => map.set(Number(k), v));
          onEntriesChange(map);
        }
      };
      ch.onmessage = handler;
      legacyCh.onmessage = handler;
      return () => {
        ch.close(); legacyCh.close();
        channelRef.current = null; legacyChannelRef.current = null;
      };
    } catch {
      return;
    }
  }, [timerId, onEntriesChange]);

  const broadcastUpdate = useCallback((newEntries: Map<number, CollectedGoalEntry>) => {
    if (!channelRef.current) return;
    const obj: Record<string, CollectedGoalEntry> = {};
    newEntries.forEach((v, k) => { obj[String(k)] = v; });
    const msg: PopupMessage = { type: "data-update", timerId, entries: obj };
    channelRef.current.postMessage(msg);
    // Dual-broadcast on legacy channel so any popup window still listening
    // on the old name keeps receiving updates during the transition.
    legacyChannelRef.current?.postMessage(msg);
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
