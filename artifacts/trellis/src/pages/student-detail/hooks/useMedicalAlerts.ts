import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import type { MedicalAlertRecord } from "../StudentContactsMedical";

export type MaForm = {
  alertType: string;
  description: string;
  severity: string;
  treatmentNotes: string;
  epiPenOnFile: boolean;
  notifyAllStaff: boolean;
};

const EMPTY_MA_FORM: MaForm = {
  alertType: "allergy",
  description: "",
  severity: "mild",
  treatmentNotes: "",
  epiPenOnFile: false,
  notifyAllStaff: false,
};

export function useMedicalAlerts(studentId: number, enabled: boolean) {
  const [medicalAlerts, setMedicalAlerts] = useState<MedicalAlertRecord[]>([]);
  const [medicalAlertsLoading, setMedicalAlertsLoading] = useState(false);
  const [maDialogOpen, setMaDialogOpen] = useState(false);
  const [editingMa, setEditingMa] = useState<MedicalAlertRecord | null>(null);
  const [maSaving, setMaSaving] = useState(false);
  const [deletingMa, setDeletingMa] = useState<MedicalAlertRecord | null>(null);
  const [maForm, setMaForm] = useState<MaForm>(EMPTY_MA_FORM);

  const reload = useCallback(async () => {
    const d = await authFetch(`/api/students/${studentId}/medical-alerts`).then((r: Response) => r.json());
    setMedicalAlerts(Array.isArray(d) ? d : []);
  }, [studentId]);

  useEffect(() => {
    if (!enabled || !studentId) return;
    setMedicalAlertsLoading(true);
    authFetch(`/api/students/${studentId}/medical-alerts`)
      .then((r: Response) => r.json())
      .then((d: MedicalAlertRecord[]) => setMedicalAlerts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setMedicalAlertsLoading(false));
  }, [enabled, studentId]);

  async function handleSaveMa() {
    if (!maForm.description || !maForm.alertType || !maForm.severity) {
      toast.error("Alert type, description, and severity are required");
      return;
    }
    setMaSaving(true);
    try {
      if (editingMa) {
        const r = await authFetch(`/api/medical-alerts/${editingMa.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(maForm),
        });
        if (!r.ok) throw new Error();
        toast.success("Alert updated");
      } else {
        const r = await authFetch(`/api/students/${studentId}/medical-alerts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...maForm, studentId }),
        });
        if (!r.ok) throw new Error();
        toast.success("Alert added");
      }
      setMaDialogOpen(false);
      setEditingMa(null);
      await reload();
    } catch {
      toast.error("Failed to save alert");
    }
    setMaSaving(false);
  }

  async function handleDeleteMa(alert: MedicalAlertRecord) {
    try {
      const r = await authFetch(`/api/medical-alerts/${alert.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Alert removed");
      setDeletingMa(null);
      await reload();
    } catch {
      toast.error("Failed to remove alert");
    }
  }

  function openAddMa() {
    setEditingMa(null);
    setMaForm(EMPTY_MA_FORM);
    setMaDialogOpen(true);
  }

  function openEditMa(alert: MedicalAlertRecord) {
    setEditingMa(alert);
    setMaForm({
      alertType: alert.alertType ?? "allergy",
      description: alert.description ?? "",
      severity: alert.severity ?? "mild",
      treatmentNotes: alert.treatmentNotes ?? "",
      epiPenOnFile: alert.epiPenOnFile ?? false,
      notifyAllStaff: alert.notifyAllStaff ?? false,
    });
    setMaDialogOpen(true);
  }

  return {
    medicalAlerts,
    medicalAlertsLoading,
    maDialogOpen,
    setMaDialogOpen,
    editingMa,
    setEditingMa,
    maSaving,
    deletingMa,
    setDeletingMa,
    maForm,
    setMaForm,
    handleSaveMa,
    handleDeleteMa,
    openAddMa,
    openEditMa,
  };
}
