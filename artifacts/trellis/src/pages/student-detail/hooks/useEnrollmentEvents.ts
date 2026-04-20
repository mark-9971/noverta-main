import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";

export type EnrollmentEventForm = {
  eventType: string;
  eventDate: string;
  reasonCode: string;
  reason: string;
  notes: string;
};

const EMPTY_FORM: EnrollmentEventForm = {
  eventType: "note",
  eventDate: "",
  reasonCode: "",
  reason: "",
  notes: "",
};

export function useEnrollmentEvents(studentId: number, enabled: boolean) {
  const [enrollmentHistory, setEnrollmentHistory] = useState<any[]>([]);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  const [addEventDialogOpen, setAddEventDialogOpen] = useState(false);
  const [addEventSaving, setAddEventSaving] = useState(false);
  const [addEventForm, setAddEventForm] = useState<EnrollmentEventForm>(EMPTY_FORM);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<any | null>(null);

  const reload = useCallback(async () => {
    const d = await authFetch(`/api/students/${studentId}/enrollment`).then((r: any) => r.json());
    setEnrollmentHistory(Array.isArray(d) ? d : []);
  }, [studentId]);

  useEffect(() => {
    if (!enabled || !studentId) return;
    setEnrollmentLoading(true);
    authFetch(`/api/students/${studentId}/enrollment`)
      .then((r: any) => r.json())
      .then((d: any) => setEnrollmentHistory(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setEnrollmentLoading(false));
  }, [enabled, studentId]);

  async function handleAddEvent() {
    if (!addEventForm.eventType || !addEventForm.eventDate) {
      toast.error("Event type and date are required");
      return;
    }
    setAddEventSaving(true);
    try {
      const body = JSON.stringify({
        eventType: addEventForm.eventType,
        eventDate: addEventForm.eventDate,
        reasonCode: addEventForm.reasonCode || null,
        reason: addEventForm.reason || null,
        notes: addEventForm.notes || null,
      });
      if (editingEvent) {
        const r = await authFetch(`/api/students/${studentId}/enrollment/${editingEvent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!r.ok) throw new Error();
        toast.success("Enrollment event updated");
      } else {
        const r = await authFetch(`/api/students/${studentId}/enrollment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!r.ok) throw new Error();
        toast.success("Enrollment event logged");
      }
      setAddEventDialogOpen(false);
      setEditingEvent(null);
      setAddEventForm(EMPTY_FORM);
      await reload();
    } catch {
      toast.error(editingEvent ? "Failed to update event" : "Failed to log event");
    }
    setAddEventSaving(false);
  }

  function openAddEvent() {
    setEditingEvent(null);
    setAddEventForm({ ...EMPTY_FORM, eventDate: new Date().toISOString().slice(0, 10) });
    setAddEventDialogOpen(true);
  }

  function openEditEvent(ev: any) {
    setEditingEvent(ev);
    setAddEventForm({
      eventType: ev.eventType ?? "note",
      eventDate: ev.eventDate ?? "",
      reasonCode: ev.reasonCode ?? "",
      reason: ev.reason ?? "",
      notes: ev.notes ?? "",
    });
    setAddEventDialogOpen(true);
  }

  async function handleDeleteEvent(ev: any) {
    try {
      const r = await authFetch(`/api/students/${studentId}/enrollment/${ev.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Enrollment event deleted");
      setDeletingEvent(null);
      await reload();
    } catch {
      toast.error("Failed to delete event");
    }
  }

  return {
    enrollmentHistory,
    enrollmentLoading,
    addEventDialogOpen,
    setAddEventDialogOpen,
    addEventSaving,
    addEventForm,
    setAddEventForm,
    editingEvent,
    setEditingEvent,
    deletingEvent,
    setDeletingEvent,
    handleAddEvent,
    openAddEvent,
    openEditEvent,
    handleDeleteEvent,
    reloadEnrollment: reload,
  };
}
